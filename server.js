const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const zlib = require("zlib");

global.window = global;
require("./engine.js");

const root = __dirname;
const port = Number(process.env.PORT || process.argv[2] || 4173);
const isHosted = Boolean(process.env.RENDER || process.env.NODE_ENV === "production");
const envNumber = (name, fallback, min, max) => {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value)));
};
const baseEvolutionDelayMs = envNumber("EVOLVE_DELAY_MS", isHosted ? 900 : 180, 50, 30_000);
const minEvolutionDelayMs = envNumber("MIN_EVOLVE_DELAY_MS", Math.max(120, Math.floor(baseEvolutionDelayMs * 0.6)), 50, 30_000);
const maxEvolutionDelayMs = envNumber("MAX_EVOLVE_DELAY_MS", isHosted ? 12_000 : 5_000, baseEvolutionDelayMs, 60_000);
const memoryLimitMb = envNumber("MEMORY_LIMIT_MB", isHosted ? 2048 : 4096, 256, 65536);
const cpuHighWatermark = Math.max(0.1, Math.min(2, Number(process.env.CPU_HIGH_WATERMARK || 0.82)));
const cpuLowWatermark = Math.max(0.05, Math.min(cpuHighWatermark, Number(process.env.CPU_LOW_WATERMARK || 0.45)));
const serverRuntimeConfig = {
  populationSize: envNumber("POPULATION_SIZE", isHosted ? 16 : 10, 4, 24)
};
const dataDir = path.join(root, "data");
const backupsDir = path.join(dataDir, "backups");
const serverModelPath = path.join(dataDir, "server-model.json");
const serverLastGoodPath = path.join(dataDir, "server-model.last-good.json");
const toolLogPath = path.join(dataDir, "tool-use.log");
const bundledSeedModelPath = path.join(root, "genesis-lab-generation-3431.json");
const { EvolutionLab, DEFAULT_SEED_TEXT, CHAT_PRIMER_TEXT, CONTROL_HUMAN, CONTROL_ASSISTANT, CONTROL_TURN_END, cleanGeneratedText, cleanTrainingText, dialogueTrainingText, chatQualityScore, textEntropy, naturalDialogueScore } = global.GenesisEngine;

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml"
};

let currentJob = null;
let jobQueue = [];
let results = [];
let workerSeen = new Map();
let wsClients = new Set();
let rateBuckets = new Map();
let serverLab = new EvolutionLab(serverRuntimeConfig);
let serverImageTargets = [];
let serverEvolution = {
  running: false,
  delayMs: baseEvolutionDelayMs,
  baseDelayMs: baseEvolutionDelayMs,
  throttle: {
    cpuRatio: 0,
    memoryRatio: 0,
    reason: "starting",
    updatedAt: null
  },
  pressureSample: {
    at: Date.now(),
    cpu: process.cpuUsage()
  },
  lastSavedAt: 0,
  startedAt: null,
  cycles: 0,
  dreams: 0,
  lastDream: null,
  error: null
};

const COMMAND_PATTERN = /\[(SEARCH|WIKI|FETCH):([^\]]{1,500})\]/gi;
const TOOL_RATE_LIMIT = {
  windowMs: 60_000,
  maxRequests: 12
};
const PDF_IMPORT_LIMIT_BYTES = 25 * 1024 * 1024;
const PDF_TEXT_LIMIT_CHARS = 1_200_000;
const MAX_NETWORK_JOBS = 12;
const MAX_NETWORK_RESULTS = 80;
const MIN_SELF_GENERATED_QUALITY = 0.65;
const MIN_SELF_GENERATED_ENTROPY = 0.48;

// Tool-use contract:
// The neural organism is not given an external model. It only learns to emit
// text tokens such as [SEARCH:...] or [WIKI:...]. This server recognizes those
// tokens, executes a small allowlisted tool, and injects clean text back into
// the organism's memory/corpus as sensory input.

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(backupsDir, { recursive: true });

function enforceServerRuntimeLimits() {
  serverLab.setConfig({
    ...serverRuntimeConfig,
    populationSize: serverRuntimeConfig.populationSize
  });
  if (serverLab.population.length > serverLab.config.populationSize) {
    serverLab.population.sort((a, b) => (b.fitness || 0) - (a.fitness || 0));
    serverLab.population = serverLab.population.slice(0, serverLab.config.populationSize);
  }
  for (const genome of serverLab.population) {
    if (genome.neurons > serverLab.config.neurons || genome.synapses > serverLab.config.synapses) {
      genome.resize(Math.min(genome.neurons, serverLab.config.neurons), Math.min(genome.synapses, serverLab.config.synapses));
    }
  }
}

function sampleResourcePressure() {
  const now = Date.now();
  const previous = serverEvolution.pressureSample || { at: now, cpu: process.cpuUsage() };
  const cpuDelta = process.cpuUsage(previous.cpu);
  const elapsedMs = Math.max(1, now - previous.at);
  const cpuRatio = Math.max(0, (cpuDelta.user + cpuDelta.system) / (elapsedMs * 1000));
  const memoryRatio = Math.max(0, Math.min(2, process.memoryUsage().rss / (memoryLimitMb * 1024 * 1024)));
  serverEvolution.pressureSample = { at: now, cpu: process.cpuUsage() };
  return { cpuRatio, memoryRatio };
}

function updateAutoThrottle(tickElapsedMs = 0) {
  const pressure = sampleResourcePressure();
  const busyTick = tickElapsedMs > serverEvolution.delayMs * 0.85;
  let reason = "balanced";
  let nextDelay = serverEvolution.delayMs;
  if (pressure.memoryRatio > 0.88) {
    nextDelay = Math.min(maxEvolutionDelayMs, Math.ceil(nextDelay * 1.8));
    reason = "memory-high";
  } else if (pressure.cpuRatio > cpuHighWatermark || busyTick) {
    const scale = pressure.cpuRatio > 1.05 ? 1.65 : 1.28;
    nextDelay = Math.min(maxEvolutionDelayMs, Math.ceil(nextDelay * scale));
    reason = busyTick ? "tick-slow" : "cpu-high";
  } else if (pressure.cpuRatio < cpuLowWatermark && pressure.memoryRatio < 0.72) {
    nextDelay = Math.max(minEvolutionDelayMs, Math.floor(nextDelay * 0.9));
    reason = "cooling-down";
  } else {
    const drift = nextDelay > serverEvolution.baseDelayMs ? 0.96 : 1.02;
    nextDelay = Math.max(minEvolutionDelayMs, Math.min(maxEvolutionDelayMs, Math.round(nextDelay * drift)));
  }
  serverEvolution.delayMs = nextDelay;
  serverEvolution.throttle = {
    cpuRatio: Number(pressure.cpuRatio.toFixed(3)),
    memoryRatio: Number(pressure.memoryRatio.toFixed(3)),
    memoryMb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
    tickElapsedMs,
    reason,
    updatedAt: new Date().toISOString()
  };
}

function timestampForFile() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function backupCurrentServerModel(label = "backup") {
  if (!fs.existsSync(serverModelPath)) return null;
  const backupPath = path.join(backupsDir, `${timestampForFile()}-${label}.json`);
  fs.copyFileSync(serverModelPath, backupPath);
  fs.copyFileSync(serverModelPath, serverLastGoodPath);
  return backupPath;
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeAtomicJson(filePath, data) {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(data));
  fs.renameSync(tempPath, filePath);
}

function broadcastEvent(type, payload = {}) {
  const message = JSON.stringify({ type, at: new Date().toISOString(), ...payload });
  for (const client of [...wsClients]) {
    try {
      wsSend(client, message);
    } catch {
      wsClients.delete(client);
    }
  }
}

function appendToolLog(entry) {
  const safeEntry = {
    at: new Date().toISOString(),
    ...entry
  };
  fs.appendFile(toolLogPath, `${JSON.stringify(safeEntry)}\n`, () => {});
  broadcastEvent("tool", safeEntry);
}

function cleanText(text, maxLength = 6000) {
  return cleanTrainingText(String(text || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\{\{[^{}]*\}\}/g, " ")
    .replace(/\[\[File:[^\]]+\]\]/gi, " ")
    .replace(/\[\[Category:[^\]]+\]\]/gi, " ")
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&"), maxLength);
}

function decodePdfLiteralString(value) {
  let output = "";
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (char !== "\\") {
      output += char;
      continue;
    }
    const next = value[++i];
    if (next === "n") output += "\n";
    else if (next === "r") output += "\r";
    else if (next === "t") output += "\t";
    else if (next === "b") output += "\b";
    else if (next === "f") output += "\f";
    else if (next === "\r" || next === "\n") {
      if (next === "\r" && value[i + 1] === "\n") i += 1;
    } else if (/[0-7]/.test(next || "")) {
      let octal = next;
      for (let j = 0; j < 2 && /[0-7]/.test(value[i + 1] || ""); j++) octal += value[++i];
      output += String.fromCharCode(parseInt(octal, 8));
    } else if (next) {
      output += next;
    }
  }
  return output;
}

function decodePdfHexString(hex) {
  const clean = hex.replace(/[^0-9a-f]/gi, "");
  if (!clean) return "";
  const bytes = [];
  for (let i = 0; i < clean.length; i += 2) bytes.push(parseInt(clean.slice(i, i + 2).padEnd(2, "0"), 16));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    let text = "";
    for (let i = 2; i + 1 < bytes.length; i += 2) text += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
    return text;
  }
  return Buffer.from(bytes).toString("latin1");
}

function extractPdfTextOperators(source) {
  const chunks = [];
  const blocks = source.match(/BT[\s\S]*?ET/g) || [source];
  for (const block of blocks) {
    const literalPattern = /\((?:\\.|[^\\()])*\)\s*(?:Tj|'|"|\])/g;
    let match;
    while ((match = literalPattern.exec(block))) {
      chunks.push(decodePdfLiteralString(match[0].slice(1, match[0].lastIndexOf(")"))));
      if (chunks.join(" ").length > PDF_TEXT_LIMIT_CHARS) return chunks.join(" ");
    }
    const arrayPattern = /\[(.*?)\]\s*TJ/gs;
    while ((match = arrayPattern.exec(block))) {
      const inner = match[1];
      const pieces = [];
      const piecePattern = /\((?:\\.|[^\\()])*\)|<([0-9a-fA-F\s]+)>/g;
      let piece;
      while ((piece = piecePattern.exec(inner))) {
        if (piece[0].startsWith("(")) pieces.push(decodePdfLiteralString(piece[0].slice(1, -1)));
        else pieces.push(decodePdfHexString(piece[1] || ""));
      }
      if (pieces.length) chunks.push(pieces.join(""));
      if (chunks.join(" ").length > PDF_TEXT_LIMIT_CHARS) return chunks.join(" ");
    }
  }
  return chunks.join(" ");
}

function extractPdfText(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 5 || buffer.slice(0, 5).toString("latin1") !== "%PDF-") {
    throw new Error("That file does not look like a PDF.");
  }
  if (buffer.length > PDF_IMPORT_LIMIT_BYTES) {
    throw new Error("PDF is too large for safe import. Try a smaller file or split it first.");
  }

  const latin = buffer.toString("latin1");
  const sources = [latin];
  const streamPattern = /<<[\s\S]*?\/Filter\s*\/FlateDecode[\s\S]*?>>\s*stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match;
  while ((match = streamPattern.exec(latin))) {
    const start = Buffer.byteLength(latin.slice(0, match.index), "latin1") + Buffer.byteLength(match[0].slice(0, match[0].indexOf("stream") + 6), "latin1");
    let streamStart = start;
    if (buffer[streamStart] === 13 && buffer[streamStart + 1] === 10) streamStart += 2;
    else if (buffer[streamStart] === 10) streamStart += 1;
    const streamEnd = Buffer.byteLength(latin.slice(0, match.index + match[0].lastIndexOf("endstream")), "latin1");
    try {
      sources.push(zlib.inflateSync(buffer.subarray(streamStart, streamEnd)).toString("latin1"));
    } catch {
      // Some PDFs use predictors or uncommon filters; skip streams we cannot safely inflate.
    }
  }

  const text = cleanText(sources.map(extractPdfTextOperators).join("\n"), PDF_TEXT_LIMIT_CHARS);
  if (text.length < 40) {
    throw new Error("Could not extract useful text from this PDF. It may be scanned images or use unsupported compression.");
  }
  return text;
}

function findCommandTokens(text) {
  const commands = [];
  let match;
  COMMAND_PATTERN.lastIndex = 0;
  while ((match = COMMAND_PATTERN.exec(text))) {
    commands.push({
      raw: match[0],
      kind: match[1].toUpperCase(),
      value: match[2].trim()
    });
  }
  return commands.slice(0, 4);
}

function assertToolRateLimit(clientId) {
  const now = Date.now();
  const bucket = rateBuckets.get(clientId) || { resetAt: now + TOOL_RATE_LIMIT.windowMs, count: 0 };
  if (now > bucket.resetAt) {
    bucket.resetAt = now + TOOL_RATE_LIMIT.windowMs;
    bucket.count = 0;
  }
  bucket.count += 1;
  rateBuckets.set(clientId, bucket);
  if (bucket.count > TOOL_RATE_LIMIT.maxRequests) {
    throw new Error("Tool rate limit reached. Try again in a minute.");
  }
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "NeuroGenesis-local-evolution/1.0"
      }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchText(url, limit = 1_000_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "NeuroGenesis-local-evolution/1.0",
        "Accept": "text/html, text/plain;q=0.9, application/json;q=0.5"
      }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    return text.slice(0, limit);
  } finally {
    clearTimeout(timeout);
  }
}

async function wikipediaArticle(title) {
  const api = new URL("https://en.wikipedia.org/w/api.php");
  api.searchParams.set("action", "query");
  api.searchParams.set("prop", "extracts");
  api.searchParams.set("explaintext", "1");
  api.searchParams.set("redirects", "1");
  api.searchParams.set("format", "json");
  api.searchParams.set("titles", title);
  const data = await fetchJson(api);
  const page = Object.values(data?.query?.pages || {})[0];
  if (!page || !page.extract) throw new Error(`No Wikipedia article found for "${title}"`);
  return {
    source: `Wikipedia:${page.title}`,
    text: cleanText(`# ${page.title}\n${page.extract}`, 7000)
  };
}

async function wikipediaSearch(query) {
  const api = new URL("https://en.wikipedia.org/w/api.php");
  api.searchParams.set("action", "query");
  api.searchParams.set("list", "search");
  api.searchParams.set("srsearch", query);
  api.searchParams.set("srlimit", "5");
  api.searchParams.set("format", "json");
  const data = await fetchJson(api);
  const results = (data?.query?.search || []).map((item, index) => {
    return `${index + 1}. ${item.title}: ${cleanText(item.snippet, 300)}`;
  });
  if (!results.length) throw new Error(`No Wikipedia search results for "${query}"`);
  return {
    source: `Wikipedia search:${query}`,
    text: results.join("\n")
  };
}

function isBlockedHost(host) {
  const lower = host.toLowerCase();
  return lower === "localhost"
    || lower.endsWith(".local")
    || lower === "127.0.0.1"
    || lower === "0.0.0.0"
    || lower === "::1"
    || /^10\./.test(lower)
    || /^192\.168\./.test(lower)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(lower);
}

function cleanFetchedText(raw) {
  return cleanText(String(raw || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s{2,}/g, " "), 9000);
}

function validateSafeFetch(rawUrl) {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:") throw new Error("FETCH only accepts HTTPS URLs.");
  const host = url.hostname.toLowerCase();
  if (isBlockedHost(host)) throw new Error("FETCH cannot access local/private network hosts.");
  url.hash = "";
  return url;
}

async function safeFetchPage(rawUrl) {
  const url = validateSafeFetch(rawUrl);
  const text = cleanFetchedText(await fetchText(url));
  if (!text || text.length < 120) throw new Error("Fetched page did not contain enough readable text.");
  return {
    source: `Fetch:${url.hostname}${url.pathname}`,
    text
  };
}

async function webSearch(query) {
  const ddg = new URL("https://duckduckgo.com/html/");
  ddg.searchParams.set("q", query);
  const html = await fetchText(ddg, 650_000);
  const results = [];
  const re = /<a[^>]+class="result__a"[^>]*>([\s\S]*?)<\/a>[\s\S]{0,1200}?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = re.exec(html)) && results.length < 5) {
    const title = cleanFetchedText(match[1]).slice(0, 180);
    const snippet = cleanFetchedText(match[2]).slice(0, 360);
    if (title || snippet) results.push(`${results.length + 1}. ${title}: ${snippet}`);
  }
  if (!results.length) return wikipediaSearch(query);
  return {
    source: `DuckDuckGo:${query}`,
    text: results.join("\n")
  };
}

async function executeToolCommand(command, clientId = "local") {
  assertToolRateLimit(clientId);
  const value = command.value.trim();
  let result;
  if (command.kind === "WIKI") result = await wikipediaArticle(value);
  else if (command.kind === "SEARCH") result = await webSearch(value);
  else if (command.kind === "FETCH") result = await safeFetchPage(value);
  else throw new Error(`Unsupported command ${command.kind}`);

  appendToolLog({
    clientId,
    command: command.kind,
    value,
    source: result.source,
    chars: result.text.length,
    ok: true
  });
  return {
    ...command,
    ...result
  };
}

async function executeToolCommandsFromText(text, clientId = "local") {
  const commands = findCommandTokens(text);
  const results = [];
  for (const command of commands) {
    try {
      results.push(await executeToolCommand(command, clientId));
    } catch (error) {
      appendToolLog({
        clientId,
        command: command.kind,
        value: command.value,
        ok: false,
        error: error.message
      });
      results.push({
        ...command,
        source: "tool-error",
        text: `Tool error for ${command.raw}: ${error.message}`,
        error: error.message
      });
    }
  }
  return results;
}

function toolContext(results) {
  if (!results.length) return "";
  return results.map(result => {
    return `\n[TOOL_RESULT:${result.source}]\n${result.text}\n[/TOOL_RESULT]`;
  }).join("\n");
}

async function serverChat(prompt, options = {}, clientId = "local") {
  const length = Math.max(80, Math.min(1800, Number(options.length || 420)));
  const safePrompt = cleanTrainingText(prompt, 1200) || "Hello";
  const isGreeting = /^(hi|hey|hello|yo|sup)[\s!.?]*$/i.test(safePrompt);
  const temperature = isGreeting
    ? Math.min(0.72, Math.max(0.2, Number(options.temperature || 0.72)))
    : Math.max(0.2, Math.min(1.8, Number(options.temperature || 0.9)));
  const maxToolRounds = Math.max(0, Math.min(3, Number(options.maxToolRounds ?? 2)));
  const primer = `${CHAT_PRIMER_TEXT}\n${CONTROL_HUMAN} ${safePrompt} ${CONTROL_ASSISTANT}`;
  serverLab.best().setVocab(serverLab.vocab);
  serverLab.best().adaptDialogue(primer, isGreeting ? 0.026 : 0.016, isGreeting ? 900 : 650);
  const recalled = serverLab.recallMemory(safePrompt, 4);
  let context = `${cleanTrainingText(serverLab.persistentContext, 1800)}\n${recalled ? `[RECALLED_MEMORY]\n${recalled}\n[/RECALLED_MEMORY]\n` : ""}${primer}`;
  let output = "";
  const toolSteps = [];

  broadcastEvent("thinking", { clientId, phase: "generating" });
  for (let round = 0; round <= maxToolRounds; round++) {
    const generated = cleanGeneratedText(serverLab.best().generate(context + output, Math.ceil(length / (round + 1)), temperature), length);
    output += generated;
    const commands = findCommandTokens(generated);
    if (!commands.length || round === maxToolRounds) break;
    // Search/fetch results are treated as local sensory context. They are not
    // answers from another LLM; the evolving genome must decide to request them
    // by producing the command token itself.
    broadcastEvent("thinking", { clientId, phase: "searching", commands });
    const results = await executeToolCommandsFromText(generated, clientId);
    toolSteps.push(...results);
    const injected = toolContext(results);
    context += `\n${generated}\n${injected}\nContinue using the tool result above:\n`;
    serverLab.remember(injected);
    serverLab.addCorpus(`tool-${Date.now()}`, injected, Math.min(10, serverLab.curriculumLevel + 1));
    serverLab.best().adaptDialogue(`${CONTROL_HUMAN} Use this tool result. ${CONTROL_ASSISTANT} ${injected} ${CONTROL_TURN_END}`, 0.01, 900);
  }

  let cleanedOutput = cleanGeneratedText(output.replace(COMMAND_PATTERN, "").trim(), length);
  if (!cleanedOutput || chatQualityScore(cleanedOutput) < 0.55) {
    cleanedOutput = isGreeting
      ? "Hey. I am awake. My chat vocabulary is cleaned up now, and I am still learning from the local organism."
      : "I am still stabilizing my chat vocabulary. Try a little more text training, then ask again.";
    serverLab.best().setVocab(serverLab.vocab);
  }
  serverLab.remember(`User: ${safePrompt}\nNeuroGenesis: ${cleanedOutput}`);
  saveServerModel(false);
  broadcastEvent("thinking", { clientId, phase: "done", toolSteps: toolSteps.length });
  return {
    text: cleanedOutput,
    raw: output,
    tools: toolSteps,
    serverEvolution: serverSnapshot()
  };
}

async function rewardToolUseProbe() {
  if (serverEvolution.cycles % 30 !== 0) return;
  const probe = "When current factual information is useful, emit one command like [WIKI:Artificial intelligence] or [SEARCH:evolutionary neural networks].";
  const generated = serverLab.best().generate(probe, 180, 0.85);
  const commands = findCommandTokens(generated);
  if (!commands.length) return;
  const results = await executeToolCommandsFromText(generated, "evolution-probe");
  const usefulChars = results.reduce((sum, result) => sum + (result.error ? 0 : result.text.length), 0);
  if (usefulChars > 300) {
    serverLab.best().fitness += Math.min(0.08, usefulChars / 100000);
    serverLab.remember(toolContext(results));
  }
}

function scoreSelfGeneratedPair(prompt, response) {
  const quality = chatQualityScore(response);
  const entropy = textEntropy(response);
  const dialogue = naturalDialogueScore(response);
  const lengthScore = Math.min(1, cleanTrainingText(response).length / 180);
  const novelty = 1 - Math.min(0.9, (serverLab.corpus.match(new RegExp(response.slice(0, 24).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length * 0.2);
  const score = quality * 0.36 + dialogue * 0.28 + entropy * 0.14 + lengthScore * 0.08 + novelty * 0.14;
  return { score, quality, dialogue, entropy, lengthScore, novelty };
}

function runSelfGeneratedDataLoop() {
  if (serverEvolution.cycles % 18 !== 0) return 0;
  const prompts = [
    "Explain what you remember about this training run.",
    "Give a helpful answer about local evolving neural organisms.",
    "Describe how you should use memory and controlled tools.",
    "Answer a user who asks how your learning improves."
  ];
  const candidates = [];
  for (const prompt of prompts) {
    for (let i = 0; i < 2; i++) {
      const response = cleanGeneratedText(serverLab.best().generate(prompt, 320, 0.62 + i * 0.12), 420);
      const scored = scoreSelfGeneratedPair(prompt, response);
      if (
        response
        && scored.score >= MIN_SELF_GENERATED_QUALITY
        && scored.quality >= MIN_SELF_GENERATED_QUALITY
        && scored.dialogue >= 0.58
        && scored.entropy >= MIN_SELF_GENERATED_ENTROPY
      ) {
        candidates.push({ prompt, response, ...scored });
      }
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  const accepted = candidates.slice(0, 3);
  for (const item of accepted) {
    const pair = `${CONTROL_HUMAN} ${item.prompt} ${CONTROL_ASSISTANT} ${item.response} ${CONTROL_TURN_END}`;
    serverLab.addCorpus(`self-generated-${Date.now()}`, pair, Math.min(10, serverLab.curriculumLevel + 1));
    serverLab.remember(`Self-generated training pair score ${item.score.toFixed(2)}, entropy ${item.entropy.toFixed(2)}: ${item.prompt}\n${item.response}`);
    serverLab.best().fitness += Math.min(0.025, item.score * 0.01);
  }
  if (accepted.length) broadcastEvent("evolution", { generation: serverLab.generation, selfGenerated: accepted.length });
  return accepted.length;
}

function runDreamPhase() {
  if (serverEvolution.cycles < 6 || serverEvolution.cycles % 24 !== 0) return null;
  const result = serverLab.dreamReplay({
    count: 8,
    maxChars: serverLab.config.neurons > 1800 ? 900 : 1250,
    maxTokens: serverLab.config.neurons > 1800 ? 340 : 520,
    gradientSteps: Math.max(1, serverLab.config.gradientSteps || 2),
    gradientLearningRate: Math.min(0.03, (serverLab.config.gradientLearningRate || 0.016) * 1.35),
    plasticityBoost: 2.35,
    protectScale: true
  });
  if (!result || !result.dreamed) return null;
  serverEvolution.dreams += 1;
  serverEvolution.lastDream = {
    at: new Date().toISOString(),
    memories: result.dreamed,
    loss: result.loss,
    coherence: result.coherence
  };
  serverLab.remember(`Dream consolidation replayed ${result.dreamed} memory traces. Coherence ${Number(result.coherence || 0).toFixed(2)}, loss ${Number(result.loss || 0).toFixed(3)}.`);
  broadcastEvent("evolution", { generation: serverLab.generation, dream: serverEvolution.lastDream });
  return result;
}

function applyServerModelData(data = {}, source = "model") {
  if (data.corpus) serverLab.setCorpus(data.corpus);
  if (Array.isArray(data.corpora)) serverLab.corpora = data.corpora;
  if (typeof data.persistentContext === "string") serverLab.persistentContext = data.persistentContext;
  if (Array.isArray(data.memoryBank)) serverLab.memoryBank = data.memoryBank.slice(-180);
  if (data.curriculumLevel) serverLab.curriculumLevel = data.curriculumLevel;
  if (data.config) serverLab.setConfig(data.config);
  const champion = data.champion || data.genome || (data.neurons && data.synapses ? data : null);
  if (champion) serverLab.importChampion(champion);
  if (Array.isArray(data.imageTargets)) serverImageTargets = data.imageTargets;
  serverLab.generation = data.generation || serverLab.generation;
  enforceServerRuntimeLimits();
  console.log(`Loaded ${source}: generation ${serverLab.generation}, ${serverLab.best().neurons} neurons, ${serverLab.best().synapses} synapses.`);
}

function loadServerModel() {
  if (!fs.existsSync(serverModelPath) && !fs.existsSync(serverLastGoodPath)) {
    if (fs.existsSync(bundledSeedModelPath)) {
      applyServerModelData(readJsonFile(bundledSeedModelPath), "bundled seed model");
      saveServerModel(true);
    }
    return;
  }
  let data;
  try {
    data = readJsonFile(serverModelPath);
  } catch (error) {
    if (!fs.existsSync(serverLastGoodPath)) throw error;
    data = readJsonFile(serverLastGoodPath);
    fs.copyFileSync(serverLastGoodPath, serverModelPath);
  }
  applyServerModelData(data, "server model");
}

function saveServerModel(force = false) {
  const now = Date.now();
  if (!force && now - serverEvolution.lastSavedAt < 30_000) return;
  const best = serverLab.best();
  const data = {
    format: "genesis-lab-server-model-v1",
    savedAt: new Date().toISOString(),
    corpus: serverLab.corpus,
    corpora: serverLab.corpora,
    persistentContext: serverLab.persistentContext,
    memoryBank: serverLab.memoryBank,
    curriculumLevel: serverLab.curriculumLevel,
    imageTargets: serverImageTargets,
    config: serverLab.config,
    generation: serverLab.generation,
    champion: best.toJSON()
  };
  writeAtomicJson(serverModelPath, data);
  fs.copyFileSync(serverModelPath, serverLastGoodPath);
  serverEvolution.lastSavedAt = now;
}

function serverSnapshot() {
  const best = serverLab.best();
  return {
    running: serverEvolution.running,
    startedAt: serverEvolution.startedAt,
    cycles: serverEvolution.cycles,
    dreams: serverEvolution.dreams,
    lastDream: serverEvolution.lastDream,
    delayMs: serverEvolution.delayMs,
    baseDelayMs: serverEvolution.baseDelayMs,
    throttle: serverEvolution.throttle,
    error: serverEvolution.error,
    savePath: serverModelPath,
    lastGoodPath: serverLastGoodPath,
    backupsPath: backupsDir,
    generation: serverLab.generation,
    corpusChars: serverLab.corpus.length,
    imageTargets: serverImageTargets.length,
    corpora: serverLab.corpora.length,
    curriculumLevel: serverLab.curriculumLevel,
    species: serverLab.species.length,
    population: serverLab.population.length,
    populationTarget: serverLab.config.populationSize,
    maxNeurons: global.GenesisEngine.MAX_NEURONS,
    maxSynapses: global.GenesisEngine.MAX_SYNAPSES,
    neurons: best.neurons,
    synapses: best.synapses,
    vocab: serverLab.vocab.length,
    fitness: best.fitness,
    loss: best.loss,
    coherence: best.coherenceScore || 0,
    dialogue: best.dialogueScore || 0,
    updatedAt: new Date().toISOString()
  };
}

function applyServerPayload(payload = {}) {
  const currentBest = serverLab.best();
  const incomingNeurons = Number(payload.champion?.neurons || payload.config?.neurons || 0);
  const blocksDowngrade = Boolean(payload.champion && currentBest && currentBest.neurons >= 1000 && incomingNeurons < currentBest.neurons * 0.72 && !payload.allowDowngrade);
  if (payload.config && !blocksDowngrade) serverLab.setConfig(payload.config);
  if (Array.isArray(payload.imageTargets)) serverImageTargets = payload.imageTargets.map(target => {
    const size = Number(target.size || 48);
    const rawPixels = target.pixels?.value || target.pixels || [];
    const pixels = Array.isArray(rawPixels)
      ? rawPixels
      : ArrayBuffer.isView(rawPixels)
        ? Array.from(rawPixels)
        : Object.keys(rawPixels).sort((a, b) => Number(a) - Number(b)).map(key => rawPixels[key]);
    return {
      name: String(target.name || "image"),
      size,
      pixels: pixels.map(value => Math.max(0, Math.min(255, Number(value) || 0)))
    };
  }).filter(target => target.pixels.length >= target.size * target.size * 4);
  if (Array.isArray(payload.corpora)) serverLab.corpora = payload.corpora;
  if (typeof payload.persistentContext === "string") serverLab.persistentContext = payload.persistentContext;
  if (Array.isArray(payload.memoryBank)) serverLab.memoryBank = payload.memoryBank.slice(-180);
  if (payload.curriculumLevel) serverLab.curriculumLevel = payload.curriculumLevel;
  if (typeof payload.corpus === "string" && payload.corpus.trim()) serverLab.setCorpus(payload.corpus);
  if (payload.champion && !blocksDowngrade) serverLab.importChampion(payload.champion);
  if (blocksDowngrade) serverEvolution.error = `Blocked downgrade sync: incoming ${incomingNeurons} neurons would replace ${currentBest.neurons}.`;
  enforceServerRuntimeLimits();
  if (Number.isFinite(payload.delayMs)) {
    serverEvolution.baseDelayMs = Math.max(50, Math.min(maxEvolutionDelayMs, payload.delayMs));
    serverEvolution.delayMs = serverEvolution.baseDelayMs;
  }
  return { blockedDowngrade: blocksDowngrade };
}

function startServerEvolution() {
  if (serverEvolution.running) return;
  serverEvolution.running = true;
  serverEvolution.startedAt = serverEvolution.startedAt || new Date().toISOString();
  serverEvolution.error = null;
  setImmediate(serverEvolutionTick);
}

function stopServerEvolution() {
  serverEvolution.running = false;
  saveServerModel(true);
}

async function serverEvolutionTick() {
  if (!serverEvolution.running) return;
  const tickStartedAt = Date.now();
  try {
    enforceServerRuntimeLimits();
    const dialogueText = `${CHAT_PRIMER_TEXT}\n${dialogueTrainingText(`${serverLab.persistentContext}\n${serverLab.corpus}`, serverLab.config.neurons > 1800 ? 900 : 1400)}`;
    serverLab.evolveOnce({
      trainingText: dialogueText,
      dialogueMode: true,
      dialogueMaxChars: serverLab.config.neurons > 1800 ? 900 : 1400,
      mutationMultiplier: 1.0,
      scalarMutation: 0.028,
      imageTargets: serverImageTargets,
      imagePrompt: serverImageTargets[serverEvolution.cycles % Math.max(1, serverImageTargets.length)]?.name || "",
      imageLearningRate: 0.01,
      maxChars: serverLab.config.neurons > 1800 ? 420 : 760
    });
    if ((serverEvolution.cycles + 1) % 100 === 0) {
      const immigrants = serverLab.injectImmigrants(4, 400);
      if (immigrants) broadcastEvent("evolution", { generation: serverLab.generation, immigrants });
    }
    runSelfGeneratedDataLoop();
    runDreamPhase();
    await rewardToolUseProbe();
    serverEvolution.cycles += 1;
    broadcastEvent("evolution", {
      generation: serverLab.generation,
      fitness: serverLab.best().fitness,
      loss: serverLab.best().loss,
      coherence: serverLab.best().coherenceScore || 0,
      dialogue: serverLab.best().dialogueScore || 0,
      neurons: serverLab.best().neurons,
      synapses: serverLab.best().synapses,
      throttle: serverEvolution.throttle
    });
    if (serverEvolution.cycles % 12 === 0) saveServerModel(false);
  } catch (error) {
    serverEvolution.error = error.message;
    serverEvolution.running = false;
    saveServerModel(true);
    return;
  }
  updateAutoThrottle(Date.now() - tickStartedAt);
  setTimeout(serverEvolutionTick, serverEvolution.delayMs);
}

loadServerModel();

function sendJson(res, body, status = 200) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(data),
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
  });
  res.end(data);
}

function wsAcceptKey(key) {
  return require("crypto")
    .createHash("sha1")
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest("base64");
}

function wsSend(socket, message) {
  const data = Buffer.from(message);
  let header;
  if (data.length < 126) {
    header = Buffer.from([0x81, data.length]);
  } else if (data.length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(data.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(data.length), 2);
  }
  socket.write(Buffer.concat([header, data]));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 100_000_000) {
        req.destroy();
        reject(new Error("Body too large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

function readRawBody(req, limitBytes = 10_000_000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let length = 0;
    req.on("data", chunk => {
      length += chunk.length;
      if (length > limitBytes) {
        req.destroy();
        reject(new Error("Upload too large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("error", reject);
    req.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

function localAddresses() {
  const nets = os.networkInterfaces();
  const addresses = [];
  for (const entries of Object.values(nets)) {
    for (const entry of entries || []) {
      if (entry.family === "IPv4" && !entry.internal) {
        addresses.push(`http://${entry.address}:${port}`);
      }
    }
  }
  return addresses;
}

function serveFile(req, res) {
  const requestPath = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
  const normalized = requestPath === "/" ? "/index.html" : requestPath;
  const filePath = path.normalize(path.join(root, normalized));
  const relative = path.relative(root, filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const type = mime[path.extname(filePath).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    sendJson(res, {});
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    if ((url.pathname === "/ping" || url.pathname === "/healthz") && req.method === "GET") {
      res.writeHead(200, {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store"
      });
      res.end("OK");
      return;
    }

    if (url.pathname === "/api/status") {
      const now = Date.now();
      for (const [id, seen] of workerSeen.entries()) {
        if (now - seen > 45_000) workerSeen.delete(id);
      }
      sendJson(res, {
        ok: true,
        workers: workerSeen.size,
        queuedResults: results.length,
        queuedJobs: jobQueue.length,
        hasJob: Boolean(currentJob),
        serverEvolution: serverSnapshot(),
        addresses: localAddresses()
      });
      return;
    }

    if (url.pathname === "/api/server/start" && req.method === "POST") {
      const payload = await readBody(req);
      if (payload.champion || payload.corpus || payload.config) backupCurrentServerModel("before-start-payload");
      const applyResult = applyServerPayload(payload);
      startServerEvolution();
      sendJson(res, { ok: true, ...applyResult, serverEvolution: serverSnapshot() });
      return;
    }

    if (url.pathname === "/api/server/stop" && req.method === "POST") {
      stopServerEvolution();
      sendJson(res, { ok: true, serverEvolution: serverSnapshot() });
      return;
    }

    if (url.pathname === "/api/server/sync" && req.method === "POST") {
      backupCurrentServerModel("before-sync");
      const applyResult = applyServerPayload(await readBody(req));
      saveServerModel(true);
      sendJson(res, { ok: true, ...applyResult, serverEvolution: serverSnapshot() });
      return;
    }

    if (url.pathname === "/api/server/model" && req.method === "GET") {
      saveServerModel(true);
      sendJson(res, {
        ok: true,
        model: {
          format: "genesis-lab-server-model-v1",
          corpus: serverLab.corpus,
          corpora: serverLab.corpora,
          persistentContext: serverLab.persistentContext,
          memoryBank: serverLab.memoryBank,
          curriculumLevel: serverLab.curriculumLevel,
          imageTargets: serverImageTargets,
          config: serverLab.config,
          generation: serverLab.generation,
          champion: serverLab.best().toJSON()
        },
        serverEvolution: serverSnapshot()
      });
      return;
    }

    if (url.pathname === "/api/server/champion" && req.method === "GET") {
      saveServerModel(false);
      const includeCorpus = url.searchParams.get("corpus") !== "0";
      sendJson(res, {
        ok: true,
        model: {
          format: "genesis-lab-server-champion-v2",
          compact: true,
          corpus: includeCorpus ? serverLab.corpus : "",
          corpora: includeCorpus ? serverLab.corpora : [],
          persistentContext: serverLab.persistentContext,
          memoryBank: serverLab.memoryBank,
          curriculumLevel: serverLab.curriculumLevel,
          imageTargets: serverImageTargets,
          config: serverLab.config,
          generation: serverLab.generation,
          champion: serverLab.best().toCompactJSON()
        },
        serverEvolution: serverSnapshot()
      });
      return;
    }

    if (url.pathname === "/api/import/pdf" && req.method === "POST") {
      const name = cleanText(url.searchParams.get("name") || "PDF import", 140) || "PDF import";
      const buffer = await readRawBody(req, PDF_IMPORT_LIMIT_BYTES);
      const text = extractPdfText(buffer);
      sendJson(res, {
        ok: true,
        name,
        text,
        chars: text.length,
        truncated: text.length >= PDF_TEXT_LIMIT_CHARS
      });
      return;
    }

    if (url.pathname === "/api/chat" && req.method === "POST") {
      const payload = await readBody(req);
      const clientId = req.socket.remoteAddress || "local";
      const result = await serverChat(String(payload.prompt || ""), payload, clientId);
      sendJson(res, { ok: true, ...result });
      return;
    }

    if (url.pathname === "/api/tools/execute" && req.method === "POST") {
      const payload = await readBody(req);
      const clientId = req.socket.remoteAddress || "local";
      const text = String(payload.text || "");
      const tools = await executeToolCommandsFromText(text, clientId);
      const injectedContext = toolContext(tools);
      if (injectedContext) {
        serverLab.remember(injectedContext);
        serverLab.addCorpus(`tool-${Date.now()}`, injectedContext, Math.min(10, serverLab.curriculumLevel + 1));
        saveServerModel(false);
      }
      sendJson(res, { ok: true, tools, injectedContext, serverEvolution: serverSnapshot() });
      return;
    }

    if (url.pathname === "/api/tools/log" && req.method === "GET") {
      if (!fs.existsSync(toolLogPath)) {
        sendJson(res, { ok: true, entries: [] });
        return;
      }
      const lines = fs.readFileSync(toolLogPath, "utf8").trim().split(/\r?\n/).filter(Boolean).slice(-80);
      sendJson(res, { ok: true, entries: lines.map(line => JSON.parse(line)) });
      return;
    }

    if (url.pathname === "/api/job" && req.method === "POST") {
      const job = await readBody(req);
      job.createdAt = Date.now();
      job.priority = Number(job.priority || 0);
      jobQueue.push(job);
      jobQueue.sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt);
      if (jobQueue.length > MAX_NETWORK_JOBS) jobQueue = jobQueue.slice(0, MAX_NETWORK_JOBS);
      currentJob = jobQueue[0] || job;
      results = [];
      sendJson(res, { ok: true, jobId: job.id, queuedJobs: jobQueue.length });
      return;
    }

    if (url.pathname === "/api/job" && req.method === "GET") {
      const worker = url.searchParams.get("worker") || "unknown";
      workerSeen.set(worker, Date.now());
      sendJson(res, { ok: true, job: currentJob });
      return;
    }

    if (url.pathname === "/api/result" && req.method === "POST") {
      const result = await readBody(req);
      results.push({ ...result, receivedAt: Date.now() });
      if (results.length > MAX_NETWORK_RESULTS) results = results.slice(-MAX_NETWORK_RESULTS);
      sendJson(res, { ok: true, queuedResults: results.length });
      return;
    }

    if (url.pathname === "/api/results" && req.method === "GET") {
      const drained = results;
      results = [];
      if (jobQueue.length > 1) {
        jobQueue.shift();
        currentJob = jobQueue[0];
      }
      sendJson(res, { ok: true, results: drained });
      return;
    }

    serveFile(req, res);
  } catch (error) {
    sendJson(res, { ok: false, error: error.message }, 500);
  }
});

server.on("upgrade", (req, socket) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname !== "/ws") {
    socket.destroy();
    return;
  }
  const key = req.headers["sec-websocket-key"];
  if (!key) {
    socket.destroy();
    return;
  }
  socket.write([
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${wsAcceptKey(key)}`,
    "",
    ""
  ].join("\r\n"));
  wsClients.add(socket);
  wsSend(socket, JSON.stringify({ type: "connected", at: new Date().toISOString(), serverEvolution: serverSnapshot() }));
  socket.on("close", () => wsClients.delete(socket));
  socket.on("error", () => wsClients.delete(socket));
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Genesis Lab running at http://localhost:${port}`);
  for (const address of localAddresses()) {
    console.log(`LAN address: ${address}`);
  }
  console.log(`Server model path: ${serverModelPath}`);
  if (isHosted) {
    console.log("Hosted mode enabled: using conservative evolution pacing for small cloud instances.");
  }
  if (process.env.AUTO_EVOLVE === "1") {
    startServerEvolution();
    console.log("Server evolution autopilot is running.");
  }
});

process.on("SIGINT", () => {
  stopServerEvolution();
  process.exit(0);
});
