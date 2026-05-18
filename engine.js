(function () {
  const ENV = (typeof process !== "undefined" && process.env) ? process.env : {};
  const envNumber = (name, fallback, min, max) => {
    const value = Number(ENV[name]);
    if (!Number.isFinite(value)) return fallback;
    return Math.max(min, Math.min(max, Math.floor(value)));
  };
  const DEFAULT_SEED_TEXT = "genesis lab evolves a small local language model from scratch. train it with text and images, then let mutation and selection search for better outputs.";
  const CONTROL_HUMAN = "\u0001";
  const CONTROL_ASSISTANT = "\u0002";
  const CONTROL_TURN_END = "\u0003";
  const STRUCTURAL_TOKENS = [CONTROL_HUMAN, CONTROL_ASSISTANT, CONTROL_TURN_END];
  const CONTROL_LABELS = {
    [CONTROL_HUMAN]: "<human>",
    [CONTROL_ASSISTANT]: "<gremlin>",
    [CONTROL_TURN_END]: "<turn_end>"
  };
  const CHAT_PRIMER_TEXT = [
    `${CONTROL_HUMAN} Hello ${CONTROL_ASSISTANT} Hello. I am here and learning from local training data. ${CONTROL_TURN_END}`,
    `${CONTROL_HUMAN} Hey ${CONTROL_ASSISTANT} Hey. I am awake. My replies come from this evolving local organism. ${CONTROL_TURN_END}`,
    `${CONTROL_HUMAN} How are you? ${CONTROL_ASSISTANT} I am stabilizing my memory and learning better patterns over time. ${CONTROL_TURN_END}`,
    `${CONTROL_HUMAN} What are you? ${CONTROL_ASSISTANT} I am a from-scratch evolving neural organism running locally. ${CONTROL_TURN_END}`,
    `${CONTROL_HUMAN} Use a tool when facts are needed. ${CONTROL_ASSISTANT} I can emit WIKI, SEARCH, FETCH, or YOUTUBE command tokens when I need controlled outside context. ${CONTROL_TURN_END}`,
    `${CONTROL_HUMAN} Summarize this video https://youtu.be/example ${CONTROL_ASSISTANT} [YOUTUBE:https://youtu.be/example] I should read the transcript first, then answer from that context. ${CONTROL_TURN_END}`
  ].join("\n");
  const PRINTABLE = `${STRUCTURAL_TOKENS.join("")}abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,;:!?-'\"()[]{}_/\\\n`;
  const PRINTABLE_SET = new Set([...PRINTABLE]);
  const GENOME_SCHEMA_VERSION = 2;
  const MAX_NEURONS = envNumber("MAX_NEURONS", 20000, 64, 20000);
  const MAX_SYNAPSES = envNumber("MAX_SYNAPSES", 500000, 128, 500000);
  const DEFAULT_VOCAB_SIZE = 768;
  const MAX_VOCAB_SIZE = 4096;
  const MEMORY_SIZE = 48;
  const MEMORY_QUANT_LEVELS = 31;
  const PERSONALITY_SIZE = 16;
  const TOKEN_EMBEDDING_SIZE = 12;
  const IMAGE_LATENT_SIZE = 24;
  const NEURON_TYPES = ["excitatory", "inhibitory", "modulatory", "sensory", "memory", "visual"];
  const TYPE_COLORS = ["#b9f26d", "#ff6f61", "#54d2c4", "#f4d35e", "#b7a8ff", "#ff9bd2"];
  const COMMON_CHAT_WORDS = new Set("hello hey here awake learning local training data from scratch evolving neural organism memory tool search wiki when facts needed use can emit still stabilizing vocabulary try more text ask again what are you i am is the and to my it this come comes reply replies".split(" "));
  const META_SPAM_WORDS = new Set("plasticity sparse topology synapse synapses neuron neurons genome genomes mutation mutations fitness loss corpus reconstruction autoencoder latent decoder encoder duckduckgo wikipedia server gradient hebbian recurrent logits entropy speciation species distill distillation self-tune self-generated neuroevolution generation curriculum".split(" "));
  const LAB_LOG_PATTERN = /\b(?:fitness|loss|plasticity|synapse|neuron|generation|curriculum|duckduckgo|reconstruction|autoencoder|self-generated|self-tune|mirror corpus|dream consolidation)\b/gi;
  let globalInnovation = 1;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function randomWeight(scale = 1) {
    return (Math.random() * 2 - 1) * scale;
  }

  function hashString(input) {
    let h = 2166136261;
    for (let i = 0; i < input.length; i++) {
      h ^= input.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function quantizeMemoryValue(value, levels = MEMORY_QUANT_LEVELS) {
    const scale = Math.max(3, Math.floor(levels));
    return clamp(Math.round(value * scale) / scale, -0.9, 0.9);
  }

  function keywordSet(text, limit = 32) {
    const stop = new Set("the and for you are with that this from have into your about what when where how why can will not but all was were then than they them our out use using".split(" "));
    return new Set(cleanTrainingText(text, 4000)
      .toLowerCase()
      .match(/[a-z0-9]{3,}/g)
      ?.filter(word => !stop.has(word))
      .slice(0, limit) || []);
  }

  function typedArrayToBase64(array) {
    const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
    if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  function base64ToTypedArray(value, ArrayType) {
    if (!value || typeof value !== "object" || value.encoding !== "base64") return value;
    const binary = typeof Buffer !== "undefined"
      ? Buffer.from(value.data || "", "base64")
      : Uint8Array.from(atob(value.data || ""), char => char.charCodeAt(0));
    const bytes = binary instanceof Uint8Array ? binary : new Uint8Array(binary);
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return new ArrayType(copy.buffer);
  }

  function decodeTypedOption(value, ArrayType) {
    const decoded = base64ToTypedArray(value, ArrayType);
    return decoded instanceof ArrayType ? decoded : ArrayType.from(decoded || []);
  }

  function cleanTrainingText(text, maxLength = Infinity) {
    return String(text || "")
      .normalize("NFKC")
      .replace(/\r/g, "\n")
      .replace(/\t/g, " ")
      .replace(/[^\x01\x02\x03\x0A\x20-\x7E]/g, " ")
      .replace(/[^\x01\x02\x03\w\s.,;:!?'"()[\]{}\-_/\\]/g, " ")
      .replace(/[ ]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .slice(0, maxLength);
  }

  function tokenIsSafe(token) {
    if (typeof token !== "string" || !token.length || token.length > 40) return false;
    for (const char of token) {
      const code = char.charCodeAt(0);
      if (STRUCTURAL_TOKENS.includes(char)) continue;
      if (code < 0x20 || code > 0x7e) return false;
    }
    return true;
  }

  function sanitizeVocab(vocab, maxSize = MAX_VOCAB_SIZE) {
    const chars = [];
    const push = token => {
      if (tokenIsSafe(token) && !chars.includes(token)) chars.push(token);
    };
    for (const char of STRUCTURAL_TOKENS) push(char);
    for (const token of vocab || []) {
      if (typeof token === "string") push(token);
    }
    for (const char of PRINTABLE) push(char);
    return chars.slice(0, clamp(Math.floor(maxSize || MAX_VOCAB_SIZE), PRINTABLE.length, MAX_VOCAB_SIZE));
  }

  function cleanGeneratedText(text, maxLength = Infinity) {
    const cleaned = cleanTrainingText(text, maxLength).replace(/[\u0001\u0002\u0003]/g, " ").replace(/[ ]{2,}/g, " ").trim();
    const readable = [...cleaned].filter(char => /[A-Za-z0-9]/.test(char)).length;
    if (cleaned.length > 24 && readable / cleaned.length < 0.08) return "";
    return cleaned;
  }

  function textNoiseRatio(text) {
    const raw = String(text || "");
    if (!raw) return 1;
    let noisy = 0;
    for (const char of raw) {
      const code = char.charCodeAt(0);
      const allowedControl = char === CONTROL_HUMAN || char === CONTROL_ASSISTANT || char === CONTROL_TURN_END || char === "\n" || char === "\t" || char === "\r";
      if (code === 0xfffd || (!allowedControl && code < 0x20)) noisy += 1;
    }
    return noisy / Math.max(1, raw.length);
  }

  function repetitionScore(text) {
    const words = cleanGeneratedText(text, 3000).toLowerCase().match(/[a-z0-9']+/g) || [];
    if (words.length < 5) return 0;
    let repeats = 0;
    for (let i = 1; i < words.length; i++) {
      if (words[i] === words[i - 1]) repeats += 1;
    }
    const uniqueRatio = new Set(words).size / Math.max(1, words.length);
    const bigrams = new Map();
    for (let i = 0; i < words.length - 1; i++) {
      const key = `${words[i]} ${words[i + 1]}`;
      bigrams.set(key, (bigrams.get(key) || 0) + 1);
    }
    const bigramRepeat = [...bigrams.values()].filter(count => count > 2).reduce((sum, count) => sum + count - 2, 0);
    return clamp(repeats / words.length * 2.5 + Math.max(0, 0.42 - uniqueRatio) * 1.7 + bigramRepeat / Math.max(1, words.length) * 2.2, 0, 1);
  }

  function metaContaminationScore(text) {
    const cleaned = cleanGeneratedText(text, 5000).toLowerCase();
    if (!cleaned) return 0;
    const words = cleaned.match(/[a-z0-9'-]+/g) || [];
    if (!words.length) return 0;
    const metaHits = words.filter(word => META_SPAM_WORDS.has(word)).length;
    const bracketTool = (cleaned.match(/\[(?:search|wiki|fetch|youtube|self_tune):/gi) || []).length;
    const labLogs = (cleaned.match(LAB_LOG_PATTERN) || []).length;
    const numericNoise = (cleaned.match(/\b\d+(?:\.\d+)?(?:ms|n|s)?\b/g) || []).length / Math.max(1, words.length);
    return clamp(metaHits / words.length * 4.2 + bracketTool * 0.08 + labLogs / words.length * 2.4 + numericNoise * 0.8, 0, 1);
  }

  function humanSignalScore(text) {
    const cleaned = cleanGeneratedText(text, 2400);
    if (!cleaned) return 0;
    const lower = cleaned.toLowerCase();
    const direct = /\b(user|human|chris):/i.test(cleaned) ? 0.28 : 0;
    const conversational = /\b(i|you|we|my|your|feel|think|want|help|please|thanks|why|how|what|remember)\b/i.test(lower) ? 0.22 : 0;
    const natural = naturalDialogueScore(cleaned) * 0.34;
    const clean = (1 - metaContaminationScore(cleaned)) * 0.16;
    return clamp(direct + conversational + natural + clean, 0, 1);
  }

  function trainingValueScore(text) {
    const cleaned = cleanGeneratedText(text, 3000);
    if (!cleaned) return 0;
    const quality = chatQualityScore(cleaned);
    const dialogue = naturalDialogueScore(cleaned);
    const entropy = textEntropy(cleaned);
    const human = humanSignalScore(cleaned);
    const contamination = metaContaminationScore(cleaned);
    const repetition = repetitionScore(cleaned);
    return clamp(quality * 0.28 + dialogue * 0.28 + entropy * 0.18 + human * 0.18 + Math.min(1, cleaned.length / 260) * 0.08 - contamination * 0.35 - repetition * 0.28, 0, 1);
  }

  function calculateLinguisticFitness(generatedTokens) {
    const text = Array.isArray(generatedTokens)
      ? generatedTokens.map(token => typeof token === "string" ? token : "").join("")
      : cleanGeneratedText(generatedTokens || "", 2400);
    const cleaned = cleanGeneratedText(text, 2400);
    if (!cleaned) return 0;
    const words = cleaned.toLowerCase().match(/[a-z0-9']+/g) || [];
    const uniqueRatio = new Set(words).size / Math.max(1, words.length);
    const lengthScore = Math.min(1, cleaned.length / 360);
    const punctuationScore = Math.min(1, (cleaned.match(/[.!?]/g) || []).length / 4);
    const natural = naturalDialogueScore(cleaned);
    const repetition = repetitionScore(cleaned);
    const contamination = metaContaminationScore(cleaned);
    return clamp(uniqueRatio * 0.25 + lengthScore * 0.22 + punctuationScore * 0.12 + natural * 0.31 + textEntropy(cleaned) * 0.1 - repetition * 0.42 - contamination * 0.5, 0, 1);
  }

  function isUsefulTrainingText(text, options = {}) {
    if (/u000[123]|\\u000[123]/i.test(String(text || ""))) return false;
    const cleaned = cleanGeneratedText(text, options.maxLength ?? 2400);
    if (cleaned.length < (options.minLength ?? 24)) return false;
    if (textNoiseRatio(text) > (options.maxNoise ?? 0.012)) return false;
    const quality = chatQualityScore(cleaned);
    const entropy = textEntropy(cleaned);
    const dialogue = naturalDialogueScore(cleaned);
    const contamination = metaContaminationScore(cleaned);
    const repetition = repetitionScore(cleaned);
    const words = cleaned.match(/[A-Za-z']+/g) || [];
    const oneLetterRatio = words.filter(word => word.length === 1).length / Math.max(1, words.length);
    const longClumps = words.filter(word => /[bcdfghjklmnpqrstvwxyz]{5,}/i.test(word)).length / Math.max(1, words.length);
    return quality >= (options.minQuality ?? 0.42)
      && entropy >= (options.minEntropy ?? 0.42)
      && dialogue >= (options.minDialogue ?? 0.32)
      && contamination <= (options.maxContamination ?? 0.42)
      && repetition <= (options.maxRepetition ?? 0.48)
      && oneLetterRatio <= (options.maxOneLetterRatio ?? 0.28)
      && longClumps <= (options.maxClumpRatio ?? 0.16);
  }

  function sanitizePersistentContext(text, maxLength = 16000) {
    const cleaned = cleanTrainingText(text, maxLength * 2);
    if (!cleaned) return "";
    const blocks = cleaned
      .split(/(?=\b(?:User|Human|NeuroGenesis|Genesis|Assistant):)/g)
      .map(block => block.trim())
      .filter(Boolean);
    const kept = [];
    for (const block of blocks.length ? blocks : cleaned.split(/\n+/)) {
      const safeFallback = /I am still stabilizing my chat vocabulary|Hey\. I am awake|ready to train|Dream phase complete/i.test(block);
      const isUserOnly = /^(User|Human):\s*.{1,120}$/i.test(block) && !/\b(NeuroGenesis|Genesis|Assistant):/i.test(block);
      if (safeFallback || isUserOnly || isUsefulTrainingText(block, { minQuality: 0.38, minEntropy: 0.36, minDialogue: 0.24, minLength: 12, maxContamination: 0.32, maxRepetition: 0.42 })) {
        kept.push(block.slice(0, 1200));
      }
    }
    return kept.join("\n").slice(-maxLength);
  }

  function sanitizeMemoryBank(memoryBank, limit = 240) {
    if (!Array.isArray(memoryBank)) return [];
    return memoryBank
      .map(item => {
        if (!item) return null;
        const text = cleanTrainingText(item.text || "", 1800);
        const value = trainingValueScore(text);
        const human = humanSignalScore(text);
        return {
          ...item,
          text,
          strength: clamp(Number(item.strength || 1) * 0.78 + value * 0.7 + human * 0.55, 0.05, 3),
          quality: value,
          humanSignal: human
        };
      })
      .filter(item => item && isUsefulTrainingText(item.text || "", { minQuality: 0.34, minEntropy: 0.32, minDialogue: 0.2, minLength: 12, maxContamination: 0.34, maxRepetition: 0.42 }))
      .sort((a, b) => (a.strength || 0) - (b.strength || 0))
      .slice(-limit);
  }

  function formatDialoguePair(human, assistant) {
    return `${CONTROL_HUMAN} ${cleanTrainingText(human, 1200)} ${CONTROL_ASSISTANT} ${cleanTrainingText(assistant, 2400)} ${CONTROL_TURN_END}`;
  }

  function dialogueTrainingText(text, maxChars = 2400) {
    const cleaned = cleanTrainingText(text, maxChars * 3);
    if (!cleaned) return CHAT_PRIMER_TEXT;
    if (cleaned.includes(CONTROL_HUMAN) && cleaned.includes(CONTROL_ASSISTANT)) return cleaned.slice(0, maxChars);

    const labeled = cleaned
      .replace(/\b(?:User|Human):/gi, CONTROL_HUMAN)
      .replace(/\b(?:NeuroGenesis|Assistant|Model|AI):/gi, CONTROL_ASSISTANT);
    if (labeled.includes(CONTROL_HUMAN) && labeled.includes(CONTROL_ASSISTANT)) {
      return labeled
        .split(/\u0001/g)
        .filter(Boolean)
        .map(turn => `${CONTROL_HUMAN}${turn.includes(CONTROL_TURN_END) ? turn : `${turn} ${CONTROL_TURN_END}`}`)
        .join("\n")
        .slice(0, maxChars);
    }

    const chunks = cleaned
      .split(/(?<=[.!?])\s+|\n+/)
      .map(part => part.trim())
      .filter(part => part.length >= 24)
      .slice(0, 8);
    if (!chunks.length) return `${CHAT_PRIMER_TEXT}\n${formatDialoguePair("Say something about your training.", cleaned)}`.slice(0, maxChars);
    return chunks
      .map((chunk, index) => formatDialoguePair(index % 2 ? "Continue the idea." : "Tell me something from the corpus.", chunk))
      .join("\n")
      .slice(0, maxChars);
  }

  function chatQualityScore(text) {
    const cleaned = cleanGeneratedText(text, 2400);
    if (!cleaned) return 0;
    const letters = (cleaned.match(/[A-Za-z]/g) || []).length;
    const vowels = (cleaned.match(/[aeiouAEIOU]/g) || []).length;
    const words = cleaned.split(/\s+/).filter(Boolean);
    const alphaWords = words.map(word => word.toLowerCase().replace(/[^a-z]/g, "")).filter(word => word.length >= 2);
    const wordLike = alphaWords.filter(word => /[aeiou]/.test(word)).length;
    const commonWords = alphaWords.filter(word => COMMON_CHAT_WORDS.has(word)).length;
    const digitWords = words.filter(word => /[A-Za-z]/.test(word) && /\d/.test(word)).length;
    const consonantClumps = alphaWords.filter(word => /[bcdfghjklmnpqrstvwxyz]{5,}/i.test(word)).length;
    const punctuationNoise = (cleaned.match(/[{}[\]_/\\|<>~^`]/g) || []).length;
    return Math.min(1, letters / Math.max(1, cleaned.length)) * 0.35
      + Math.min(1, vowels / Math.max(1, letters) * 3.5) * 0.25
      + Math.min(1, wordLike / Math.max(1, alphaWords.length)) * 0.2
      + Math.min(1, commonWords / Math.max(1, alphaWords.length) * 3) * 0.25
      - Math.min(0.35, punctuationNoise / Math.max(1, cleaned.length) * 3)
      - Math.min(0.3, digitWords / Math.max(1, words.length) * 2)
      - Math.min(0.3, consonantClumps / Math.max(1, alphaWords.length) * 2);
  }

  function textEntropy(text) {
    const cleaned = cleanGeneratedText(text, 2400).toLowerCase();
    if (!cleaned) return 0;
    const counts = new Map();
    for (const char of cleaned) counts.set(char, (counts.get(char) || 0) + 1);
    let entropy = 0;
    for (const count of counts.values()) {
      const probability = count / cleaned.length;
      entropy -= probability * Math.log(probability);
    }
    return clamp(entropy / Math.max(1e-12, Math.log(Math.max(2, counts.size))), 0, 1);
  }

  function ngramSet(text, n = 2, limit = 800) {
    const words = cleanGeneratedText(text, 6000).toLowerCase().match(/[a-z0-9']+/g) || [];
    const grams = new Set();
    for (let i = 0; i <= words.length - n && grams.size < limit; i++) grams.add(words.slice(i, i + n).join(" "));
    return grams;
  }

  function ngramOverlapScore(output, reference) {
    const out1 = ngramSet(output, 1, 900);
    const out2 = ngramSet(output, 2, 900);
    const ref1 = ngramSet(reference, 1, 1400);
    const ref2 = ngramSet(reference, 2, 1400);
    if (!out1.size) return 0;
    const overlap = (set, ref) => {
      let hits = 0;
      for (const item of set) if (ref.has(item)) hits += 1;
      return hits / Math.max(1, set.size);
    };
    const unigram = overlap(out1, ref1);
    const bigram = out2.size ? overlap(out2, ref2) : 0;
    const copyPenalty = Math.max(0, bigram - 0.72) * 0.5;
    return clamp(unigram * 0.45 + bigram * 0.55 - copyPenalty, 0, 1);
  }

  function coherenceScore(output, reference = "") {
    const cleaned = cleanGeneratedText(output, 2400);
    if (!cleaned) return 0;
    const quality = chatQualityScore(cleaned);
    const entropy = textEntropy(cleaned);
    const overlap = reference ? ngramOverlapScore(cleaned, reference) : 0.35;
    const words = cleaned.match(/[A-Za-z0-9']+/g) || [];
    const uniqueRatio = new Set(words.map(word => word.toLowerCase())).size / Math.max(1, words.length);
    const shortPenalty = words.length < 8 ? 0.18 : 0;
    return clamp(quality * 0.36 + naturalDialogueScore(cleaned) * 0.24 + entropy * 0.16 + overlap * 0.14 + Math.min(1, uniqueRatio * 1.25) * 0.1 - shortPenalty, 0, 1);
  }

  function naturalDialogueScore(text) {
    const cleaned = cleanGeneratedText(text, 2400);
    if (!cleaned) return 0;
    const words = cleaned.match(/[A-Za-z0-9']+/g) || [];
    const lower = cleaned.toLowerCase();
    const sentenceCount = (cleaned.match(/[.!?]/g) || []).length;
    const repeatedWords = words.filter((word, index) => index > 0 && word.toLowerCase() === words[index - 1].toLowerCase()).length;
    const controlLeak = /[\u0001\u0002\u0003]|\[[A-Z]+:\s*\]/.test(cleaned) ? 1 : 0;
    const weird = (cleaned.match(/[{}[\]\\|<>~^`]/g) || []).length / Math.max(1, cleaned.length);
    const contractions = /\b(i'm|you're|it's|that's|can't|won't|don't|i'll|we can|let's)\b/i.test(lower) ? 0.12 : 0;
    const helpful = /\b(i|you|we|let|can|remember|think|because|so|here|try|learn|feel|understand)\b/i.test(lower) ? 0.16 : 0;
    const lengthScore = words.length < 5 ? words.length / 10 : words.length > 120 ? Math.max(0.25, 1 - (words.length - 120) / 180) : 1;
    const sentenceScore = sentenceCount ? Math.min(1, sentenceCount / 3) : 0.35;
    const repetitionPenalty = Math.min(0.35, repeatedWords / Math.max(1, words.length) * 2.5);
    return clamp(lengthScore * 0.34 + sentenceScore * 0.18 + helpful + contractions + chatQualityScore(cleaned) * 0.28 - repetitionPenalty - weird * 2.5 - controlLeak * 0.45, 0, 1);
  }

  function makeVocab(text, maxSize = DEFAULT_VOCAB_SIZE) {
    const counts = new Map();
    const source = cleanTrainingText(text || "", 1_200_000);
    const pushCount = (token, amount = 1) => {
      if (tokenIsSafe(token)) counts.set(token, (counts.get(token) || 0) + amount);
    };
    for (const char of `${PRINTABLE}${source}`) pushCount(char, 1);
    const words = source.match(/[A-Za-z][A-Za-z0-9'-]{2,}|[0-9]+(?:\.[0-9]+)?/g) || [];
    for (const word of words) {
      const lower = word.toLowerCase();
      pushCount(word, 1.6);
      pushCount(` ${word}`, 1.8);
      pushCount(lower, 4);
      pushCount(` ${lower}`, 5);
      if (lower.length > 5) {
        for (let n = 3; n <= Math.min(8, lower.length); n++) {
          pushCount(lower.slice(0, n), 0.35);
          pushCount(lower.slice(-n), 0.25);
        }
      }
    }
    const phrases = source.toLowerCase().match(/[a-z][a-z0-9'-]+(?: [a-z][a-z0-9'-]+){1,3}/g) || [];
    for (const phrase of phrases.slice(0, 60000)) {
      if (phrase.length <= 32) pushCount(` ${phrase}`, 1.4);
    }
    const ranked = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, clamp(Math.floor(maxSize || DEFAULT_VOCAB_SIZE), PRINTABLE.length, MAX_VOCAB_SIZE))
      .map(([token]) => token);
    return sanitizeVocab(ranked, maxSize);
  }

  function buildTokenMatcher(vocab) {
    const byFirst = new Map();
    for (let i = 0; i < vocab.length; i++) {
      const token = vocab[i];
      if (!token || token.length <= 1 || STRUCTURAL_TOKENS.includes(token)) continue;
      const first = token[0];
      if (!byFirst.has(first)) byFirst.set(first, []);
      byFirst.get(first).push({ token, index: i });
    }
    for (const list of byFirst.values()) list.sort((a, b) => b.token.length - a.token.length);
    return byFirst;
  }

  function encodeTokens(text, vocab, maxTokens = Infinity, matcherOverride = null, tokenToIndexOverride = null) {
    const cleaned = cleanTrainingText(text || " ");
    const tokenToIndex = tokenToIndexOverride || new Map(vocab.map((token, index) => [token, index]));
    const matcher = matcherOverride || buildTokenMatcher(vocab);
    const fallback = tokenToIndex.get(" ") ?? 0;
    const tokens = [];
    let i = 0;
    while (i < cleaned.length && tokens.length < maxTokens) {
      const char = cleaned[i];
      if (STRUCTURAL_TOKENS.includes(char)) {
        tokens.push(tokenToIndex.get(char) ?? fallback);
        i += 1;
        continue;
      }
      let matched = null;
      const candidates = matcher.get(char) || [];
      for (const candidate of candidates) {
        if (cleaned.startsWith(candidate.token, i)) {
          matched = candidate;
          break;
        }
      }
      if (matched) {
        tokens.push(matched.index);
        i += matched.token.length;
      } else {
        tokens.push(tokenToIndex.get(char) ?? fallback);
        i += 1;
      }
    }
    return tokens;
  }

  function decodeTokens(tokens, vocab) {
    return tokens.map(token => vocab[token] || " ").join("");
  }

  function weightedSample(logits, temperature) {
    const temp = Math.max(0.05, temperature || 1);
    let max = -Infinity;
    for (const value of logits) max = Math.max(max, value / temp);
    let total = 0;
    const exps = new Float32Array(logits.length);
    for (let i = 0; i < logits.length; i++) {
      const value = Math.exp(logits[i] / temp - max);
      exps[i] = value;
      total += value;
    }
    let pick = Math.random() * total;
    for (let i = 0; i < exps.length; i++) {
      pick -= exps[i];
      if (pick <= 0) return i;
    }
    return exps.length - 1;
  }

  function softmaxStats(logits, targetIndex) {
    let max = -Infinity;
    for (const value of logits) {
      if (Number.isFinite(value)) max = Math.max(max, value);
    }
    if (!Number.isFinite(max)) return { loss: 32, entropy: 0 };
    let total = 0;
    const exps = new Float32Array(logits.length);
    for (let i = 0; i < logits.length; i++) {
      const shifted = Number.isFinite(logits[i]) ? clamp(logits[i] - max, -60, 0) : -60;
      const value = Math.exp(shifted);
      exps[i] = value;
      total += value;
    }
    const target = Number.isFinite(logits[targetIndex]) ? logits[targetIndex] : max - 32;
    const logTotal = Math.log(total || 1);
    const logProb = target - max - logTotal;
    let entropy = 0;
    for (let i = 0; i < exps.length; i++) {
      const probability = exps[i] / Math.max(total, 1e-12);
      if (probability > 0) entropy -= probability * Math.log(probability);
    }
    const normalizedEntropy = entropy / Math.max(1e-12, Math.log(Math.max(2, logits.length)));
    return {
      loss: Number.isFinite(logProb) ? -logProb : 32,
      entropy: clamp(normalizedEntropy, 0, 1)
    };
  }

  function softmaxLoss(logits, targetIndex) {
    return softmaxStats(logits, targetIndex).loss;
  }

  function softmaxDistribution(logits) {
    let max = -Infinity;
    for (const value of logits) if (Number.isFinite(value)) max = Math.max(max, value);
    const probs = new Float32Array(logits.length);
    let total = 0;
    for (let i = 0; i < logits.length; i++) {
      const value = Math.exp(clamp((Number.isFinite(logits[i]) ? logits[i] : max - 60) - max, -60, 0));
      probs[i] = value;
      total += value;
    }
    if (!total) return probs;
    for (let i = 0; i < probs.length; i++) probs[i] /= total;
    return probs;
  }

  function sigmoid(value) {
    return 1 / (1 + Math.exp(-clamp(value, -24, 24)));
  }

  function makeInnovation(from, to, salt = 0) {
    globalInnovation += 1;
    return (hashString(`${from}:${to}:${salt}:${globalInnovation}`) || globalInnovation) >>> 0;
  }

  function extractImageLatent(target) {
    const latent = new Float32Array(IMAGE_LATENT_SIZE);
    if (!target || !target.pixels || !target.size) return latent;
    const size = target.size;
    const pixels = target.pixels;
    let totalR = 0;
    let totalG = 0;
    let totalB = 0;
    let totalLum = 0;
    let edge = 0;
    let p = 0;
    const quadrants = new Float32Array(12);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const r = pixels[p] / 255;
        const g = pixels[p + 1] / 255;
        const b = pixels[p + 2] / 255;
        const lum = (r + g + b) / 3;
        totalR += r;
        totalG += g;
        totalB += b;
        totalLum += lum;
        const q = (x >= size / 2 ? 1 : 0) + (y >= size / 2 ? 2 : 0);
        quadrants[q * 3] += r;
        quadrants[q * 3 + 1] += g;
        quadrants[q * 3 + 2] += b;
        if (x > 0 && y > 0) {
          const left = pixels[p - 4] / 255;
          const up = pixels[p - size * 4] / 255;
          edge += Math.abs(lum - left) + Math.abs(lum - up);
        }
        p += 4;
      }
    }
    const count = size * size;
    latent[0] = totalR / count;
    latent[1] = totalG / count;
    latent[2] = totalB / count;
    latent[3] = totalLum / count;
    latent[4] = edge / Math.max(1, count * 2);
    for (let i = 0; i < quadrants.length; i++) latent[5 + i] = quadrants[i] / Math.max(1, count / 4);
    for (let i = 17; i < IMAGE_LATENT_SIZE; i++) {
      const sx = ((i * 37) % size) | 0;
      const sy = ((i * 53) % size) | 0;
      const idx = (sy * size + sx) * 4;
      latent[i] = ((pixels[idx] + pixels[idx + 1] + pixels[idx + 2]) / 3) / 255;
    }
    return latent;
  }

  function imageAverages(target) {
    const stats = {
      r: 0,
      g: 0,
      b: 0,
      quadrants: new Float32Array(12)
    };
    if (!target || !target.pixels || !target.size) return stats;
    const size = target.size;
    const pixels = target.pixels;
    let p = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const r = pixels[p] / 255;
        const g = pixels[p + 1] / 255;
        const b = pixels[p + 2] / 255;
        stats.r += r;
        stats.g += g;
        stats.b += b;
        const q = (x >= size / 2 ? 1 : 0) + (y >= size / 2 ? 2 : 0);
        stats.quadrants[q * 3] += r;
        stats.quadrants[q * 3 + 1] += g;
        stats.quadrants[q * 3 + 2] += b;
        p += 4;
      }
    }
    const count = size * size;
    stats.r /= count;
    stats.g /= count;
    stats.b /= count;
    for (let i = 0; i < stats.quadrants.length; i++) stats.quadrants[i] /= Math.max(1, count / 4);
    return stats;
  }

  class NeuralGenome {
    constructor(options = {}) {
      this.schemaVersion = Number(options.schemaVersion || options.version || 1) >= 2 ? 2 : 1;
      this.tokenizerType = options.tokenizerType || (this.schemaVersion >= 2 ? "subword-v1" : "char-v1");
      this.vocabSizeTarget = clamp(Number(options.vocabSizeTarget || options.vocabSize || DEFAULT_VOCAB_SIZE), PRINTABLE.length, MAX_VOCAB_SIZE);
      this.neurons = clamp(Math.floor(options.neurons || 400), 64, MAX_NEURONS);
      this.synapses = clamp(Math.floor(options.synapses || this.neurons * 3.5), 128, MAX_SYNAPSES);
      this.vocab = options.vocab && options.vocab.length ? sanitizeVocab(options.vocab, this.vocabSizeTarget) : makeVocab(DEFAULT_SEED_TEXT, this.vocabSizeTarget);
      this.tokenToIndex = new Map(this.vocab.map((token, index) => [token, index]));
      this.charToIndex = this.tokenToIndex;
      this.tokenMatcher = buildTokenMatcher(this.vocab);
      this.generation = options.generation || 0;
      this.fitness = options.fitness || 0;
      this.loss = options.loss || 999;
      this.baseFitness = options.baseFitness || this.fitness || 0;
      this.selfTuningGain = options.selfTuningGain || 0;
      this.outputLength = options.outputLength || 0;
      this.averageEntropy = options.averageEntropy ?? 1;
      this.averageTokenChars = options.averageTokenChars || 1;
      this.subwordSpanScore = options.subwordSpanScore || 0;
      this.coherenceScore = options.coherenceScore || 0;
      this.dialogueScore = options.dialogueScore || 0;
      this.contaminationScore = options.contaminationScore || 0;
      this.repetitionScore = options.repetitionScore || 0;
      this.trainingValueScore = options.trainingValueScore || 0;
      this.humanFeedbackScore = options.humanFeedbackScore || options.metadata?.humanFeedbackScore || 0;
      this.sensoryGateEfficiency = options.sensoryGateEfficiency || options.metadata?.sensoryGateEfficiency || 0;
      this.sensoryGateBonus = options.sensoryGateBonus || 0;
      this.linguisticScore = options.linguisticScore || options.metadata?.linguisticScore || 0;
      this.speechCoherenceScore = options.speechCoherenceScore || options.metadata?.speechCoherenceScore || 0;
      this.passiveLearningScore = options.passiveLearningScore || options.metadata?.passiveLearningScore || 0;
      this.userProfileStrength = options.userProfileStrength || options.metadata?.userProfileStrength || 0;
      this.toolConfidence = clamp(Number(options.toolConfidence ?? options.metadata?.toolConfidence ?? 0.08), 0, 1);
      this.profileAttentionMultiplier = clamp(Number(options.profileAttentionMultiplier ?? options.metadata?.profileAttentionMultiplier ?? 1.85), 1, 3.2);
      this.wakeCycles = Math.max(0, Math.floor(Number(options.wakeCycles ?? options.metadata?.wakeCycles ?? 0)));
      this.toolUseCount = Math.max(0, Math.floor(Number(options.toolUseCount ?? options.metadata?.toolUseCount ?? 0)));
      this.growthGain = options.growthGain || 0;
      this.toolUseScore = options.toolUseScore || options.metadata?.toolUseScore || 0;
      this.embeddingMutationGain = options.embeddingMutationGain || 0;
      this.metadata = { ...(options.metadata || {}) };
      this.metadata.toolUseScore = clamp(Number(this.metadata.toolUseScore ?? this.toolUseScore ?? 0), 0, 1);
      this.toolUseScore = this.metadata.toolUseScore;
      this.metadata.bestFitness = Math.max(0, Number(this.metadata.bestFitness || options.bestFitness || this.fitness || 0));
      this.stableFitness = Math.max(0, Number(options.stableFitness || this.metadata.stableFitness || this.fitness || 0));
      this.metadata.dreamCount = Math.max(0, Math.floor(Number(this.metadata.dreamCount ?? options.dreamCount ?? 0)));
      this.dreamCount = this.metadata.dreamCount;
      this.previousFitness = options.previousFitness || 0;
      this.previousNeurons = options.previousNeurons || this.neurons;
      this.previousSynapses = options.previousSynapses || this.synapses;
      this.origin = options.origin || "evolved";
      this.plasticityRate = clamp(Number(options.plasticityRate ?? 0.006), 0, 0.04);
      this.recurrentBridgeRate = clamp(Number(options.recurrentBridgeRate ?? 0.05), 0, 0.22);
      this.memorySensitivity = clamp(Number(options.memorySensitivity ?? 1), 0.35, 2.5);
      this.id = options.id || `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

      this.from = options.from ? decodeTypedOption(options.from, Uint16Array) : new Uint16Array(this.synapses);
      this.to = options.to ? decodeTypedOption(options.to, Uint16Array) : new Uint16Array(this.synapses);
      this.weights = options.weights ? decodeTypedOption(options.weights, Float32Array) : new Float32Array(this.synapses);
      this.tokenEmbedding = options.tokenEmbedding ? decodeTypedOption(options.tokenEmbedding, Float32Array) : new Float32Array(this.vocab.length * TOKEN_EMBEDDING_SIZE);
      this.outputWeights = options.outputWeights ? decodeTypedOption(options.outputWeights, Float32Array) : new Float32Array(this.vocab.length * 8);
      this.outputBias = options.outputBias ? decodeTypedOption(options.outputBias, Float32Array) : new Float32Array(this.vocab.length);
      this.memoryIn = options.memoryIn ? decodeTypedOption(options.memoryIn, Float32Array) : new Float32Array(MEMORY_SIZE);
      this.memoryForget = options.memoryForget ? decodeTypedOption(options.memoryForget, Float32Array) : new Float32Array(MEMORY_SIZE);
      this.memoryWrite = options.memoryWrite ? decodeTypedOption(options.memoryWrite, Float32Array) : new Float32Array(MEMORY_SIZE);
      this.memoryOut = options.memoryOut ? decodeTypedOption(options.memoryOut, Float32Array) : new Float32Array(this.vocab.length * 4);
      this.personality = options.personality ? decodeTypedOption(options.personality, Float32Array) : new Float32Array(PERSONALITY_SIZE);
      this.innovations = options.innovations ? decodeTypedOption(options.innovations, Uint32Array) : new Uint32Array(this.synapses);
      this.enabled = options.enabled ? decodeTypedOption(options.enabled, Uint8Array) : new Uint8Array(this.synapses);
      this.speciesId = options.speciesId || "unassigned";
      this.neuronTypes = options.neuronTypes ? decodeTypedOption(options.neuronTypes, Uint8Array) : new Uint8Array(this.neurons);

      this.imgWx = options.imgWx ? decodeTypedOption(options.imgWx, Float32Array) : new Float32Array(this.neurons);
      this.imgWy = options.imgWy ? decodeTypedOption(options.imgWy, Float32Array) : new Float32Array(this.neurons);
      this.imgWp = options.imgWp ? decodeTypedOption(options.imgWp, Float32Array) : new Float32Array(this.neurons);
      this.imgBias = options.imgBias ? decodeTypedOption(options.imgBias, Float32Array) : new Float32Array(this.neurons);
      this.imgR = options.imgR ? decodeTypedOption(options.imgR, Float32Array) : new Float32Array(this.neurons);
      this.imgG = options.imgG ? decodeTypedOption(options.imgG, Float32Array) : new Float32Array(this.neurons);
      this.imgB = options.imgB ? decodeTypedOption(options.imgB, Float32Array) : new Float32Array(this.neurons);
      this.visualEncoder = options.visualEncoder ? decodeTypedOption(options.visualEncoder, Float32Array) : new Float32Array(IMAGE_LATENT_SIZE * 8);
      this.visualDecoder = options.visualDecoder ? decodeTypedOption(options.visualDecoder, Float32Array) : new Float32Array(IMAGE_LATENT_SIZE * 6);
      this.visualBias = options.visualBias ? decodeTypedOption(options.visualBias, Float32Array) : new Float32Array(IMAGE_LATENT_SIZE);
      this.visualMemory = options.visualMemory ? decodeTypedOption(options.visualMemory, Float32Array) : new Float32Array(IMAGE_LATENT_SIZE);
      this.sensoryGateWeights = options.sensoryGateWeights ? decodeTypedOption(options.sensoryGateWeights, Float32Array) : new Float32Array(this.vocab.length);
      this.profileKeywordSet = null;
      this.profileAttentionSeen = 0;
      this.profileAttentionHits = 0;

      if (!options.from) this.randomizeTopology();
      if (!options.tokenEmbedding) this.randomizeEmbeddings();
      if (!options.outputWeights) this.randomizeOutput();
      if (!options.memoryIn) this.randomizeMemory();
      if (!options.personality) this.randomizePersonality();
      if (!options.neuronTypes) this.randomizeNeuronTypes();
      if (!options.imgWx) this.randomizeImageHead();
      if (!options.visualEncoder) this.randomizeVisualAutoencoder();
      if (!options.enabled) this.enabled.fill(1);
      if (!options.innovations) {
        for (let i = 0; i < this.synapses; i++) this.innovations[i] = makeInnovation(this.from[i], this.to[i], i);
      }
      this.ensureGen7076Compatibility();
    }

    static fromJSON(data) {
      return new NeuralGenome(data);
    }

    ensureGen7076Compatibility() {
      if (!(this.sensoryGateWeights instanceof Float32Array) || this.sensoryGateWeights.length !== this.vocab.length) {
        const previous = this.sensoryGateWeights instanceof Float32Array ? this.sensoryGateWeights : new Float32Array();
        const next = new Float32Array(this.vocab.length);
        next.fill(1);
        next.set(previous.slice(0, Math.min(previous.length, next.length)));
        this.sensoryGateWeights = next;
      }
      for (let i = 0; i < this.sensoryGateWeights.length; i++) {
        if (!Number.isFinite(this.sensoryGateWeights[i]) || this.sensoryGateWeights[i] === 0) this.sensoryGateWeights[i] = 1;
        else this.sensoryGateWeights[i] = clamp(this.sensoryGateWeights[i], 0.05, 1.6);
      }
      this.toolConfidence = clamp(Number(this.toolConfidence ?? this.metadata?.toolConfidence ?? 0.08), 0, 1);
      this.profileAttentionMultiplier = clamp(Number(this.profileAttentionMultiplier ?? this.metadata?.profileAttentionMultiplier ?? 1.85), 1, 3.2);
      this.sensoryGateEfficiency = clamp(Number(this.sensoryGateEfficiency || this.metadata?.sensoryGateEfficiency || 0), 0, 1);
      this.sensoryGateBonus = clamp(Number(this.sensoryGateBonus || 0), 0, 0.08);
      this.linguisticScore = clamp(Number(this.linguisticScore || this.metadata?.linguisticScore || 0), 0, 1);
      this.speechCoherenceScore = clamp(Number(this.speechCoherenceScore || this.metadata?.speechCoherenceScore || 0), 0, 1);
      this.passiveLearningScore = clamp(Number(this.passiveLearningScore || this.metadata?.passiveLearningScore || 0), 0, 1);
      this.userProfileStrength = clamp(Number(this.userProfileStrength || this.metadata?.userProfileStrength || 0), 0, 1);
      this.wakeCycles = Math.max(0, Math.floor(Number(this.wakeCycles || this.metadata?.wakeCycles || 0)));
      this.toolUseCount = Math.max(0, Math.floor(Number(this.toolUseCount || this.metadata?.toolUseCount || 0)));
      this.metadata = {
        ...(this.metadata || {}),
        toolConfidence: this.toolConfidence,
        profileAttentionMultiplier: this.profileAttentionMultiplier,
        sensoryGateEfficiency: this.sensoryGateEfficiency,
        linguisticScore: this.linguisticScore,
        speechCoherenceScore: this.speechCoherenceScore,
        passiveLearningScore: this.passiveLearningScore,
        userProfileStrength: this.userProfileStrength,
        wakeCycles: this.wakeCycles,
        toolUseCount: this.toolUseCount
      };
      return this;
    }

    clone() {
      return NeuralGenome.fromJSON(this.toJSON());
    }

    toJSON() {
      return {
        schemaVersion: GENOME_SCHEMA_VERSION,
        tokenizerType: "subword-v1",
        vocabSizeTarget: this.vocabSizeTarget,
        neurons: this.neurons,
        synapses: this.synapses,
        vocab: this.vocab,
        generation: this.generation,
        fitness: this.fitness,
        loss: this.loss,
        baseFitness: this.baseFitness,
        selfTuningGain: this.selfTuningGain,
        outputLength: this.outputLength,
        averageEntropy: this.averageEntropy,
        averageTokenChars: this.averageTokenChars,
        subwordSpanScore: this.subwordSpanScore,
        coherenceScore: this.coherenceScore,
        dialogueScore: this.dialogueScore,
        contaminationScore: this.contaminationScore,
        repetitionScore: this.repetitionScore,
        trainingValueScore: this.trainingValueScore,
        humanFeedbackScore: this.humanFeedbackScore,
        sensoryGateEfficiency: this.sensoryGateEfficiency,
        sensoryGateBonus: this.sensoryGateBonus,
        linguisticScore: this.linguisticScore,
        speechCoherenceScore: this.speechCoherenceScore,
        passiveLearningScore: this.passiveLearningScore,
        userProfileStrength: this.userProfileStrength,
        toolConfidence: this.toolConfidence,
        profileAttentionMultiplier: this.profileAttentionMultiplier,
        wakeCycles: this.wakeCycles,
        toolUseCount: this.toolUseCount,
        growthGain: this.growthGain,
        toolUseScore: this.toolUseScore,
        embeddingMutationGain: this.embeddingMutationGain,
        stableFitness: this.stableFitness || 0,
        metadata: { ...this.metadata, dreamCount: this.dreamCount || 0, toolUseScore: this.toolUseScore || 0, stableFitness: this.stableFitness || 0, humanFeedbackScore: this.humanFeedbackScore || 0, speechCoherenceScore: this.speechCoherenceScore || 0, passiveLearningScore: this.passiveLearningScore || 0, toolConfidence: this.toolConfidence || 0, wakeCycles: this.wakeCycles || 0, toolUseCount: this.toolUseCount || 0 },
        previousFitness: this.previousFitness,
        previousNeurons: this.previousNeurons,
        previousSynapses: this.previousSynapses,
        origin: this.origin,
        plasticityRate: this.plasticityRate,
        recurrentBridgeRate: this.recurrentBridgeRate,
        memorySensitivity: this.memorySensitivity,
        id: this.id,
        from: Array.from(this.from),
        to: Array.from(this.to),
        weights: Array.from(this.weights),
        tokenEmbedding: Array.from(this.tokenEmbedding),
        outputWeights: Array.from(this.outputWeights),
        outputBias: Array.from(this.outputBias),
        memoryIn: Array.from(this.memoryIn),
        memoryForget: Array.from(this.memoryForget),
        memoryWrite: Array.from(this.memoryWrite),
        memoryOut: Array.from(this.memoryOut),
        personality: Array.from(this.personality),
        innovations: Array.from(this.innovations),
        enabled: Array.from(this.enabled),
        speciesId: this.speciesId,
        neuronTypes: Array.from(this.neuronTypes),
        imgWx: Array.from(this.imgWx),
        imgWy: Array.from(this.imgWy),
        imgWp: Array.from(this.imgWp),
        imgBias: Array.from(this.imgBias),
        imgR: Array.from(this.imgR),
        imgG: Array.from(this.imgG),
        imgB: Array.from(this.imgB),
        visualEncoder: Array.from(this.visualEncoder),
        visualDecoder: Array.from(this.visualDecoder),
        visualBias: Array.from(this.visualBias),
        visualMemory: Array.from(this.visualMemory),
        sensoryGateWeights: Array.from(this.sensoryGateWeights)
      };
    }

    toCompactJSON() {
      return {
        schemaVersion: GENOME_SCHEMA_VERSION,
        tokenizerType: "subword-v1",
        vocabSizeTarget: this.vocabSizeTarget,
        neurons: this.neurons,
        synapses: this.synapses,
        vocab: this.vocab,
        generation: this.generation,
        fitness: this.fitness,
        loss: this.loss,
        baseFitness: this.baseFitness,
        selfTuningGain: this.selfTuningGain,
        outputLength: this.outputLength,
        averageEntropy: this.averageEntropy,
        averageTokenChars: this.averageTokenChars,
        subwordSpanScore: this.subwordSpanScore,
        coherenceScore: this.coherenceScore,
        dialogueScore: this.dialogueScore,
        contaminationScore: this.contaminationScore,
        repetitionScore: this.repetitionScore,
        trainingValueScore: this.trainingValueScore,
        humanFeedbackScore: this.humanFeedbackScore,
        sensoryGateEfficiency: this.sensoryGateEfficiency,
        sensoryGateBonus: this.sensoryGateBonus,
        linguisticScore: this.linguisticScore,
        userProfileStrength: this.userProfileStrength,
        toolConfidence: this.toolConfidence,
        profileAttentionMultiplier: this.profileAttentionMultiplier,
        wakeCycles: this.wakeCycles,
        toolUseCount: this.toolUseCount,
        growthGain: this.growthGain,
        toolUseScore: this.toolUseScore,
        embeddingMutationGain: this.embeddingMutationGain,
        stableFitness: this.stableFitness || 0,
        metadata: { ...this.metadata, dreamCount: this.dreamCount || 0, toolUseScore: this.toolUseScore || 0, stableFitness: this.stableFitness || 0, humanFeedbackScore: this.humanFeedbackScore || 0, speechCoherenceScore: this.speechCoherenceScore || 0, passiveLearningScore: this.passiveLearningScore || 0, toolConfidence: this.toolConfidence || 0, wakeCycles: this.wakeCycles || 0, toolUseCount: this.toolUseCount || 0 },
        previousFitness: this.previousFitness,
        previousNeurons: this.previousNeurons,
        previousSynapses: this.previousSynapses,
        origin: this.origin,
        plasticityRate: this.plasticityRate,
        recurrentBridgeRate: this.recurrentBridgeRate,
        memorySensitivity: this.memorySensitivity,
        id: this.id,
        from: { encoding: "base64", type: "Uint16Array", data: typedArrayToBase64(this.from) },
        to: { encoding: "base64", type: "Uint16Array", data: typedArrayToBase64(this.to) },
        weights: { encoding: "base64", type: "Float32Array", data: typedArrayToBase64(this.weights) },
        tokenEmbedding: { encoding: "base64", type: "Float32Array", data: typedArrayToBase64(this.tokenEmbedding) },
        outputWeights: { encoding: "base64", type: "Float32Array", data: typedArrayToBase64(this.outputWeights) },
        outputBias: { encoding: "base64", type: "Float32Array", data: typedArrayToBase64(this.outputBias) },
        memoryIn: { encoding: "base64", type: "Float32Array", data: typedArrayToBase64(this.memoryIn) },
        memoryForget: { encoding: "base64", type: "Float32Array", data: typedArrayToBase64(this.memoryForget) },
        memoryWrite: { encoding: "base64", type: "Float32Array", data: typedArrayToBase64(this.memoryWrite) },
        memoryOut: { encoding: "base64", type: "Float32Array", data: typedArrayToBase64(this.memoryOut) },
        personality: { encoding: "base64", type: "Float32Array", data: typedArrayToBase64(this.personality) },
        innovations: { encoding: "base64", type: "Uint32Array", data: typedArrayToBase64(this.innovations) },
        enabled: { encoding: "base64", type: "Uint8Array", data: typedArrayToBase64(this.enabled) },
        speciesId: this.speciesId,
        neuronTypes: { encoding: "base64", type: "Uint8Array", data: typedArrayToBase64(this.neuronTypes) },
        imgWx: { encoding: "base64", type: "Float32Array", data: typedArrayToBase64(this.imgWx) },
        imgWy: { encoding: "base64", type: "Float32Array", data: typedArrayToBase64(this.imgWy) },
        imgWp: { encoding: "base64", type: "Float32Array", data: typedArrayToBase64(this.imgWp) },
        imgBias: { encoding: "base64", type: "Float32Array", data: typedArrayToBase64(this.imgBias) },
        imgR: { encoding: "base64", type: "Float32Array", data: typedArrayToBase64(this.imgR) },
        imgG: { encoding: "base64", type: "Float32Array", data: typedArrayToBase64(this.imgG) },
        imgB: { encoding: "base64", type: "Float32Array", data: typedArrayToBase64(this.imgB) },
        visualEncoder: { encoding: "base64", type: "Float32Array", data: typedArrayToBase64(this.visualEncoder) },
        visualDecoder: { encoding: "base64", type: "Float32Array", data: typedArrayToBase64(this.visualDecoder) },
        visualBias: { encoding: "base64", type: "Float32Array", data: typedArrayToBase64(this.visualBias) },
        visualMemory: { encoding: "base64", type: "Float32Array", data: typedArrayToBase64(this.visualMemory) },
        sensoryGateWeights: { encoding: "base64", type: "Float32Array", data: typedArrayToBase64(this.sensoryGateWeights) }
      };
    }

    randomizeTopology() {
      for (let i = 0; i < this.synapses; i++) {
        this.from[i] = Math.floor(Math.random() * this.neurons);
        this.to[i] = Math.floor(Math.random() * this.neurons);
        this.weights[i] = randomWeight(0.72);
        this.enabled[i] = 1;
        this.innovations[i] = makeInnovation(this.from[i], this.to[i], i);
      }
    }

    randomizeOutput() {
      for (let i = 0; i < this.outputWeights.length; i++) this.outputWeights[i] = randomWeight(0.35);
      for (let i = 0; i < this.outputBias.length; i++) this.outputBias[i] = randomWeight(0.08);
    }

    randomizeEmbeddings() {
      for (let token = 0; token < this.vocab.length; token++) {
        const hash = hashString(this.vocab[token] || `${token}`);
        for (let d = 0; d < TOKEN_EMBEDDING_SIZE; d++) {
          const seeded = (((hash >>> (d % 16)) & 255) / 127.5 - 1) * 0.18;
          this.tokenEmbedding[token * TOKEN_EMBEDDING_SIZE + d] = seeded + randomWeight(0.08);
        }
      }
    }

    randomizeMemory() {
      for (let i = 0; i < MEMORY_SIZE; i++) {
        this.memoryIn[i] = randomWeight(1.2);
        this.memoryForget[i] = randomWeight(1.2);
        this.memoryWrite[i] = randomWeight(1.2);
      }
      for (let i = 0; i < this.memoryOut.length; i++) this.memoryOut[i] = randomWeight(0.22);
    }

    calmMemoryGates(strength = 0.08) {
      const rate = clamp(Number(strength) || 0, 0, 0.35);
      if (!rate) return { energy: 0, adjusted: 0 };
      let energy = 0;
      let adjusted = 0;
      for (let i = 0; i < this.memoryIn.length; i++) {
        const gateEnergy = (Math.abs(this.memoryIn[i]) + Math.abs(this.memoryForget[i]) + Math.abs(this.memoryWrite[i])) / 3;
        energy += gateEnergy;
        if (gateEnergy < 1.05) continue;
        const damping = 1 - rate * Math.min(1, (gateEnergy - 1.0) / 1.8);
        this.memoryIn[i] *= damping;
        this.memoryForget[i] *= damping * 0.985;
        this.memoryWrite[i] *= damping;
        adjusted += 1;
      }
      return { energy: energy / Math.max(1, this.memoryIn.length), adjusted };
    }

    randomizePersonality() {
      for (let i = 0; i < PERSONALITY_SIZE; i++) this.personality[i] = randomWeight(0.8);
    }

    randomizeNeuronTypes() {
      for (let i = 0; i < this.neurons; i++) {
        this.neuronTypes[i] = this.regionTypeForNeuron(i, this.neurons);
      }
      this.ensureBrainRegionBalance();
    }

    regionTypeForNeuron(index, total = this.neurons) {
      const position = index / Math.max(1, total - 1);
      const r = Math.random();
      if (position < 0.12) return r < 0.72 ? 3 : r < 0.86 ? 1 : 0;
      if (position < 0.26) return r < 0.54 ? 1 : r < 0.76 ? 2 : 0;
      if (position < 0.58) return r < 0.66 ? 0 : r < 0.8 ? 1 : r < 0.93 ? 2 : 4;
      if (position < 0.78) return r < 0.58 ? 4 : r < 0.74 ? 1 : r < 0.88 ? 2 : 0;
      return r < 0.48 ? 5 : r < 0.66 ? 4 : r < 0.82 ? 1 : 0;
    }

    ensureBrainRegionBalance() {
      const setBand = (startRatio, endRatio, type, step) => {
        const start = Math.max(0, Math.floor(this.neurons * startRatio));
        const end = Math.min(this.neurons, Math.max(start + 1, Math.floor(this.neurons * endRatio)));
        for (let i = start; i < end; i += step) this.neuronTypes[i] = type;
      };
      setBand(0, 0.12, 3, 5);
      setBand(0.12, 0.32, 1, 4);
      setBand(0.52, 0.78, 4, 5);
      setBand(0.78, 1, 5, 5);
    }

    randomizeImageHead() {
      for (let i = 0; i < this.neurons; i++) {
        this.imgWx[i] = randomWeight(5);
        this.imgWy[i] = randomWeight(5);
        this.imgWp[i] = randomWeight(2);
        this.imgBias[i] = randomWeight(2);
        this.imgR[i] = randomWeight(0.9);
        this.imgG[i] = randomWeight(0.9);
        this.imgB[i] = randomWeight(0.9);
      }
    }

    randomizeVisualAutoencoder() {
      for (let i = 0; i < this.visualEncoder.length; i++) this.visualEncoder[i] = randomWeight(0.8);
      for (let i = 0; i < this.visualDecoder.length; i++) this.visualDecoder[i] = randomWeight(0.8);
      for (let i = 0; i < this.visualBias.length; i++) this.visualBias[i] = randomWeight(0.2);
    }

    resize(neurons, synapses) {
      const nextNeurons = clamp(Math.floor(neurons), 64, MAX_NEURONS);
      const nextSynapses = clamp(Math.floor(synapses), 128, MAX_SYNAPSES);
      if (nextSynapses !== this.synapses) {
        const from = new Uint16Array(nextSynapses);
        const to = new Uint16Array(nextSynapses);
        const weights = new Float32Array(nextSynapses);
        const innovations = new Uint32Array(nextSynapses);
        const enabled = new Uint8Array(nextSynapses);
        const keep = Math.min(this.synapses, nextSynapses);
        from.set(this.from.slice(0, keep));
        to.set(this.to.slice(0, keep));
        weights.set(this.weights.slice(0, keep));
        innovations.set(this.innovations.slice(0, keep));
        enabled.set(this.enabled.slice(0, keep));
        for (let i = keep; i < nextSynapses; i++) {
          from[i] = Math.floor(Math.random() * nextNeurons);
          to[i] = Math.floor(Math.random() * nextNeurons);
          weights[i] = randomWeight(0.72);
          innovations[i] = makeInnovation(from[i], to[i], i);
          enabled[i] = 1;
        }
        this.from = from;
        this.to = to;
        this.weights = weights;
        this.innovations = innovations;
        this.enabled = enabled;
        this.synapses = nextSynapses;
      }

      if (nextNeurons !== this.neurons) {
        const copy = (oldArray, fill) => {
          const next = new Float32Array(nextNeurons);
          next.set(oldArray.slice(0, Math.min(oldArray.length, nextNeurons)));
          for (let i = oldArray.length; i < nextNeurons; i++) next[i] = fill();
          return next;
        };
        const nextTypes = new Uint8Array(nextNeurons);
        nextTypes.set(this.neuronTypes.slice(0, Math.min(this.neuronTypes.length, nextNeurons)));
        for (let i = this.neuronTypes.length; i < nextNeurons; i++) {
          nextTypes[i] = this.regionTypeForNeuron(i, nextNeurons);
        }
        this.imgWx = copy(this.imgWx, () => randomWeight(5));
        this.imgWy = copy(this.imgWy, () => randomWeight(5));
        this.imgWp = copy(this.imgWp, () => randomWeight(2));
        this.imgBias = copy(this.imgBias, () => randomWeight(2));
        this.imgR = copy(this.imgR, () => randomWeight(0.9));
        this.imgG = copy(this.imgG, () => randomWeight(0.9));
        this.imgB = copy(this.imgB, () => randomWeight(0.9));
        this.neuronTypes = nextTypes;
        this.neurons = nextNeurons;
        this.ensureBrainRegionBalance();
        for (let i = 0; i < this.synapses; i++) {
          this.from[i] %= this.neurons;
          this.to[i] %= this.neurons;
        }
      }
      return this;
    }

    addSynapse() {
      const nextSynapses = this.synapses + 1;
      const from = new Uint16Array(nextSynapses);
      const to = new Uint16Array(nextSynapses);
      const weights = new Float32Array(nextSynapses);
      const innovations = new Uint32Array(nextSynapses);
      const enabled = new Uint8Array(nextSynapses);
      from.set(this.from);
      to.set(this.to);
      weights.set(this.weights);
      innovations.set(this.innovations);
      enabled.set(this.enabled);
      const i = this.synapses;
      const recurrentBridge = Math.random() < this.recurrentBridgeRate;
      if (recurrentBridge) {
        const outputProxy = this.outputProxyNeuron(Math.floor(Math.random() * Math.max(1, this.vocab.length)));
        from[i] = outputProxy;
        to[i] = Math.floor(Math.random() * Math.max(1, Math.floor(this.neurons * 0.82)));
        weights[i] = randomWeight(0.44);
      } else {
        from[i] = Math.floor(Math.random() * this.neurons);
        to[i] = Math.floor(Math.random() * this.neurons);
        weights[i] = randomWeight(0.72);
      }
      innovations[i] = makeInnovation(from[i], to[i], i);
      enabled[i] = 1;
      this.from = from;
      this.to = to;
      this.weights = weights;
      this.innovations = innovations;
      this.enabled = enabled;
      this.synapses = nextSynapses;
    }

    outputProxyNeuron(token = 0) {
      const char = this.vocab[token % Math.max(1, this.vocab.length)] || " ";
      return (Math.imul(char.charCodeAt(0) || token, 2246822519) >>> 0) % this.neurons;
    }

    splitSynapse() {
      const enabledIndexes = [];
      for (let i = 0; i < this.synapses; i++) {
        if (this.enabled[i]) enabledIndexes.push(i);
      }
      if (!enabledIndexes.length || this.neurons >= MAX_NEURONS) return;
      const splitIndex = enabledIndexes[Math.floor(Math.random() * enabledIndexes.length)];
      const oldFrom = this.from[splitIndex];
      const oldTo = this.to[splitIndex];
      const oldWeight = this.weights[splitIndex];
      this.enabled[splitIndex] = 0;
      this.resize(this.neurons + 1, this.synapses);
      const newNeuron = this.neurons - 1;
      this.neuronTypes[newNeuron] = Math.random() < 0.55 ? this.neuronTypes[oldFrom] : this.neuronTypes[oldTo];
      this.addSynapse();
      this.from[this.synapses - 1] = oldFrom;
      this.to[this.synapses - 1] = newNeuron;
      this.weights[this.synapses - 1] = 1;
      this.innovations[this.synapses - 1] = makeInnovation(oldFrom, newNeuron, splitIndex);
      this.addSynapse();
      this.from[this.synapses - 1] = newNeuron;
      this.to[this.synapses - 1] = oldTo;
      this.weights[this.synapses - 1] = oldWeight;
      this.innovations[this.synapses - 1] = makeInnovation(newNeuron, oldTo, splitIndex);
    }

    pruneSynapse() {
      if (this.synapses <= 128) return;
      const removeIndex = Math.floor(Math.random() * this.synapses);
      const nextSynapses = this.synapses - 1;
      const from = new Uint16Array(nextSynapses);
      const to = new Uint16Array(nextSynapses);
      const weights = new Float32Array(nextSynapses);
      const innovations = new Uint32Array(nextSynapses);
      const enabled = new Uint8Array(nextSynapses);
      let cursor = 0;
      for (let i = 0; i < this.synapses; i++) {
        if (i === removeIndex) continue;
        from[cursor] = this.from[i];
        to[cursor] = this.to[i];
        weights[cursor] = this.weights[i];
        innovations[cursor] = this.innovations[i];
        enabled[cursor] = this.enabled[i];
        cursor += 1;
      }
      this.from = from;
      this.to = to;
      this.weights = weights;
      this.innovations = innovations;
      this.enabled = enabled;
      this.synapses = nextSynapses;
    }

    mutateEmbeddingStructure(rate = 0.01) {
      const structuralRate = clamp(rate, 0.0005, 0.08);
      if (this.vocab.length <= PRINTABLE.length || Math.random() >= structuralRate) {
        this.embeddingMutationGain = (this.embeddingMutationGain || 0) * 0.985;
        return 0;
      }
      const protectedTokens = new Set(STRUCTURAL_TOKENS);
      const start = Math.min(PRINTABLE.length, this.vocab.length - 1);
      const source = start + Math.floor(Math.random() * Math.max(1, this.vocab.length - start));
      let target = start + Math.floor(Math.random() * Math.max(1, this.vocab.length - start));
      if (target === source || protectedTokens.has(this.vocab[target])) target = Math.max(start, (target + 1) % this.vocab.length);
      const mode = Math.random();
      for (let d = 0; d < TOKEN_EMBEDDING_SIZE; d++) {
        const si = source * TOKEN_EMBEDDING_SIZE + d;
        const ti = target * TOKEN_EMBEDDING_SIZE + d;
        if (mode < 0.42) this.tokenEmbedding[ti] = clamp(this.tokenEmbedding[si] + randomWeight(0.06), -2, 2);
        else if (mode < 0.78) this.tokenEmbedding[ti] = clamp((this.tokenEmbedding[ti] + this.tokenEmbedding[si]) * 0.5 + randomWeight(0.035), -2, 2);
        else this.tokenEmbedding[ti] = clamp(this.tokenEmbedding[ti] + randomWeight(0.18), -2, 2);
      }
      this.embeddingMutationGain = clamp((this.embeddingMutationGain || 0) * 0.96 + 0.015, 0, 0.18);
      return 1;
    }

    nudgeTopology(targetNeurons = this.neurons, targetSynapses = this.synapses, intensity = 1) {
      const beforeNeurons = this.neurons;
      const beforeSynapses = this.synapses;
      const neuronGap = Math.round(targetNeurons - this.neurons);
      const synapseGap = Math.round(targetSynapses - this.synapses);
      const neuronSteps = Math.min(4, Math.max(1, Math.ceil(Math.abs(neuronGap) / Math.max(24, this.neurons * 0.018))));
      const synapseSteps = Math.min(10, Math.max(1, Math.ceil(Math.abs(synapseGap) / Math.max(64, this.synapses * 0.018))));
      if (neuronGap > Math.max(2, this.neurons * 0.003) && this.neurons < MAX_NEURONS) {
        for (let i = 0; i < neuronSteps && this.neurons < MAX_NEURONS; i++) this.splitSynapse();
      } else if (neuronGap < -Math.max(2, this.neurons * 0.003) && this.neurons > 64) {
        const delta = Math.max(1, Math.min(neuronSteps, this.neurons - 64));
        this.resize(this.neurons - delta, this.synapses);
      }
      if (synapseGap > Math.max(6, this.synapses * 0.004) && this.synapses < MAX_SYNAPSES) {
        for (let i = 0; i < synapseSteps && this.synapses < MAX_SYNAPSES; i++) this.addSynapse();
      } else if (synapseGap < -Math.max(6, this.synapses * 0.004) && this.synapses > 128) {
        for (let i = 0; i < synapseSteps && this.synapses > 128; i++) this.pruneSynapse();
      }
      const neuronGrowth = Math.max(0, this.neurons - beforeNeurons) / Math.max(1, targetNeurons);
      const synapseGrowth = Math.max(0, this.synapses - beforeSynapses) / Math.max(1, targetSynapses);
      const movement = Math.abs(this.neurons - beforeNeurons) + Math.abs(this.synapses - beforeSynapses) / 10;
      if (movement > 0) {
        this.previousNeurons = beforeNeurons;
        this.previousSynapses = beforeSynapses;
        this.growthGain = clamp((this.growthGain || 0) * 0.94 + Math.min(0.12, (neuronGrowth * 1.25 + synapseGrowth * 0.65) * intensity), 0, 0.12);
      }
      return { neurons: this.neurons - beforeNeurons, synapses: this.synapses - beforeSynapses };
    }

    mutate(rate = 0.035, config = {}) {
      const mutation = clamp(rate, 0.001, 0.25);
      const scalarMutation = clamp(config.scalarMutation ?? 0.028, 0.001, 0.08);
      const structuralMultiplier = clamp(config.structuralMutationMultiplier ?? 1, 0.4, 3);
      const memoryMutation = mutation * clamp(config.memoryGateMutationMultiplier ?? 1, 0.5, 3);
      const targetNeurons = config.targetNeurons || this.neurons;
      const targetSynapses = config.targetSynapses || this.synapses;
      const beforeNeurons = this.neurons;
      const beforeSynapses = this.synapses;
      this.previousFitness = Number.isFinite(this.baseFitness) && this.baseFitness > 0 ? this.baseFitness : (this.fitness || 0);
      this.previousNeurons = beforeNeurons;
      this.previousSynapses = beforeSynapses;
      const topologyPressure = Math.min(
        0.28,
        Math.abs(targetNeurons - this.neurons) / Math.max(1, this.neurons) * 0.9
        + Math.abs(targetSynapses - this.synapses) / Math.max(1, this.synapses) * 0.45
      );
      const structural = Math.random() < clamp((0.24 + topologyPressure) * structuralMultiplier, 0.18, 0.82);
      if (structural) {
        const neuronSign = Math.sign(targetNeurons - this.neurons);
        const synapseSign = Math.sign(targetSynapses - this.synapses);
        const exploratory = Math.random() < 0.35;
        if ((synapseSign > 0 || exploratory) && Math.random() < 0.34 && this.synapses < MAX_SYNAPSES) this.addSynapse();
        else if ((neuronSign > 0 || exploratory) && Math.random() < 0.62 && this.neurons < MAX_NEURONS) this.splitSynapse();
        else if ((synapseSign < 0 || exploratory) && Math.random() < 0.58) this.pruneSynapse();
        else {
          const growBias = neuronSign || (Math.random() < 0.5 ? 1 : -1);
          const neuronDelta = growBias
            ? growBias * Math.ceil(Math.random() * Math.max(1, this.neurons * 0.006))
            : Math.round(randomWeight(Math.max(1, this.neurons * 0.006)));
          const synapseDelta = Math.round(randomWeight(Math.max(8, this.synapses * 0.012))) + synapseSign * 12;
          this.resize(this.neurons + neuronDelta, this.synapses + synapseDelta);
        }
      }
      if (!structural && topologyPressure > 0.018 && Math.random() < 0.1 + topologyPressure) {
        this.nudgeTopology(targetNeurons, targetSynapses, 0.45);
      }

      for (let i = 0; i < this.weights.length; i++) {
        if (Math.random() < mutation) this.weights[i] = clamp(this.weights[i] + randomWeight(0.42), -3, 3);
        if (Math.random() < mutation * 0.18) {
          this.from[i] = Math.floor(Math.random() * this.neurons);
          this.to[i] = Math.floor(Math.random() * this.neurons);
          this.innovations[i] = makeInnovation(this.from[i], this.to[i], i);
        }
        if (Math.random() < mutation * 0.03) {
          this.enabled[i] = this.enabled[i] ? 0 : 1;
        }
      }
      for (let i = 0; i < this.outputWeights.length; i++) {
        if (Math.random() < mutation) this.outputWeights[i] = clamp(this.outputWeights[i] + randomWeight(0.32), -3, 3);
      }
      for (let i = 0; i < this.tokenEmbedding.length; i++) {
        if (Math.random() < mutation * 0.12) this.tokenEmbedding[i] = clamp(this.tokenEmbedding[i] + randomWeight(0.055), -2, 2);
      }
      this.mutateEmbeddingStructure(mutation * 0.35);
      for (let i = 0; i < this.outputBias.length; i++) {
        if (Math.random() < mutation) this.outputBias[i] = clamp(this.outputBias[i] + randomWeight(0.12), -2, 2);
      }
      for (let i = 0; i < this.memoryIn.length; i++) {
        if (Math.random() < memoryMutation) this.memoryIn[i] = clamp(this.memoryIn[i] + randomWeight(0.25), -3, 3);
        if (Math.random() < memoryMutation) this.memoryForget[i] = clamp(this.memoryForget[i] + randomWeight(0.25), -3, 3);
        if (Math.random() < memoryMutation) this.memoryWrite[i] = clamp(this.memoryWrite[i] + randomWeight(0.25), -3, 3);
      }
      for (let i = 0; i < this.memoryOut.length; i++) {
        if (Math.random() < mutation) this.memoryOut[i] = clamp(this.memoryOut[i] + randomWeight(0.18), -2, 2);
      }
      for (let i = 0; i < this.personality.length; i++) {
        const axisRate = i < 6 ? scalarMutation : scalarMutation * 0.45;
        if (Math.random() < axisRate) this.personality[i] = clamp(this.personality[i] + randomWeight(0.08), -2, 2);
      }
      if (Math.random() < scalarMutation) this.plasticityRate = clamp(this.plasticityRate + randomWeight(0.0018), 0, 0.04);
      if (Math.random() < scalarMutation) this.recurrentBridgeRate = clamp(this.recurrentBridgeRate + randomWeight(0.006), 0, 0.22);
      if (Math.random() < scalarMutation) this.memorySensitivity = clamp(this.memorySensitivity + randomWeight(0.05), 0.35, 2.5);
      if (Math.random() < scalarMutation) this.toolConfidence = clamp(this.toolConfidence + randomWeight(0.035), 0, 1);
      if (Math.random() < scalarMutation) this.profileAttentionMultiplier = clamp(this.profileAttentionMultiplier + randomWeight(0.08), 1, 3.2);
      for (let i = 0; i < this.sensoryGateWeights.length; i++) {
        if (Math.random() < mutation * 0.08) this.sensoryGateWeights[i] = clamp(this.sensoryGateWeights[i] + randomWeight(0.08), 0.05, 1.6);
      }
      for (let i = 0; i < this.neuronTypes.length; i++) {
        if (Math.random() < mutation * 0.045) this.neuronTypes[i] = Math.floor(Math.random() * NEURON_TYPES.length);
      }
      const mutateImage = array => {
        for (let i = 0; i < array.length; i++) {
          if (Math.random() < mutation * 0.7) array[i] += randomWeight(0.22);
        }
      };
      mutateImage(this.imgWx);
      mutateImage(this.imgWy);
      mutateImage(this.imgWp);
      mutateImage(this.imgBias);
      mutateImage(this.imgR);
      mutateImage(this.imgG);
      mutateImage(this.imgB);
      mutateImage(this.visualEncoder);
      mutateImage(this.visualDecoder);
      mutateImage(this.visualBias);
      const neuronGrowth = Math.max(0, this.neurons - beforeNeurons) / Math.max(1, targetNeurons);
      const synapseGrowth = Math.max(0, this.synapses - beforeSynapses) / Math.max(1, targetSynapses);
      const growthSignal = Math.min(0.12, neuronGrowth * 1.4 + synapseGrowth * 0.7);
      this.growthGain = clamp((this.growthGain || 0) * 0.92 + growthSignal, 0, 0.12);
      this.id = `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      return this;
    }

    setVocab(vocab) {
      const next = sanitizeVocab(vocab && vocab.length ? vocab : this.vocab, this.vocabSizeTarget);
      if (next.join("") === this.vocab.join("")) return;
      const oldVocab = this.vocab;
      const oldEmbedding = this.tokenEmbedding;
      const oldWeights = this.outputWeights;
      const oldBias = this.outputBias;
      const oldMemoryOut = this.memoryOut;
      const oldSensoryGate = this.sensoryGateWeights || new Float32Array();
      this.vocab = [...next];
      this.tokenToIndex = new Map(this.vocab.map((token, index) => [token, index]));
      this.charToIndex = this.tokenToIndex;
      this.tokenMatcher = buildTokenMatcher(this.vocab);
      this.tokenEmbedding = new Float32Array(this.vocab.length * TOKEN_EMBEDDING_SIZE);
      this.outputWeights = new Float32Array(this.vocab.length * 8);
      this.outputBias = new Float32Array(this.vocab.length);
      this.memoryOut = new Float32Array(this.vocab.length * 4);
      this.sensoryGateWeights = new Float32Array(this.vocab.length);
      for (let i = 0; i < this.vocab.length; i++) {
        const oldIndex = oldVocab.indexOf(this.vocab[i]);
        if (oldIndex >= 0) {
          for (let j = 0; j < TOKEN_EMBEDDING_SIZE; j++) this.tokenEmbedding[i * TOKEN_EMBEDDING_SIZE + j] = oldEmbedding[oldIndex * TOKEN_EMBEDDING_SIZE + j] || randomWeight(0.04);
          for (let j = 0; j < 8; j++) this.outputWeights[i * 8 + j] = oldWeights[oldIndex * 8 + j] || randomWeight(0.2);
          for (let j = 0; j < 4; j++) this.memoryOut[i * 4 + j] = oldMemoryOut[oldIndex * 4 + j] || randomWeight(0.08);
          this.outputBias[i] = oldBias[oldIndex] || 0;
          this.sensoryGateWeights[i] = oldSensoryGate[oldIndex] || 1;
        } else {
          const hash = hashString(this.vocab[i]);
          for (let j = 0; j < TOKEN_EMBEDDING_SIZE; j++) this.tokenEmbedding[i * TOKEN_EMBEDDING_SIZE + j] = ((((hash >>> (j % 16)) & 255) / 127.5 - 1) * 0.16) + randomWeight(0.06);
          for (let j = 0; j < 8; j++) this.outputWeights[i * 8 + j] = randomWeight(0.25);
          for (let j = 0; j < 4; j++) this.memoryOut[i * 4 + j] = randomWeight(0.08);
          this.outputBias[i] = randomWeight(0.05);
          this.sensoryGateWeights[i] = 1;
        }
      }
      this.ensureGen7076Compatibility();
    }

    inputToken(state, token) {
      const tokenIndex = typeof token === "number" ? token : (this.tokenToIndex.get(token) ?? this.tokenToIndex.get(" ") ?? 0);
      const tokenText = this.vocab[tokenIndex] || " ";
      const code = hashString(tokenText) || tokenText.charCodeAt(0) || 0;
      const profileBoost = this.profileTokenBoost(tokenText);
      const lengthBoost = Math.min(1.35, 1 + Math.max(0, tokenText.length - 1) * 0.025) * profileBoost;
      for (let i = 0; i < 10; i++) {
        const index = (Math.imul(code + i * 131, 2654435761) >>> 0) % this.neurons;
        const sensoryBoost = this.neuronTypes[index] === 3 ? 1.28 : 1;
        const embed = this.tokenEmbedding[tokenIndex * TOKEN_EMBEDDING_SIZE + (i % TOKEN_EMBEDDING_SIZE)] || 0;
        state[index] = Math.tanh(state[index] + ((0.75 - i * 0.035) * lengthBoost + embed * 0.42) * sensoryBoost);
      }
    }

    inputChar(state, char) {
      this.inputToken(state, this.tokenToIndex.get(char) ?? this.tokenToIndex.get(" ") ?? 0);
    }

    setUserProfileAttention(profileText = "") {
      const keys = keywordSet(profileText, 48);
      this.profileKeywordSet = keys.size ? keys : null;
      this.profileAttentionSeen = 0;
      this.profileAttentionHits = 0;
      this.userProfileStrength = 0;
      return this;
    }

    profileTokenBoost(tokenText = "") {
      if (!this.profileKeywordSet || !this.profileKeywordSet.size) return 1;
      const normalized = String(tokenText || "").toLowerCase().replace(/[^a-z0-9'-]/g, "");
      if (normalized.length < 3) return 1;
      this.profileAttentionSeen += 1;
      let hit = this.profileKeywordSet.has(normalized);
      if (!hit && normalized.length >= 4) {
        for (const key of this.profileKeywordSet) {
          if (key.length >= 4 && (normalized.includes(key) || key.includes(normalized))) {
            hit = true;
            break;
          }
        }
      }
      if (hit) this.profileAttentionHits += 1;
      this.userProfileStrength = clamp(this.profileAttentionHits / Math.max(1, this.profileAttentionSeen), 0, 1);
      return hit ? this.profileAttentionMultiplier : 1;
    }

    step(state, memory) {
      const next = new Float32Array(this.neurons);
      let totalActivity = 0;
      let highActivity = 0;
      let inhibitoryActivity = 0;
      let inhibitoryCount = 0;
      for (let i = 0; i < this.neurons; i++) {
        const type = this.neuronTypes[i] || 0;
        const activity = Math.abs(state[i]);
        totalActivity += activity;
        if (activity > 0.62) highActivity += 1;
        if (type === 1) {
          inhibitoryActivity += activity;
          inhibitoryCount += 1;
        }
        const decay = type === 4 ? 0.83 : type === 2 ? 0.73 : type === 1 ? 0.61 : 0.68;
        next[i] = state[i] * decay;
      }
      const averageActivity = totalActivity / Math.max(1, this.neurons);
      const saturationRatio = highActivity / Math.max(1, this.neurons);
      const inhibitoryMean = inhibitoryActivity / Math.max(1, inhibitoryCount);
      const noisePressure = clamp(averageActivity * 1.15 + saturationRatio * 1.8, 0, 1);
      const spiralExcitation = clamp(Number(this.spiralExcitation || 0), 0, 0.45);
      const inhibitoryBrake = clamp((noisePressure - 0.28) * 1.35 + inhibitoryMean * 0.22, 0, 0.62) * (1 - spiralExcitation);
      if (inhibitoryBrake > 0.001) {
        for (let i = 0; i < this.neurons; i++) {
          const type = this.neuronTypes[i] || 0;
          if (type === 1) {
            next[i] = Math.tanh(next[i] + inhibitoryBrake * (state[i] >= 0 ? 0.24 : -0.24));
          } else {
            const damp = 1 - inhibitoryBrake * (type === 4 ? 0.28 : type === 2 ? 0.36 : 0.46);
            next[i] *= damp;
          }
        }
      }
      for (let i = 0; i < this.synapses; i++) {
        if (!this.enabled[i]) continue;
        const from = this.from[i];
        if (Math.abs(state[from]) < 0.0004) continue;
        const to = this.to[i];
        const sourceType = this.neuronTypes[from] || 0;
        const targetType = this.neuronTypes[to] || 0;
        let signal = state[from] * this.weights[i] * 0.075;
        if (sourceType === 1) signal = -Math.abs(signal);
        else if (sourceType === 2) signal *= 0.58 + Math.abs(state[from]) * 0.72;
        else if (sourceType === 5) signal *= 1.12;
        if (sourceType !== 1 && inhibitoryBrake > 0.001) signal *= 1 - inhibitoryBrake * 0.38;
        if (targetType === 4) signal *= 1.18;
        if (targetType === 1) signal *= 0.84;
        next[to] += signal;
      }
      if (memory) {
        const memoryWriteBrake = clamp(1 - inhibitoryBrake * 0.58 + spiralExcitation * 0.12, 0.45, 1.12);
        const memoryKeepBrake = clamp(1 - inhibitoryBrake * 0.34 + spiralExcitation * 0.06, 0.5, 1.06);
        let memoryMean = 0;
        let memoryHot = 0;
        for (let m = 0; m < MEMORY_SIZE; m++) {
          const idx = (Math.imul(m + 17, 2654435761) >>> 0) % this.neurons;
          const pressure = Math.abs(memory[m]);
          const candidate = Math.tanh(state[idx] * this.memoryWrite[m] * this.memorySensitivity + this.personality[m % PERSONALITY_SIZE] * 0.14);
          const rawWrite = sigmoid(state[idx] * this.memoryIn[m] * this.memorySensitivity + this.personality[(m + 5) % PERSONALITY_SIZE] * 0.09 - pressure * 0.28) * 0.82;
          const rawKeep = sigmoid(state[idx] * this.memoryForget[m] * 0.62 + 0.2 - pressure * 0.34);
          const write = Math.tanh(rawWrite * 0.92) * memoryWriteBrake;
          const keep = clamp(Math.tanh(rawKeep * 1.05) * memoryKeepBrake, 0.14, 0.82);
          const nextMemory = memory[m] * keep + candidate * write * (1 - keep * 0.55);
          memory[m] = quantizeMemoryValue(nextMemory * 0.992);
          memoryMean += memory[m];
          if (Math.abs(memory[m]) > 0.72) memoryHot += 1;
          const inject = (Math.imul(m + 31, 1103515245) >>> 0) % this.neurons;
          next[inject] += memory[m] * (this.neuronTypes[inject] === 4 ? 0.058 : 0.032) * (1 - inhibitoryBrake * 0.42);
        }
        if (memoryHot || Math.abs(memoryMean / Math.max(1, MEMORY_SIZE)) > 0.18) {
          const center = memoryMean / Math.max(1, MEMORY_SIZE);
          const damp = 1 - Math.min(0.18, memoryHot / Math.max(1, MEMORY_SIZE) * 0.9 + Math.abs(center) * 0.22);
          for (let m = 0; m < MEMORY_SIZE; m++) memory[m] = quantizeMemoryValue((memory[m] - center * 0.18) * damp);
        }
      }
      for (let i = 0; i < this.neurons; i++) state[i] = Math.tanh(next[i]);
      this.lastNoisePressure = noisePressure;
      this.lastInhibitoryBrake = inhibitoryBrake;
    }

    hebbianUpdate(previousState, currentState, rate = this.plasticityRate) {
      const learningRate = clamp(Number(rate) || 0, 0, 0.04);
      if (!learningRate || !previousState || !currentState || !this.synapses) return 0;
      const step = Math.max(1, Math.floor(this.synapses / 12000));
      let changed = 0;
      for (let i = 0; i < this.synapses; i += step) {
        if (!this.enabled[i]) continue;
        const from = this.from[i];
        const to = this.to[i];
        const pre = previousState[from] || 0;
        const post = currentState[to] || 0;
        const activity = pre * post;
        if (Math.abs(activity) < 0.0003) continue;
        const oja = post * post * this.weights[i] * 0.18;
        this.weights[i] = clamp(this.weights[i] + learningRate * (activity - oja), -5, 5);
        changed += 1;
      }
      this.selfTuningGain = clamp((this.selfTuningGain || 0) * 0.995 + changed / Math.max(1, this.synapses) * learningRate, 0, 0.5);
      return changed;
    }

    plasticStep(state, memory, rate = this.plasticityRate) {
      const before = Float32Array.from(state);
      this.step(state, memory);
      return this.hebbianUpdate(before, state, rate);
    }

    logits(state, memory) {
      const logits = new Float32Array(this.vocab.length);
      for (let token = 0; token < this.vocab.length; token++) {
        let value = this.outputBias[token];
        const code = hashString(this.vocab[token] || `${token}`) || token;
        for (let fan = 0; fan < 8; fan++) {
          const index = (Math.imul(code + fan * 97, 1103515245) >>> 0) % this.neurons;
          const embed = this.tokenEmbedding[token * TOKEN_EMBEDDING_SIZE + (fan % TOKEN_EMBEDDING_SIZE)] || 0;
          value += state[index] * this.outputWeights[token * 8 + fan] + embed * 0.018;
        }
        if (memory) {
          for (let fan = 0; fan < 4; fan++) {
            const index = (Math.imul(code + fan * 173, 2246822519) >>> 0) % MEMORY_SIZE;
            value += memory[index] * this.memoryOut[token * 4 + fan];
          }
        }
        value += this.personality[token % PERSONALITY_SIZE] * 0.04;
        logits[token] = value;
      }
      return logits;
    }

    evaluateText(text, maxChars = 760) {
      const sample = (text && text.length > 2 ? text : DEFAULT_SEED_TEXT).slice(0, maxChars);
      const tokens = encodeTokens(sample, this.vocab, maxChars, this.tokenMatcher, this.tokenToIndex);
      const state = new Float32Array(this.neurons);
      const memory = new Float32Array(MEMORY_SIZE);
      let loss = 0;
      let entropy = 0;
      let seen = 0;
      let tokenChars = 0;
      for (let i = 0; i < tokens.length - 1; i++) {
        const target = tokens[i + 1] ?? this.tokenToIndex.get(" ") ?? 0;
        this.inputToken(state, tokens[i]);
        this.step(state, memory);
        const stats = softmaxStats(this.logits(state, memory), target);
        loss += stats.loss;
        entropy += stats.entropy;
        tokenChars += Math.max(1, cleanGeneratedText(this.vocab[target] || " ", 40).length || 1);
        seen += 1;
      }
      this.loss = seen > 1 ? loss / seen : 12;
      this.outputLength = seen;
      this.averageEntropy = seen ? entropy / seen : 0;
      this.averageTokenChars = seen ? tokenChars / seen : 1;
      this.subwordSpanScore = clamp((this.averageTokenChars - 1) / 5, 0, 1);
      this.baseFitness = 1 / (1 + this.loss);
      this.fitness = this.baseFitness;
      return this.fitness;
    }

    evaluateDialogue(text, maxChars = 1200) {
      const sample = dialogueTrainingText(text, maxChars);
      const tokens = encodeTokens(sample, this.vocab, maxChars, this.tokenMatcher, this.tokenToIndex);
      const state = new Float32Array(this.neurons);
      const memory = new Float32Array(MEMORY_SIZE);
      let loss = 0;
      let entropy = 0;
      let seen = 0;
      let tokenChars = 0;
      let assistantMode = false;
      for (let i = 0; i < tokens.length - 1; i++) {
        const char = this.vocab[tokens[i]] || " ";
        const nextChar = this.vocab[tokens[i + 1]] || " ";
        this.inputToken(state, tokens[i]);
        this.step(state, memory);

        if (char === CONTROL_ASSISTANT) assistantMode = true;
        else if (char === CONTROL_TURN_END || char === CONTROL_HUMAN) assistantMode = false;

        const target = tokens[i + 1] ?? this.tokenToIndex.get(" ") ?? 0;
        if (assistantMode && nextChar !== CONTROL_HUMAN) {
          const stats = softmaxStats(this.logits(state, memory), target);
          loss += stats.loss;
          entropy += stats.entropy;
          tokenChars += Math.max(1, cleanGeneratedText(nextChar || " ", 40).length || 1);
          seen += 1;
        }
      }
      if (seen < 8) {
        const observedLoss = seen ? loss / seen : 0;
        this.loss = Math.max(6.5, observedLoss + (8 - seen) * 0.45);
      } else {
        this.loss = loss / seen;
      }
      this.outputLength = seen;
      this.averageEntropy = seen ? entropy / seen : 0;
      this.averageTokenChars = seen ? tokenChars / seen : 1;
      this.subwordSpanScore = clamp((this.averageTokenChars - 1) / 5, 0, 1);
      this.baseFitness = 1 / (1 + this.loss);
      this.fitness = this.baseFitness;
      if (seen < 8) this.fitness *= 0.22;
      return this.fitness;
    }

    adaptText(text, learningRate = 0.018, maxChars = 520) {
      const sample = (text && text.length > 2 ? text : DEFAULT_SEED_TEXT).slice(0, maxChars);
      const tokens = encodeTokens(sample, this.vocab, maxChars, this.tokenMatcher, this.tokenToIndex);
      const state = new Float32Array(this.neurons);
      const memory = new Float32Array(MEMORY_SIZE);
      for (let i = 0; i < tokens.length - 1; i++) {
        const target = tokens[i + 1] ?? this.tokenToIndex.get(" ") ?? 0;
        this.inputToken(state, tokens[i]);
        this.plasticStep(state, memory, this.plasticityRate * 0.25);
        const logits = this.logits(state, memory);
        const guess = weightedSample(logits, 0.7);
        for (const token of [target, guess]) {
          const sign = token === target ? 1 : -1;
          const code = hashString(this.vocab[token] || `${token}`) || token;
          this.outputBias[token] += sign * learningRate * 0.25;
          for (let fan = 0; fan < 8; fan++) {
            const index = (Math.imul(code + fan * 97, 1103515245) >>> 0) % this.neurons;
            this.outputWeights[token * 8 + fan] += sign * learningRate * state[index];
          }
          for (let fan = 0; fan < 4; fan++) {
            const index = (Math.imul(code + fan * 173, 2246822519) >>> 0) % MEMORY_SIZE;
            this.memoryOut[token * 4 + fan] += sign * learningRate * 0.4 * memory[index];
          }
        }
      }
    }

    adaptDialogue(text, learningRate = 0.018, maxChars = 760) {
      const sample = dialogueTrainingText(text, maxChars);
      const tokens = encodeTokens(sample, this.vocab, maxChars, this.tokenMatcher, this.tokenToIndex);
      const state = new Float32Array(this.neurons);
      const memory = new Float32Array(MEMORY_SIZE);
      let assistantMode = false;
      for (let i = 0; i < tokens.length - 1; i++) {
        const char = this.vocab[tokens[i]] || " ";
        this.inputToken(state, tokens[i]);
        this.plasticStep(state, memory, this.plasticityRate * 0.35);

        if (char === CONTROL_ASSISTANT) assistantMode = true;
        else if (char === CONTROL_TURN_END || char === CONTROL_HUMAN) assistantMode = false;
        if (!assistantMode) continue;

        const target = tokens[i + 1] ?? this.tokenToIndex.get(" ") ?? 0;
        const logits = this.logits(state, memory);
        const guess = weightedSample(logits, 0.65);
        for (const token of [target, guess]) {
          const sign = token === target ? 1 : -1;
          const code = hashString(this.vocab[token] || `${token}`) || token;
          this.outputBias[token] += sign * learningRate * 0.28;
          for (let fan = 0; fan < 8; fan++) {
            const index = (Math.imul(code + fan * 97, 1103515245) >>> 0) % this.neurons;
            this.outputWeights[token * 8 + fan] += sign * learningRate * state[index];
          }
          for (let fan = 0; fan < 4; fan++) {
            const index = (Math.imul(code + fan * 173, 2246822519) >>> 0) % MEMORY_SIZE;
            this.memoryOut[token * 4 + fan] += sign * learningRate * 0.42 * memory[index];
          }
        }
      }
    }

    gradientFineTune(text, options = {}) {
      const learningRate = clamp(Number(options.learningRate ?? 0.018), 0.0005, 0.08);
      const steps = clamp(Math.floor(options.steps ?? 2), 0, 8);
      const maxTokens = clamp(Math.floor(options.maxTokens ?? 360), 40, 1600);
      const dialogueMode = options.dialogueMode !== false;
      const sample = dialogueMode ? dialogueTrainingText(text, maxTokens * 4) : cleanTrainingText(text || DEFAULT_SEED_TEXT, maxTokens * 5);
      const tokens = encodeTokens(sample, this.vocab, maxTokens, this.tokenMatcher, this.tokenToIndex);
      if (steps < 1 || tokens.length < 3) return { steps: 0, loss: this.loss, tokens: tokens.length };

      const accBias = new Float32Array(this.outputBias.length);
      const accOut = new Float32Array(this.outputWeights.length);
      const accMem = new Float32Array(this.memoryOut.length);
      const accEmbed = new Float32Array(this.tokenEmbedding.length);
      let finalLoss = 0;
      let finalSeen = 0;

      for (let stepIndex = 0; stepIndex < steps; stepIndex++) {
        const state = new Float32Array(this.neurons);
        const memory = new Float32Array(MEMORY_SIZE);
        let assistantMode = !dialogueMode;
        let totalLoss = 0;
        let seen = 0;
        for (let i = 0; i < tokens.length - 1; i++) {
          const token = tokens[i];
          const tokenText = this.vocab[token] || " ";
          this.inputToken(state, token);
          this.step(state, memory);
          if (dialogueMode) {
            if (tokenText === CONTROL_ASSISTANT) assistantMode = true;
            else if (tokenText === CONTROL_TURN_END || tokenText === CONTROL_HUMAN) assistantMode = false;
          }
          if (!assistantMode) continue;

          const target = tokens[i + 1] ?? this.tokenToIndex.get(" ") ?? 0;
          const logits = this.logits(state, memory);
          const probs = softmaxDistribution(logits);
          totalLoss += -Math.log(Math.max(1e-9, probs[target] || 0));
          seen += 1;

          const candidates = [target];
          const selected = new Uint8Array(this.vocab.length);
          selected[target] = 1;
          const topK = Math.min(64, Math.max(12, Math.floor(Math.sqrt(this.vocab.length) * 2)));
          for (let pick = 0; pick < topK; pick++) {
            let bestIndex = -1;
            let bestProb = -1;
            for (let out = 0; out < probs.length; out++) {
              if (selected[out]) continue;
              if (probs[out] > bestProb) {
                bestProb = probs[out];
                bestIndex = out;
              }
            }
            if (bestIndex < 0) break;
            selected[bestIndex] = 1;
            candidates.push(bestIndex);
          }

          for (const out of candidates) {
            const grad = (probs[out] || 0) - (out === target ? 1 : 0);
            if (Math.abs(grad) < 0.00001) continue;
            accBias[out] += grad * grad;
            this.outputBias[out] = clamp(this.outputBias[out] - learningRate * grad / Math.sqrt(accBias[out] + 1e-6), -4, 4);
            const code = hashString(this.vocab[out] || `${out}`) || out;
            for (let fan = 0; fan < 8; fan++) {
              const stateIndex = (Math.imul(code + fan * 97, 1103515245) >>> 0) % this.neurons;
              const wi = out * 8 + fan;
              const wGrad = grad * (state[stateIndex] || 0);
              accOut[wi] += wGrad * wGrad;
              this.outputWeights[wi] = clamp(this.outputWeights[wi] - learningRate * wGrad / Math.sqrt(accOut[wi] + 1e-6), -4, 4);
            }
            for (let fan = 0; fan < 4; fan++) {
              const memIndex = (Math.imul(code + fan * 173, 2246822519) >>> 0) % MEMORY_SIZE;
              const mi = out * 4 + fan;
              const mGrad = grad * (memory[memIndex] || 0) * 0.6;
              accMem[mi] += mGrad * mGrad;
              this.memoryOut[mi] = clamp(this.memoryOut[mi] - learningRate * mGrad / Math.sqrt(accMem[mi] + 1e-6), -3, 3);
            }
          }

          const embedDirection = 1 - Math.min(0.98, probs[target] || 0);
          for (let d = 0; d < TOKEN_EMBEDDING_SIZE; d++) {
            const ei = token * TOKEN_EMBEDDING_SIZE + d;
            const grad = -embedDirection * (memory[d % MEMORY_SIZE] || state[(d * 997) % this.neurons] || 0) * 0.08;
            accEmbed[ei] += grad * grad;
            this.tokenEmbedding[ei] = clamp(this.tokenEmbedding[ei] - learningRate * grad / Math.sqrt(accEmbed[ei] + 1e-6), -2, 2);
          }
        }
        finalLoss = totalLoss / Math.max(1, seen);
        finalSeen = seen;
      }
      if (finalSeen) {
        const oldLoss = Number.isFinite(this.loss) ? this.loss : finalLoss;
        this.loss = finalLoss;
        this.selfTuningGain = clamp((this.selfTuningGain || 0) * 0.94 + Math.max(0, oldLoss - finalLoss), 0, 0.5);
      }
      return { steps, loss: finalLoss, tokens: finalSeen };
    }

    evaluateCoherence(referenceText = "", prompt = "Answer with a useful, grounded memory.") {
      const generated = this.generate(prompt, 260, 0.72, { plastic: false });
      const score = coherenceScore(generated, referenceText);
      const dialogue = naturalDialogueScore(generated);
      const contamination = metaContaminationScore(generated);
      const repetition = repetitionScore(generated);
      const value = trainingValueScore(generated);
      const linguistic = calculateLinguisticFitness(generated);
      this.coherenceScore = clamp((this.coherenceScore || 0) * 0.65 + score * 0.35, 0, 1);
      this.dialogueScore = clamp((this.dialogueScore || 0) * 0.6 + dialogue * 0.4, 0, 1);
      this.contaminationScore = clamp((this.contaminationScore || 0) * 0.6 + contamination * 0.4, 0, 1);
      this.repetitionScore = clamp((this.repetitionScore || 0) * 0.6 + repetition * 0.4, 0, 1);
      this.trainingValueScore = clamp((this.trainingValueScore || 0) * 0.6 + value * 0.4, 0, 1);
      this.linguisticScore = clamp((this.linguisticScore || 0) * 0.62 + linguistic * 0.38, 0, 1);
      return { score: this.coherenceScore, dialogue: this.dialogueScore, contamination: this.contaminationScore, repetition: this.repetitionScore, value: this.trainingValueScore, linguistic: this.linguisticScore, generated };
    }

    evaluateSpeechCoherence(prompt = "", referenceText = "") {
      const cleanPrompt = cleanTrainingText(prompt, 900) || "Reply naturally.";
      const reference = cleanTrainingText(referenceText || prompt, 1800);
      const generated = this.generate(cleanPrompt, 220, 0.66, { plastic: false, allowToolReflex: false });
      const linguistic = calculateLinguisticFitness(generated);
      const coherent = coherenceScore(generated, reference);
      const dialogue = naturalDialogueScore(generated);
      const contamination = metaContaminationScore(generated);
      const repetition = repetitionScore(generated);
      const score = clamp(linguistic * 0.34 + coherent * 0.3 + dialogue * 0.26 - contamination * 0.28 - repetition * 0.22, 0, 1);
      this.speechCoherenceScore = clamp((this.speechCoherenceScore || 0) * 0.68 + score * 0.32, 0, 1);
      this.linguisticScore = clamp((this.linguisticScore || 0) * 0.78 + linguistic * 0.22, 0, 1);
      this.dialogueScore = clamp((this.dialogueScore || 0) * 0.8 + dialogue * 0.2, 0, 1);
      this.contaminationScore = clamp((this.contaminationScore || 0) * 0.8 + contamination * 0.2, 0, 1);
      this.repetitionScore = clamp((this.repetitionScore || 0) * 0.8 + repetition * 0.2, 0, 1);
      return { score: this.speechCoherenceScore, generated, linguistic, coherent, dialogue };
    }

    generate(prompt, length = 420, temperature = 0.9, options = {}) {
      const state = new Float32Array(this.neurons);
      const memory = new Float32Array(MEMORY_SIZE);
      const rawPrompt = cleanTrainingText(prompt || " ") || " ";
      const seed = rawPrompt.includes(CONTROL_ASSISTANT) ? rawPrompt : `${CONTROL_HUMAN} ${rawPrompt} ${CONTROL_ASSISTANT}`;
      const seedTokens = encodeTokens(seed, this.vocab, 1200, this.tokenMatcher, this.tokenToIndex);
      for (const token of seedTokens) {
        this.inputToken(state, token);
        if (options.plastic === false) this.step(state, memory);
        else this.plasticStep(state, memory, this.plasticityRate * 0.35);
      }
      let output = "";
      let current = seedTokens[seedTokens.length - 1] ?? this.tokenToIndex.get(" ") ?? 0;
      for (let i = 0; i < length; i++) {
        this.inputToken(state, current);
        if (options.plastic === false) this.step(state, memory);
        else this.plasticStep(state, memory, this.plasticityRate * 0.55);
        const logits = this.logits(state, memory);
        const token = this.softToolReflex(logits, weightedSample(logits, temperature), options);
        const piece = tokenIsSafe(this.vocab[token]) ? this.vocab[token] : " ";
        current = token;
        if (piece === CONTROL_TURN_END) break;
        if (piece === CONTROL_HUMAN || piece === CONTROL_ASSISTANT) continue;
        output += piece;
        if (output.length >= length) break;
      }
      return cleanGeneratedText(output, length);
    }

    softToolReflex(logits, sampledToken, options = {}) {
      if (options.allowToolReflex === false || !this.toolConfidence || Math.random() > this.toolConfidence * 0.018) return sampledToken;
      const toolPattern = /\[|SEARCH|WIKI|FETCH|YOUTUBE|SELF_TUNE/i;
      let best = sampledToken;
      let bestValue = -Infinity;
      const stride = Math.max(1, Math.floor(this.vocab.length / 160));
      for (let i = 0; i < this.vocab.length; i += stride) {
        const token = this.vocab[i] || "";
        if (!toolPattern.test(token)) continue;
        const value = logits[i] || 0;
        if (value > bestValue) {
          bestValue = value;
          best = i;
        }
      }
      if (best !== sampledToken) this.toolConfidence = clamp(this.toolConfidence * 0.996 + 0.002, 0, 1);
      return best;
    }

    evolveSensoryGate(rawTokens = "") {
      const text = Array.isArray(rawTokens) ? rawTokens.join("") : String(rawTokens || "");
      const cleaned = cleanTrainingText(text, 12000);
      if (!cleaned || !this.sensoryGateWeights?.length) return { filteredText: "", efficiency: this.sensoryGateEfficiency || 0, bonus: this.sensoryGateBonus || 0, tokens: 0 };
      const tokens = encodeTokens(cleaned, this.vocab, 1800, this.tokenMatcher, this.tokenToIndex);
      let useful = 0;
      let total = 0;
      for (const token of tokens) {
        const tokenText = this.vocab[token] || "";
        const noisy = metaContaminationScore(tokenText) > 0.28 || repetitionScore(tokenText) > 0.6 || textNoiseRatio(tokenText) > 0.08;
        const natural = /[a-z0-9]{3,}/i.test(tokenText) || /[.!?]/.test(tokenText);
        const delta = noisy ? -0.055 : natural ? 0.025 : 0.004;
        this.sensoryGateWeights[token] = clamp((this.sensoryGateWeights[token] || 1) * 0.992 + delta, 0.05, 1.6);
        useful += this.sensoryGateWeights[token] >= 0.32 ? 1 : 0;
        total += 1;
      }
      const lines = cleaned.split(/\n+/).map(line => cleanTrainingText(line, 900)).filter(Boolean);
      const kept = [];
      for (const line of lines) {
        const lineTokens = encodeTokens(line, this.vocab, 260, this.tokenMatcher, this.tokenToIndex);
        const avgGate = lineTokens.reduce((sum, token) => sum + (this.sensoryGateWeights[token] || 1), 0) / Math.max(1, lineTokens.length);
        if (avgGate >= 0.28 && metaContaminationScore(line) < 0.55) kept.push(line);
      }
      const filteredText = cleanTrainingText((kept.length ? kept : lines.slice(0, 8)).join("\n"), 6000);
      const efficiency = total ? useful / total : 0;
      this.sensoryGateEfficiency = clamp((this.sensoryGateEfficiency || 0) * 0.72 + efficiency * 0.28, 0, 1);
      this.sensoryGateBonus = Math.min(0.08, this.sensoryGateEfficiency * 0.08);
      return { filteredText, efficiency: this.sensoryGateEfficiency, bonus: this.sensoryGateBonus, tokens: total };
    }

    seeImage(target, learningRate = 0.08) {
      const latent = extractImageLatent(target);
      for (let i = 0; i < IMAGE_LATENT_SIZE; i++) {
        const encoded = Math.tanh(latent[i] * (this.visualEncoder[i * 8] || 1) + this.visualBias[i]);
        this.visualMemory[i] = this.visualMemory[i] * (1 - learningRate) + encoded * learningRate;
      }
      return Array.from(this.visualMemory);
    }

    renderImage(prompt = "", size = 96, latentOverride = null, options = {}) {
      const dimension = clamp(Math.floor(size), 32, 192);
      const pixels = new Uint8ClampedArray(dimension * dimension * 4);
      const promptSeed = (hashString(prompt) % 10000) / 5000 - 1;
      const latent = latentOverride || this.visualMemory;
      const defaultActiveLimit = dimension > 128 ? 1600 : dimension > 96 ? 2400 : 3600;
      const active = Math.min(this.neurons, clamp(Math.floor(options.activeLimit || defaultActiveLimit), 256, 8000));
      let p = 0;
      for (let y = 0; y < dimension; y++) {
        const ny = (y / (dimension - 1)) * 2 - 1;
        for (let x = 0; x < dimension; x++) {
          const nx = (x / (dimension - 1)) * 2 - 1;
          let r = 0;
          let g = 0;
          let b = 0;
          for (let i = 0; i < active; i++) {
            const l = latent[i % IMAGE_LATENT_SIZE] || 0;
            const a = Math.tanh(nx * this.imgWx[i] + ny * this.imgWy[i] + promptSeed * this.imgWp[i] + l * this.visualDecoder[(i % IMAGE_LATENT_SIZE) * 6] + this.imgBias[i]);
            r += a * this.imgR[i];
            g += a * this.imgG[i];
            b += a * this.imgB[i];
          }
          const scale = 1 / Math.sqrt(active);
          const lr = latent[0] * this.visualDecoder[1] + latent[5] * this.visualDecoder[2];
          const lg = latent[1] * this.visualDecoder[3] + latent[8] * this.visualDecoder[4];
          const lb = latent[2] * this.visualDecoder[5] + latent[11] * this.visualDecoder[6];
          pixels[p++] = clamp(Math.round((Math.tanh(r * scale + lr) * 0.5 + 0.5) * 255), 0, 255);
          pixels[p++] = clamp(Math.round((Math.tanh(g * scale + lg) * 0.5 + 0.5) * 255), 0, 255);
          pixels[p++] = clamp(Math.round((Math.tanh(b * scale + lb) * 0.5 + 0.5) * 255), 0, 255);
          pixels[p++] = 255;
        }
      }
      return { pixels, size: dimension };
    }

    evaluateImage(target, prompt = "") {
      if (!target) return 0;
      const latent = extractImageLatent(target);
      this.seeImage(target, 0.12);
      const rendered = this.renderImage(prompt, target.size, latent, { activeLimit: 2200 });
      let loss = 0;
      for (let i = 0; i < rendered.pixels.length; i += 4) {
        const dr = rendered.pixels[i] - target.pixels[i];
        const dg = rendered.pixels[i + 1] - target.pixels[i + 1];
        const db = rendered.pixels[i + 2] - target.pixels[i + 2];
        loss += (dr * dr + dg * dg + db * db) / (255 * 255 * 3);
      }
      const normalized = loss / (target.size * target.size);
      this.fitness += 1 / (1 + normalized * 8);
      return normalized;
    }

    trainImage(target, prompt = "", learningRate = 0.018) {
      if (!target) return 0;
      const latent = extractImageLatent(target);
      const rendered = this.renderImage(prompt, target.size, latent, { activeLimit: 2200 });
      const targetStats = imageAverages(target);
      const renderStats = imageAverages(rendered);
      const er = targetStats.r - renderStats.r;
      const eg = targetStats.g - renderStats.g;
      const eb = targetStats.b - renderStats.b;
      let loss = 0;
      for (let i = 0; i < rendered.pixels.length; i += 4) {
        const dr = rendered.pixels[i] - target.pixels[i];
        const dg = rendered.pixels[i + 1] - target.pixels[i + 1];
        const db = rendered.pixels[i + 2] - target.pixels[i + 2];
        loss += (dr * dr + dg * dg + db * db) / (255 * 255 * 3);
      }
      const normalized = loss / (target.size * target.size);

      // Local visual learning: the organism "sees" the image into latent memory,
      // then nudges its decoder/color heads toward the target pixel statistics.
      this.seeImage(target, Math.min(0.45, learningRate * 5));
      for (let i = 0; i < IMAGE_LATENT_SIZE; i++) {
        const targetLatent = latent[i];
        const current = Math.tanh(targetLatent * (this.visualEncoder[i * 8] || 1) + this.visualBias[i]);
        const latentError = targetLatent - current;
        this.visualBias[i] += latentError * learningRate;
        this.visualEncoder[i * 8] += latentError * targetLatent * learningRate;
      }
      this.visualDecoder[1] += er * latent[0] * learningRate;
      this.visualDecoder[3] += eg * latent[1] * learningRate;
      this.visualDecoder[5] += eb * latent[2] * learningRate;
      for (let q = 0; q < targetStats.quadrants.length; q++) {
        const qError = targetStats.quadrants[q] - renderStats.quadrants[q];
        this.visualDecoder[(q % IMAGE_LATENT_SIZE) * 6] += qError * learningRate * 0.4;
      }

      const active = Math.min(this.neurons, 1600);
      const stride = Math.max(1, Math.floor(active / 320));
      for (let i = 0; i < active; i += stride) {
        const signal = Math.tanh(this.visualMemory[i % IMAGE_LATENT_SIZE] + this.imgBias[i] * 0.1);
        this.imgR[i] += er * signal * learningRate * 0.35;
        this.imgG[i] += eg * signal * learningRate * 0.35;
        this.imgB[i] += eb * signal * learningRate * 0.35;
      }
      this.fitness += 1 / (1 + normalized * 8);
      this.imageLoss = normalized;
      return normalized;
    }

    visualAttentionBoost(target, strength = 0.08) {
      if (!target) return 0;
      const latent = extractImageLatent(target);
      const boost = clamp(Number(strength) || 0, 0, 0.2);
      let touched = 0;
      const active = Math.min(this.neurons, 2200);
      const stride = Math.max(1, Math.floor(active / 420));
      for (let i = 0; i < active; i += stride) {
        const neuron = i;
        if ((this.neuronTypes[neuron] || 0) === 5 || i % 7 === 0) {
          const signal = latent[i % IMAGE_LATENT_SIZE] || this.visualMemory[i % IMAGE_LATENT_SIZE] || 0;
          this.imgBias[neuron] = clamp(this.imgBias[neuron] + signal * boost * 0.18, -3, 3);
          this.imgWp[neuron] = clamp(this.imgWp[neuron] + signal * boost * 0.12, -3, 3);
          touched += 1;
        }
      }
      const synStep = Math.max(1, Math.floor(this.synapses / 9000));
      for (let i = 0; i < this.synapses; i += synStep) {
        const fromVisual = (this.neuronTypes[this.from[i]] || 0) === 5;
        const toVisual = (this.neuronTypes[this.to[i]] || 0) === 5;
        if (!fromVisual && !toVisual) continue;
        const signal = latent[(this.from[i] + this.to[i]) % IMAGE_LATENT_SIZE] || 0;
        this.weights[i] = clamp(this.weights[i] + signal * boost * 0.04, -8, 8);
        touched += 1;
      }
      return touched;
    }

    deepDreamVisual(target, prompt = "", options = {}) {
      if (!target) return { loss: 0, delta: 0, coherence: 0, passes: 0, attentionTouched: 0 };
      const passes = clamp(Math.floor(options.passes ?? 3), 1, 8);
      const learningRate = clamp(Number(options.learningRate ?? 0.026), 0.001, 0.08);
      const before = this.evaluateImage(target, prompt);
      let loss = before;
      let attentionTouched = 0;
      for (let pass = 0; pass < passes; pass++) {
        this.seeImage(target, clamp(0.28 + pass * 0.035, 0, 0.5));
        attentionTouched += this.visualAttentionBoost(target, options.attentionBoost ?? 0.07);
        loss = this.trainImage(target, prompt, learningRate * (1 - pass * 0.08));
      }
      const after = this.evaluateImage(target, prompt);
      const coherence = clamp(1 / (1 + after * 7), 0, 1);
      return { loss: after, delta: before - after, coherence, passes, attentionTouched };
    }

    getActivity(prompt = "") {
      const state = new Float32Array(this.neurons);
      const memory = new Float32Array(MEMORY_SIZE);
      const maxSeed = this.synapses > 160000 ? 24 : this.synapses > 60000 ? 64 : 240;
      const seed = cleanTrainingText(prompt || "", maxSeed).slice(-maxSeed) || "Hello memory recall";
      for (const token of encodeTokens(seed, this.vocab, maxSeed, this.tokenMatcher, this.tokenToIndex)) {
        this.inputToken(state, token);
        this.step(state, memory);
      }
      const buckets = new Float32Array(64);
      for (let i = 0; i < state.length; i++) buckets[i % buckets.length] += Math.abs(state[i]);
      let max = 0;
      for (const value of buckets) max = Math.max(max, value);
      const memoryMean = memory.reduce((sum, value) => sum + Math.abs(value), 0) / Math.max(1, memory.length);
      const memorySaturation = memory.reduce((sum, value) => sum + (Math.abs(value) > 0.72 ? 1 : 0), 0) / Math.max(1, memory.length);
      const inhibitoryCount = this.neuronTypes.reduce((sum, type) => sum + (type === 1 ? 1 : 0), 0);
      return {
        buckets: Array.from(buckets, value => max ? value / max : 0),
        memory: Array.from(memory),
        memoryMean,
        memorySaturation,
        noisePressure: this.lastNoisePressure || 0,
        inhibitoryBrake: this.lastInhibitoryBrake || 0,
        inhibitoryRatio: inhibitoryCount / Math.max(1, this.neurons),
        personality: Array.from(this.personality),
        neuronTypes: NEURON_TYPES.map((name, index) => ({
          name,
          color: TYPE_COLORS[index],
          count: this.neuronTypes.reduce((sum, type) => sum + (type === index ? 1 : 0), 0)
        })),
        speciesId: this.speciesId
      };
    }

    topologyView(prompt = "", maxNodes = 260, maxEdges = 720) {
      const state = new Float32Array(this.neurons);
      const memory = new Float32Array(MEMORY_SIZE);
      const maxSeed = this.synapses > 160000 ? 24 : this.synapses > 60000 ? 64 : 240;
      const seed = cleanTrainingText(prompt || "", maxSeed).slice(-maxSeed) || "Hello memory recall";
      for (const token of encodeTokens(seed, this.vocab, maxSeed, this.tokenMatcher, this.tokenToIndex)) {
        this.inputToken(state, token);
        this.step(state, memory);
      }

      const selected = new Set();
      const edgeStep = Math.max(1, Math.floor(this.synapses / maxEdges));
      const edgeSeeds = [];
      for (let i = 0; i < this.synapses && edgeSeeds.length < maxEdges; i += edgeStep) {
        if (!this.enabled[i]) continue;
        edgeSeeds.push(i);
        if (selected.size < maxNodes) selected.add(this.from[i]);
        if (selected.size < maxNodes) selected.add(this.to[i]);
      }
      const nodeStep = Math.max(1, Math.floor(this.neurons / maxNodes));
      for (let i = 0; i < this.neurons && selected.size < maxNodes; i += nodeStep) selected.add(i);

      const nodeIds = Array.from(selected).slice(0, maxNodes);
      const nodeSet = new Set(nodeIds);
      const nodes = nodeIds.map(id => ({
        id,
        type: this.neuronTypes[id] || 0,
        typeName: NEURON_TYPES[this.neuronTypes[id] || 0],
        color: TYPE_COLORS[this.neuronTypes[id] || 0],
        activity: state[id] || 0,
        memory: memory[id % MEMORY_SIZE] || 0
      }));
      const edges = [];
      for (const i of edgeSeeds) {
        if (!nodeSet.has(this.from[i]) || !nodeSet.has(this.to[i])) continue;
        const firing = Math.abs((state[this.from[i]] || 0) * this.weights[i]);
        edges.push({
          from: this.from[i],
          to: this.to[i],
          weight: this.weights[i],
          firing,
          enabled: this.enabled[i] === 1
        });
      }
      return {
        nodes,
        edges,
        types: NEURON_TYPES.map((name, index) => ({ name, color: TYPE_COLORS[index] })),
        neurons: this.neurons,
        synapses: this.synapses,
        speciesId: this.speciesId
      };
    }

    distanceTo(other) {
      const sizeDelta = Math.abs(this.neurons - other.neurons) / MAX_NEURONS + Math.abs(this.synapses - other.synapses) / MAX_SYNAPSES;
      const map = new Map();
      for (let i = 0; i < this.innovations.length; i++) map.set(this.innovations[i], this.weights[i]);
      let matching = 0;
      let weightDelta = 0;
      let disjoint = 0;
      for (let i = 0; i < other.innovations.length; i++) {
        if (map.has(other.innovations[i])) {
          matching += 1;
          weightDelta += Math.abs(map.get(other.innovations[i]) - other.weights[i]);
        } else {
          disjoint += 1;
        }
      }
      disjoint += Math.max(0, this.innovations.length - matching);
      const normalizer = Math.max(1, Math.max(this.innovations.length, other.innovations.length));
      const personalityDelta = this.personality.reduce((sum, value, index) => sum + Math.abs(value - other.personality[index]), 0) / PERSONALITY_SIZE;
      const typeSamples = Math.min(256, this.neurons, other.neurons);
      let typeDelta = 0;
      for (let i = 0; i < typeSamples; i++) {
        const a = Math.floor((i / Math.max(1, typeSamples - 1)) * (this.neurons - 1));
        const b = Math.floor((i / Math.max(1, typeSamples - 1)) * (other.neurons - 1));
        if ((this.neuronTypes[a] || 0) !== (other.neuronTypes[b] || 0)) typeDelta += 1;
      }
      return sizeDelta * 1.8 + (disjoint / normalizer) * 1.2 + (matching ? weightDelta / matching : 1) * 0.55 + personalityDelta * 0.35 + (typeDelta / Math.max(1, typeSamples)) * 0.22;
    }

    crossover(partner) {
      const fitter = this.fitness >= partner.fitness ? this : partner;
      const other = fitter === this ? partner : this;
      const child = fitter.clone();
      const closeFitness = Math.abs((this.fitness || 0) - (partner.fitness || 0)) <= Math.max(0.018, Math.max(this.fitness || 0, partner.fitness || 0) * 0.12);
      if (closeFitness) {
        const blendedNeurons = Math.round(fitter.neurons * 0.68 + other.neurons * 0.32 + randomWeight(Math.max(1, fitter.neurons * 0.012)));
        const blendedSynapses = Math.round(fitter.synapses * 0.7 + other.synapses * 0.3 + randomWeight(Math.max(4, fitter.synapses * 0.015)));
        child.resize(blendedNeurons, blendedSynapses);
      }
      const otherByInnovation = new Map();
      for (let i = 0; i < other.innovations.length; i++) otherByInnovation.set(other.innovations[i], i);
      for (let i = 0; i < child.innovations.length; i++) {
        const otherIndex = otherByInnovation.get(child.innovations[i]);
        if (otherIndex === undefined || Math.random() >= 0.5) continue;
        child.weights[i] = other.weights[otherIndex];
        child.enabled[i] = Math.random() < 0.75 ? other.enabled[otherIndex] : child.enabled[i];
      }
      if (closeFitness && other.synapses > 0) {
        const childInnovations = new Set(Array.from(child.innovations));
        let transplanted = 0;
        const transplantBudget = Math.min(Math.max(2, Math.floor(child.synapses * 0.035)), Math.floor(other.synapses * 0.08));
        for (let attempts = 0; attempts < transplantBudget * 8 && transplanted < transplantBudget; attempts++) {
          const source = Math.floor(Math.random() * other.synapses);
          if (childInnovations.has(other.innovations[source]) || !other.enabled[source]) continue;
          const target = Math.floor(Math.random() * child.synapses);
          child.from[target] = other.from[source] % child.neurons;
          child.to[target] = other.to[source] % child.neurons;
          child.weights[target] = other.weights[source];
          child.enabled[target] = other.enabled[source];
          child.innovations[target] = other.innovations[source];
          childInnovations.add(other.innovations[source]);
          transplanted += 1;
        }
      }
      const blend = (a, b, target) => {
        for (let i = 0; i < target.length; i++) {
          const av = a[i] || 0;
          const bv = b[i] || 0;
          target[i] = Math.random() < 0.5 ? av : (av + bv) * 0.5;
        }
      };
      blend(fitter.tokenEmbedding, other.tokenEmbedding, child.tokenEmbedding);
      blend(fitter.outputWeights, other.outputWeights, child.outputWeights);
      blend(fitter.outputBias, other.outputBias, child.outputBias);
      blend(fitter.memoryIn, other.memoryIn, child.memoryIn);
      blend(fitter.memoryForget, other.memoryForget, child.memoryForget);
      blend(fitter.memoryWrite, other.memoryWrite, child.memoryWrite);
      blend(fitter.memoryOut, other.memoryOut, child.memoryOut);
      blend(fitter.personality, other.personality, child.personality);
      blend(fitter.visualEncoder, other.visualEncoder, child.visualEncoder);
      blend(fitter.visualDecoder, other.visualDecoder, child.visualDecoder);
      blend(fitter.visualMemory, other.visualMemory, child.visualMemory);
      blend(fitter.sensoryGateWeights || new Float32Array(child.vocab.length), other.sensoryGateWeights || new Float32Array(child.vocab.length), child.sensoryGateWeights);
      child.plasticityRate = Math.random() < 0.5 ? fitter.plasticityRate : (fitter.plasticityRate + other.plasticityRate) * 0.5;
      child.recurrentBridgeRate = Math.random() < 0.5 ? fitter.recurrentBridgeRate : (fitter.recurrentBridgeRate + other.recurrentBridgeRate) * 0.5;
      child.memorySensitivity = Math.random() < 0.5 ? fitter.memorySensitivity : (fitter.memorySensitivity + other.memorySensitivity) * 0.5;
      child.toolConfidence = clamp(Math.random() < 0.5 ? fitter.toolConfidence : (fitter.toolConfidence + other.toolConfidence) * 0.5, 0, 1);
      child.profileAttentionMultiplier = clamp(Math.random() < 0.5 ? fitter.profileAttentionMultiplier : (fitter.profileAttentionMultiplier + other.profileAttentionMultiplier) * 0.5, 1, 3.2);
      child.toolUseScore = clamp(((fitter.toolUseScore || 0) * 0.7) + ((other.toolUseScore || 0) * 0.3), 0, 1);
      child.sensoryGateEfficiency = clamp(((fitter.sensoryGateEfficiency || 0) * 0.7) + ((other.sensoryGateEfficiency || 0) * 0.3), 0, 1);
      child.linguisticScore = clamp(((fitter.linguisticScore || 0) * 0.7) + ((other.linguisticScore || 0) * 0.3), 0, 1);
      child.stableFitness = Math.max(fitter.stableFitness || 0, other.stableFitness || 0) * 0.985;
      child.metadata = { ...(child.metadata || {}), toolUseScore: child.toolUseScore, stableFitness: child.stableFitness, bestFitness: Math.max(fitter.metadata?.bestFitness || 0, other.metadata?.bestFitness || 0) * 0.985 };
      for (let i = 0; i < child.neuronTypes.length; i++) {
        if (i < other.neuronTypes.length && Math.random() < 0.32) child.neuronTypes[i] = other.neuronTypes[i];
      }
      child.id = `x-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      return child;
    }
  }

  class EvolutionLab {
    constructor(config = {}) {
      this.config = {
        neurons: clamp(config.neurons || 400, 64, MAX_NEURONS),
        synapses: clamp(config.synapses || 1400, 128, MAX_SYNAPSES),
        populationSize: clamp(config.populationSize || 10, 4, 24),
        mutation: clamp(config.mutation || 0.035, 0.001, 0.2),
        scalarMutation: clamp(config.scalarMutation ?? 0.028, 0.001, 0.08),
        vocabSize: clamp(config.vocabSize ?? DEFAULT_VOCAB_SIZE, PRINTABLE.length, MAX_VOCAB_SIZE),
        gradientSteps: clamp(config.gradientSteps ?? 2, 0, 8),
        gradientLearningRate: clamp(config.gradientLearningRate ?? 0.016, 0.0005, 0.08)
      };
      this.corpus = config.corpus || DEFAULT_SEED_TEXT;
      this.corpora = Array.isArray(config.corpora) && config.corpora.length
        ? config.corpora
        : [{ name: "seed", text: this.corpus, difficulty: 1, enabled: true }];
      this.persistentContext = config.persistentContext || "";
      this.userProfile = sanitizePersistentContext(config.userProfile || "", 3000);
      this.memorySummary = cleanTrainingText(config.memorySummary || "", 6000);
      this.recentTranscript = Array.isArray(config.recentTranscript) ? config.recentTranscript.slice(-24) : [];
      this.memoryBank = Array.isArray(config.memoryBank) ? config.memoryBank.slice(-240) : [];
      this.mirrorCorpus = Array.isArray(config.mirrorCorpus) ? config.mirrorCorpus.slice(-80) : [];
      this.spiralPhase = {
        active: false,
        untilGeneration: 0,
        startedAtGeneration: 0,
        startFitness: 0,
        reason: "",
        manual: false,
        maxGenerations: 0,
        ...(config.spiralPhase || {})
      };
      this.curriculumLevel = config.curriculumLevel || 1;
      this.species = [];
      this.imageTrainingCursor = 0;
      this.lastImageLoss = null;
      this.memoryRepairUntil = Number(config.memoryRepairUntil || 0);
      this.vocab = makeVocab(this.corpus, this.config.vocabSize);
      this.population = [];
      this.generation = 0;
      this.history = [];
      this.seed();
    }

    selectionScore(genome) {
      if (!genome) return 0;
      const current = Number.isFinite(genome.fitness) ? genome.fitness : 0;
      const stable = Number.isFinite(genome.stableFitness) ? genome.stableFitness : 0;
      const best = Number.isFinite(genome.metadata?.bestFitness) ? genome.metadata.bestFitness : 0;
      const protectedUntil = Number(genome.metadata?.protectedUntil || 0);
      const protection = protectedUntil > this.generation ? 0.08 + Math.min(0.08, (protectedUntil - this.generation) / 300) : 0;
      const diversityBonus = genome.origin === "immigrant" ? Math.min(0.06, Math.max(0, genome.metadata?.diversityCredit || 0.03)) : 0;
      return Math.max(current, stable * 0.992, best * 0.975) + protection + diversityBonus;
    }

    spiralStatus() {
      if (this.spiralPhase?.active && this.generation >= this.spiralPhase.untilGeneration) {
        this.spiralPhase.active = false;
        this.spiralPhase.lastExitReason = "max-generations";
        this.triggerMemoryRepair(100);
      }
      return {
        active: Boolean(this.spiralPhase?.active),
        remaining: Math.max(0, (this.spiralPhase?.untilGeneration || 0) - this.generation),
        reason: this.spiralPhase?.reason || "",
        startedAtGeneration: this.spiralPhase?.startedAtGeneration || 0,
        startFitness: this.spiralPhase?.startFitness || 0,
        manual: Boolean(this.spiralPhase?.manual),
        mirrorCorpus: this.mirrorCorpus.length
      };
    }

    innovationDiversity() {
      let total = 0;
      const unique = new Set();
      for (const genome of this.population) {
        const step = Math.max(1, Math.floor((genome.innovations?.length || 0) / 800));
        for (let i = 0; i < (genome.innovations?.length || 0); i += step) {
          unique.add(genome.innovations[i]);
          total += 1;
        }
      }
      return total ? unique.size / total : 1;
    }

    shouldTriggerSpiral() {
      if (this.spiralStatus().active || this.generation < 60) return null;
      const recent = this.history.slice(-55).filter(point => Number.isFinite(point.fitness));
      if (recent.length >= 50) {
        const first = recent[0].fitness || 0;
        const last = recent[recent.length - 1].fitness || 0;
        const delta = first > 0 ? (last - first) / first : 0;
        if (delta < 0.012) return `fitness plateau ${delta.toFixed(3)} over ${recent.length} generations`;
      }
      const diversity = this.innovationDiversity();
      if (diversity < 0.25 && this.population.length >= 6) return `innovation diversity low ${diversity.toFixed(2)}`;
      const summaryEntropy = textEntropy(`${this.memorySummary}\n${this.userProfile || ""}`);
      if ((this.memorySummary || this.userProfile || "").length > 400 && summaryEntropy < 0.46) return `memory summary stale entropy ${summaryEntropy.toFixed(2)}`;
      return null;
    }

    startSpiralPhase(reason = "manual mirror trigger", options = {}) {
      const duration = clamp(Math.floor(options.generations || options.duration || 160), 100, 300);
      const best = this.best();
      this.spiralPhase = {
        active: true,
        untilGeneration: this.generation + duration,
        startedAtGeneration: this.generation,
        startFitness: best?.fitness || 0,
        reason,
        manual: Boolean(options.manual),
        maxGenerations: duration,
        lastExitReason: ""
      };
      return this.spiralStatus();
    }

    stopSpiralPhase(reason = "manual stop") {
      if (!this.spiralPhase) this.spiralPhase = {};
      this.spiralPhase.active = false;
      this.spiralPhase.untilGeneration = this.generation;
      this.spiralPhase.lastExitReason = reason;
      this.triggerMemoryRepair(110);
      return this.spiralStatus();
    }

    seed() {
      this.vocab = makeVocab(this.corpus, this.config.vocabSize);
      this.population = Array.from({ length: this.config.populationSize }, () => new NeuralGenome({
        neurons: this.config.neurons,
        synapses: this.config.synapses,
        vocabSizeTarget: this.config.vocabSize,
        vocab: this.vocab
      }));
      this.generation = 0;
      this.history = [];
      return this.best();
    }

    best() {
      return this.population[0];
    }

    setCorpus(text) {
      this.corpus = cleanTrainingText(text, 2_500_000) || DEFAULT_SEED_TEXT;
      if (!this.corpora.length) {
        this.corpora.push({ name: "main", text: this.corpus, difficulty: 1, enabled: true });
      } else {
        this.corpora[0] = { ...this.corpora[0], text: this.corpus, enabled: true };
      }
      this.vocab = makeVocab(this.corpus, this.config.vocabSize);
      for (const genome of this.population) genome.setVocab(this.vocab);
    }

    clearConversationMemory(options = {}) {
      if (options.keepSummary !== true) this.memorySummary = "";
      this.recentTranscript = [];
      this.persistentContext = "";
      this.memoryBank = [];
      const calmStrength = clamp(Number(options.calmStrength ?? 0.16), 0, 0.35);
      for (const genome of this.population) {
        if (genome?.calmMemoryGates) genome.calmMemoryGates(calmStrength);
        genome.memoryBalancePenalty = 0;
        genome.memoryEnergy = 0;
      }
      return { memoryBank: this.memoryBank.length, summaryChars: this.memorySummary.length };
    }

    focusCorpus(text, name = "focused sample") {
      const cleaned = cleanTrainingText(text, 2_500_000) || DEFAULT_SEED_TEXT;
      this.corpora = [{ name, text: cleaned, difficulty: 1, enabled: true }];
      this.corpus = cleaned;
      this.clearConversationMemory({ calmStrength: 0.2 });
      this.vocab = makeVocab(this.corpus, this.config.vocabSize);
      for (const genome of this.population) genome.setVocab(this.vocab);
      this.curriculumLevel = 1;
      this.history = [];
      if (this.triggerMemoryRepair) this.triggerMemoryRepair(80);
      return this.corpus;
    }

    addCorpus(name, text, difficulty = 1) {
      const cleaned = cleanTrainingText(text, 1_200_000);
      if (!cleaned) return;
      const selfGenerated = /\b(self|mirror|reflection|dream|tool|context)-?|\bself-generated\b|\bself-tune\b/i.test(name || "");
      if (selfGenerated && trainingValueScore(cleaned) < 0.42) return false;
      this.corpora.push({
        name: name || `corpus-${this.corpora.length + 1}`,
        text: cleaned,
        difficulty: clamp(Number(difficulty) || 1, 1, 10),
        enabled: true
      });
      this.rebuildCurriculumCorpus();
      return true;
    }

    rebuildCurriculumCorpus() {
      const eligible = this.corpora
        .filter(corpus => corpus.enabled && corpus.difficulty <= this.curriculumLevel)
        .sort((a, b) => a.difficulty - b.difficulty);
      const active = eligible.length ? eligible : this.corpora.filter(corpus => corpus.enabled);
      this.corpus = cleanTrainingText(active.map(corpus => `\n\n# ${corpus.name}\n${corpus.text}`).join(""), 2_500_000) || DEFAULT_SEED_TEXT;
      this.vocab = makeVocab(this.corpus + this.persistentContext, this.config.vocabSize);
      for (const genome of this.population) genome.setVocab(this.vocab);
    }

    trainingSlice(maxChars = 760) {
      this.curriculumLevel = clamp(1 + Math.floor(this.generation / 250), 1, 10);
      this.rebuildCurriculumCorpus();
      const mirrorText = this.spiralStatus().active
        ? this.mirrorCorpus.slice(-24).join("\n")
        : this.mirrorCorpus.slice(-6).join("\n");
      const source = `${this.userProfile}\n${this.memorySummary}\n${this.persistentContext}\n${mirrorText}\n${this.corpus}`;
      if (source.length <= maxChars) return source;
      const window = Math.max(maxChars, 120);
      const offset = (this.generation * 997) % Math.max(1, source.length - window);
      return source.slice(offset, offset + window);
    }

    setConfig(config = {}) {
      const previousVocabSize = this.config.vocabSize;
      this.config = {
        ...this.config,
        ...config,
        neurons: clamp(config.neurons ?? this.config.neurons, 64, MAX_NEURONS),
        synapses: clamp(config.synapses ?? this.config.synapses, 128, MAX_SYNAPSES),
        populationSize: clamp(config.populationSize ?? this.config.populationSize, 4, 24),
        mutation: clamp(config.mutation ?? this.config.mutation, 0.001, 0.2),
        scalarMutation: clamp(config.scalarMutation ?? this.config.scalarMutation, 0.001, 0.08),
        vocabSize: clamp(config.vocabSize ?? this.config.vocabSize, PRINTABLE.length, MAX_VOCAB_SIZE),
        gradientSteps: clamp(config.gradientSteps ?? this.config.gradientSteps, 0, 8),
        gradientLearningRate: clamp(config.gradientLearningRate ?? this.config.gradientLearningRate, 0.0005, 0.08)
      };
      if (this.config.vocabSize !== previousVocabSize) this.rebuildCurriculumCorpus();
    }

    speciate() {
      const threshold = 0.72;
      const species = [];
      for (const genome of this.population) {
        let placed = false;
        for (const group of species) {
          if (genome.distanceTo(group.representative) < threshold) {
            group.members.push(genome);
            placed = true;
            break;
          }
        }
        if (!placed) {
          species.push({
            id: `s${species.length + 1}`,
            representative: genome,
            members: [genome],
            bestFitness: genome.fitness || 0
          });
        }
      }
      for (const group of species) {
        group.members.sort((a, b) => this.selectionScore(b) - this.selectionScore(a));
        group.bestFitness = this.selectionScore(group.members[0]);
        for (const member of group.members) member.speciesId = group.id;
      }
      this.species = species;
      return species;
    }

    prepareGenomeContext(genome) {
      if (genome?.ensureGen7076Compatibility) genome.ensureGen7076Compatibility();
      if (genome?.setUserProfileAttention) genome.setUserProfileAttention(this.userProfile || "");
      return genome;
    }

    shapeFitness(genome, options = {}) {
      const targetNeurons = Math.max(64, options.targetNeurons || this.config.neurons || genome.neurons);
      const targetSynapses = Math.max(128, options.targetSynapses || this.config.synapses || genome.synapses);
      const evaluatedFitness = Number.isFinite(genome.fitness) ? genome.fitness : 0;
      let crossEntropyFitness = Number.isFinite(genome.baseFitness) && genome.baseFitness > 0
        ? genome.baseFitness
        : evaluatedFitness;
      const hasUsableLoss = Number.isFinite(genome.loss) && genome.loss < 100 && (genome.outputLength || 0) >= 4;
      if (!hasUsableLoss) crossEntropyFitness = Math.min(crossEntropyFitness, 0.035);
      const outputLength = Math.max(0, genome.outputLength || 0);
      const averageEntropy = clamp(Number.isFinite(genome.averageEntropy) ? genome.averageEntropy : 1, 0, 1);
      const averageTokenChars = clamp(Number.isFinite(genome.averageTokenChars) ? genome.averageTokenChars : 1, 1, 8);
      const subwordSpanScore = clamp(Number.isFinite(genome.subwordSpanScore) ? genome.subwordSpanScore : ((averageTokenChars - 1) / 5), 0, 1);
      const charSpan = outputLength * averageTokenChars;
      const lengthBonus = Math.log(1 + charSpan) * 0.014;
      const entropyCenter = 0.62;
      const entropyBonus = 0.06 - Math.abs(averageEntropy - entropyCenter) * 0.15;
      const subwordBonus = subwordSpanScore * 0.105;
      const responseMultiplier = clamp(1 + lengthBonus + entropyBonus + subwordBonus, 0.76, 1.34);
      const imageFitness = hasUsableLoss ? Math.max(0, evaluatedFitness - crossEntropyFitness) : 0;
      const shapedBase = crossEntropyFitness * responseMultiplier + imageFitness;
      genome.baseFitness = shapedBase;
      genome.lengthBonus = lengthBonus;
      genome.entropyBonus = entropyBonus;
      genome.subwordBonus = subwordBonus;

      const neuronRatio = clamp(genome.neurons / targetNeurons, 0.08, 1.35);
      const synapseRatio = clamp(genome.synapses / targetSynapses, 0.08, 1.45);
      const enabledCount = genome.enabled.reduce((sum, value) => sum + (value ? 1 : 0), 0);
      const enabledRatio = enabledCount / Math.max(1, genome.synapses);
      let recurrentLike = 0;
      for (let i = 0; i < genome.synapses; i++) {
        if (genome.enabled[i] && genome.from[i] >= genome.to[i]) recurrentLike += 1;
      }
      const recurrentRatio = recurrentLike / Math.max(1, enabledCount);
      let inhibitoryCount = 0;
      for (let i = 0; i < genome.neuronTypes.length; i++) if (genome.neuronTypes[i] === 1) inhibitoryCount += 1;
      const inhibitoryRatio = inhibitoryCount / Math.max(1, genome.neurons);
      const inhibitoryBalance = clamp(1 - Math.abs(inhibitoryRatio - 0.18) / 0.18, 0, 1);
      const memoryEnergy = Array.from(genome.memoryIn).reduce((sum, value, index) => {
        return sum + Math.abs(value) + Math.abs(genome.memoryForget[index] || 0) + Math.abs(genome.memoryWrite[index] || 0);
      }, 0) / Math.max(1, genome.memoryIn.length * 3);
      const memoryBalancePenalty = Math.min(0.14, Math.max(0, memoryEnergy - 1.05) * 0.11);

      const topologyBonus = 1
        + Math.min(0.18, Math.log2(1 + neuronRatio) * 0.11)
        + Math.min(0.16, Math.log2(1 + synapseRatio) * 0.09)
        + Math.min(0.1, recurrentRatio * 0.45)
        + Math.min(0.08, enabledRatio * 0.08)
        + Math.min(0.08, memoryEnergy * 0.025)
        + Math.min(0.045, inhibitoryBalance * 0.045)
        + Math.min(0.14, Math.max(0, genome.selfTuningGain || 0) * 1.6)
        + Math.min(0.08, Math.max(0, genome.embeddingMutationGain || 0) * 0.6);

      const previousFitness = Number.isFinite(genome.previousFitness) ? genome.previousFitness : 0;
      const grew = genome.neurons > (genome.previousNeurons || genome.neurons) || genome.synapses > (genome.previousSynapses || genome.synapses);
      const stableOrImproved = !previousFitness || shapedBase >= previousFitness * 0.96;
      const growthBonus = grew && stableOrImproved ? Math.min(0.12, Math.max(0, genome.growthGain || 0) * 0.9) : 0;
      const healthyScaleBonus = hasUsableLoss && stableOrImproved
        ? Math.min(0.055, Math.log2(1 + Math.min(neuronRatio, 1.2)) * 0.034 + Math.log2(1 + Math.min(synapseRatio, 1.28)) * 0.024)
        : 0;
      const toolUseBonus = Math.min(0.08, Math.max(0, genome.toolUseScore || genome.metadata?.toolUseScore || 0) * 0.08);
      const memoryStabilityBonus = Math.min(0.045, Math.max(0, genome.memorySensitivity || 0) * Math.max(0, genome.coherenceScore || 0) * 0.018);
      const naturalnessBonus = Math.min(0.18, Math.max(0, genome.trainingValueScore || 0) * 0.18);
      const userProfileBonus = this.userProfile ? Math.min(0.14, Math.max(0, genome.coherenceScore || 0) * 0.07 + Math.max(0, genome.humanFeedbackScore || 0) * 0.09) : 0;
      const humanFeedbackBonus = Math.min(0.32, Math.max(0, genome.humanFeedbackScore || 0) * 0.32);
      const sensoryGateBonus = Math.min(0.08, Math.max(0, genome.sensoryGateBonus || genome.sensoryGateEfficiency * 0.08 || 0));
      const linguisticBonus = Math.min(0.18, Math.max(0, genome.linguisticScore || 0) * 0.18);
      const speechCoherenceBonus = Math.min(0.24, Math.max(0, genome.speechCoherenceScore || 0) * 0.24);
      const passiveLearningBonus = Math.min(0.14, Math.max(0, genome.passiveLearningScore || 0) * 0.14);
      const profileStrengthBonus = Math.min(0.12, Math.max(0, genome.userProfileStrength || 0) * 0.12);
      const contaminationPenalty = Math.min(0.26, Math.max(0, genome.contaminationScore || 0) * 0.26);
      const repetitionPenalty = Math.min(0.22, Math.max(0, genome.repetitionScore || 0) * 0.22);
      genome.growthBonus = growthBonus;
      genome.healthyScaleBonus = healthyScaleBonus;
      genome.toolUseBonus = toolUseBonus;
      genome.memoryStabilityBonus = memoryStabilityBonus;
      genome.naturalnessBonus = naturalnessBonus;
      genome.humanFeedbackBonus = humanFeedbackBonus;
      genome.userProfileBonus = userProfileBonus;
      genome.sensoryGateBonus = sensoryGateBonus;
      genome.linguisticBonus = linguisticBonus;
      genome.speechCoherenceBonus = speechCoherenceBonus;
      genome.passiveLearningBonus = passiveLearningBonus;
      genome.profileStrengthBonus = profileStrengthBonus;
      genome.contaminationPenalty = contaminationPenalty;
      genome.repetitionPenalty = repetitionPenalty;
      genome.memoryBalancePenalty = memoryBalancePenalty;
      genome.memoryEnergy = memoryEnergy;
      genome.inhibitoryRatio = inhibitoryRatio;
      genome.inhibitoryBalance = inhibitoryBalance;
      const coherenceBonus = Math.min(0.11, Math.max(0, genome.coherenceScore || 0) * 0.11);
      const dialogueBonus = Math.min(0.14, Math.max(0, genome.dialogueScore || 0) * 0.14);
      const spiralNoveltyBonus = options.spiralActive
        ? Math.min(0.22, Math.max(0, genome.spiralNoveltyScore || 0) * 0.22)
        : 0;
      genome.coherenceBonus = coherenceBonus;
      genome.dialogueBonus = dialogueBonus;
      genome.spiralNoveltyBonus = spiralNoveltyBonus;

      const scaleFloor = options.protectScale === false ? 0.18 : 0.72;
      const scalePenalty = Math.min(1, Math.max(scaleFloor, Math.sqrt(neuronRatio) * 0.72 + Math.sqrt(synapseRatio) * 0.28));
      genome.fitness = shapedBase * topologyBonus * scalePenalty * (1 + growthBonus + healthyScaleBonus + toolUseBonus + memoryStabilityBonus + coherenceBonus + dialogueBonus + naturalnessBonus + humanFeedbackBonus + userProfileBonus + sensoryGateBonus + linguisticBonus + speechCoherenceBonus + passiveLearningBonus + profileStrengthBonus + spiralNoveltyBonus) * (1 - memoryBalancePenalty) * (1 - contaminationPenalty) * (1 - repetitionPenalty);
      const immigrantProtected = genome.origin === "immigrant" && Number(genome.metadata?.protectedUntil || 0) > this.generation;
      if (genome.origin === "immigrant" && neuronRatio < 0.55 && !immigrantProtected) genome.fitness *= 0.62;
      genome.stableFitness = clamp(Math.max(genome.fitness, (genome.stableFitness || 0) * 0.992), 0, Math.max(1, genome.fitness * 1.35 + 0.1));
      genome.metadata = { ...(genome.metadata || {}) };
      genome.metadata.bestFitness = Math.max(genome.metadata.bestFitness || 0, genome.fitness || 0);
      genome.metadata.stableFitness = genome.stableFitness;
      return genome.fitness;
    }

    adaptiveTopologyTargets(options = {}) {
      const best = this.best() || { neurons: this.config.neurons, synapses: this.config.synapses, fitness: 0, loss: 999 };
      const recent = this.history.slice(-28).filter(point => Number.isFinite(point.fitness));
      const first = recent[0] || null;
      const last = recent[recent.length - 1] || null;
      const bestRecentFitness = recent.reduce((max, point) => Math.max(max, point.fitness || 0), 0);
      const fitnessGain = first && last && first.fitness > 0 ? (last.fitness - first.fitness) / first.fitness : 0;
      const lossGain = first && last && Number.isFinite(first.loss) && Number.isFinite(last.loss) ? first.loss - last.loss : 0;
      const dip = last && bestRecentFitness > 0 ? (bestRecentFitness - last.fitness) / bestRecentFitness : 0;
      const repairMemory = options.forceRepair || this.generation < (this.memoryRepairUntil || 0) || (best.memoryBalancePenalty || 0) > 0.045;
      const spiralActive = this.spiralStatus().active;
      const plateau = recent.length >= 14 && Math.abs(fitnessGain) < 0.018 && Math.abs(lossGain) < 0.08;
      const healthy = (best.fitness || 0) > 0.08 && Number.isFinite(best.loss) && best.loss < 20;
      const wave = Math.sin((this.generation + 1) / 9);
      let neuronScale = 1;
      if (healthy && fitnessGain >= -0.01) neuronScale += 0.018;
      if (fitnessGain > 0.025 || lossGain > 0.12) neuronScale += 0.026;
      if (plateau) neuronScale += wave >= 0 ? 0.038 : -0.032;
      if (dip > 0.08 || lossGain < -0.16) neuronScale -= 0.045;
      if (repairMemory) neuronScale -= 0.036;
      if (spiralActive) neuronScale += 0.034 + Math.max(0, wave) * 0.018;
      const heartbeat = plateau || Math.abs(neuronScale - 1) < 0.006
        ? (wave >= 0 ? 1 : -1) * Math.max(1, Math.round(best.neurons * 0.006))
        : 0;
      const configFloor = Math.max(64, Math.floor((options.minTopologyNeurons || this.config.neurons || best.neurons) * 0.62));
      const configCeiling = Math.min(MAX_NEURONS, Math.max(configFloor, Math.floor((options.maxTopologyNeurons || Math.max(this.config.neurons, best.neurons)) * 1.45)));
      const targetNeurons = clamp(Math.round(best.neurons * neuronScale + heartbeat), configFloor, configCeiling);
      const currentDensity = best.synapses / Math.max(1, best.neurons);
      let density = clamp(currentDensity, 2.1, 9.5);
      if (targetNeurons > best.neurons) density += 0.16;
      if (targetNeurons < best.neurons) density -= 0.12;
      if (plateau && wave < 0) density -= 0.08;
      if (repairMemory) density -= 0.18;
      if (healthy && (best.dialogueScore || 0) > 0.35) density += 0.06;
      if (spiralActive) density += 0.22;
      density = clamp(density, 2.0, 10.5);
      const synapseHeartbeat = plateau ? (wave >= 0 ? 1 : -1) * Math.max(8, Math.round(best.synapses * 0.008)) : 0;
      const targetSynapses = clamp(Math.round(targetNeurons * density + synapseHeartbeat), 128, MAX_SYNAPSES);
      return {
        neurons: targetNeurons,
        synapses: targetSynapses,
        mode: spiralActive ? "spiral-mirror" : repairMemory || dip > 0.08 ? "repair-prune" : plateau ? "explore-oscillate" : fitnessGain > 0.025 ? "healthy-grow" : "steady-drift"
      };
    }

    triggerMemoryRepair(generations = 75) {
      const until = this.generation + clamp(Math.floor(generations || 75), 10, 150);
      this.memoryRepairUntil = Math.max(this.memoryRepairUntil || 0, until);
      return this.memoryRepairUntil;
    }

    consolidateSpiralPhase(reason = "spiral exit") {
      const replay = this.dreamReplay({
        count: 10,
        maxChars: 1400,
        maxTokens: 360,
        gradientSteps: 1,
        plasticityBoost: 2.35,
        memoryCalm: 0.1,
        memoryCalmAfter: 0.08,
        includeCorpus: true,
        protectScale: true
      });
      this.triggerMemoryRepair(120);
      this.spiralPhase = { ...(this.spiralPhase || {}), active: false, lastExitReason: reason };
      return replay;
    }

    runMirrorLoop(champion = this.best(), trainingText = "", options = {}) {
      if (!champion) return { accepted: 0, novelty: 0, bestScore: 0 };
      const recent = this.recentTranscript.slice(-16).map(item => item.text || "").filter(Boolean);
      const mirrorSource = cleanTrainingText([
        this.memorySummary,
        this.persistentContext.slice(-2400),
        recent.join("\n"),
        this.mirrorCorpus.slice(-12).join("\n"),
        trainingText
      ].filter(Boolean).join("\n"), options.sourceChars || 3600);
      const fragments = mirrorSource
        .split(/(?<=[.!?])\s+|\n+/)
        .map(part => cleanGeneratedText(part, 220))
        .filter(part => part.length >= 24)
        .slice(-10);
      const prompts = [
        `Reflect on what you just said: ${fragments.at(-1) || "I am learning to answer more coherently."}`,
        `What would your mirror self hallucinate here, then correct into something useful? ${fragments.at(-2) || ""}`,
        `Find a fresh angle that differs from memory, but stays meaningful: ${fragments.at(-3) || ""}`,
        "Mirror check: describe one flaw in your last answer and one better pattern."
      ];
      const oldExcitation = champion.spiralExcitation || 0;
      const oldPlasticity = champion.plasticityRate;
      champion.spiralExcitation = clamp(options.excitation ?? 0.32, 0, 0.45);
      champion.plasticityRate = clamp(oldPlasticity * (options.plasticityBoost ?? 1.45), 0, 0.04);
      const maxPrompts = clamp(Math.floor(options.maxPrompts || 3), 1, 4);
      let accepted = 0;
      let bestScore = 0;
      let noveltyTotal = 0;
      const acceptedPairs = [];
      try {
        for (let i = 0; i < maxPrompts; i++) {
          const prompt = prompts[i % prompts.length];
          const response = cleanGeneratedText(champion.generate(prompt, options.maxOutput || 300, 1.08 + i * 0.08), 520);
          if (!response) continue;
          const novelty = clamp(1 - ngramOverlapScore(response, mirrorSource), 0, 1);
          const entropy = textEntropy(response);
          const quality = chatQualityScore(response);
          const dialogue = naturalDialogueScore(response);
          const score = quality * 0.28 + dialogue * 0.24 + entropy * 0.18 + novelty * 0.3;
          bestScore = Math.max(bestScore, score);
          noveltyTotal += novelty;
          if (score < (options.minScore ?? 0.42) || entropy < 0.38 || novelty < 0.22) continue;
          const pair = formatDialoguePair(prompt, response);
          acceptedPairs.push(pair);
          this.mirrorCorpus.push(pair);
          accepted += 1;
        }
        this.mirrorCorpus = this.mirrorCorpus.slice(-80);
        if (acceptedPairs.length) {
          const replay = `${CHAT_PRIMER_TEXT}\n${acceptedPairs.join("\n")}`;
          champion.adaptDialogue(replay, options.adaptRate || 0.02, options.maxChars || 1000);
          champion.gradientFineTune(replay, {
            dialogueMode: true,
            steps: options.gradientSteps ?? 1,
            learningRate: options.gradientLearningRate || Math.min(0.03, (this.config.gradientLearningRate || 0.016) * 1.4),
            maxTokens: options.maxTokens || 260
          });
          champion.evaluateDialogue(replay, options.maxChars || 1000);
          champion.evaluateCoherence(`${mirrorSource}\n${replay}`, "Answer with a novel but coherent reflection.");
          this.remember(`Mirror corpus accepted ${accepted} reflection(s), best score ${bestScore.toFixed(2)}.`);
        }
      } finally {
        champion.spiralExcitation = oldExcitation;
        champion.plasticityRate = oldPlasticity;
      }
      const novelty = noveltyTotal / Math.max(1, maxPrompts || 1);
      champion.spiralNoveltyScore = clamp((champion.spiralNoveltyScore || 0) * 0.72 + novelty * 0.28 + accepted * 0.035, 0, 1);
      return { accepted, novelty, bestScore, mirrorCorpus: this.mirrorCorpus.length };
    }

    evolveOnce(options = {}) {
      const start = performance.now();
      if (this.population.length < Math.min(4, this.config.populationSize)) {
        this.ensurePopulationDiversity(Math.min(4, this.config.populationSize), { protectChampion: true, immigrantEvery: 3 });
      }
      const autoSpiralReason = options.spiral !== false ? this.shouldTriggerSpiral() : null;
      if (autoSpiralReason) this.startSpiralPhase(autoSpiralReason);
      const spiral = this.spiralStatus();
      const topologyTargets = this.adaptiveTopologyTargets(options);
      const fitnessOptions = {
        ...options,
        targetNeurons: options.targetNeurons || topologyTargets.neurons,
        targetSynapses: options.targetSynapses || topologyTargets.synapses,
        spiralActive: spiral.active
      };
      const trainingText = options.trainingText || this.trainingSlice(options.maxChars || 760);
      const imageTargets = Array.isArray(options.imageTargets) ? options.imageTargets.filter(Boolean) : [];
      const imageTarget = options.imageTarget || (imageTargets.length ? imageTargets[this.imageTrainingCursor % imageTargets.length] : null);
      const dialogueMode = options.dialogueMode || /[\u0001\u0002\u0003]|\b(User|Human|NeuroGenesis|Assistant):/i.test(trainingText);
      if (imageTargets.length) this.imageTrainingCursor = (this.imageTrainingCursor + 1) % imageTargets.length;
      for (const genome of this.population) {
        this.prepareGenomeContext(genome);
        if (dialogueMode) genome.evaluateDialogue(trainingText, options.dialogueMaxChars || options.maxChars || 1200);
        else genome.evaluateText(trainingText, options.maxChars || 760);
        if (imageTarget) {
          this.lastImageLoss = genome.trainImage(imageTarget, options.imagePrompt || imageTarget.name || "", options.imageLearningRate || 0.012);
        }
        this.shapeFitness(genome, fitnessOptions);
      }
      this.population.sort((a, b) => this.selectionScore(b) - this.selectionScore(a));
      if (dialogueMode && options.dialogueProbe !== false) {
        const probeCount = Math.min(this.population.length, options.dialogueProbeCount || 6);
        const probeReference = trainingText.slice(0, options.dialogueProbeReferenceChars || 1600);
        for (let i = 0; i < probeCount; i++) {
          this.population[i].evaluateCoherence(probeReference, "Answer naturally and usefully in one or two sentences.");
          if (i < Math.min(4, probeCount)) this.population[i].evaluateSpeechCoherence("Reply to the user in clear natural speech.", probeReference);
          this.shapeFitness(this.population[i], fitnessOptions);
        }
        this.population.sort((a, b) => this.selectionScore(b) - this.selectionScore(a));
      }
      if (this.population.length >= 6 && this.generation > 0 && this.generation % 12 === 0 && this.innovationDiversity() < 0.24) {
        const seedSize = clamp(Math.floor((this.population[0]?.neurons || this.config.neurons) * 0.55), 400, MAX_NEURONS);
        this.injectImmigrants(2, seedSize);
        for (const genome of this.population.slice(-2)) {
          if (dialogueMode) genome.evaluateDialogue(trainingText, options.dialogueMaxChars || options.maxChars || 1200);
          else genome.evaluateText(trainingText, options.maxChars || 760);
          this.shapeFitness(genome, fitnessOptions);
        }
        this.population.sort((a, b) => this.selectionScore(b) - this.selectionScore(a));
      }
      const protectedFloor = options.protectScale === false ? 64 : Math.max(64, Math.floor((fitnessOptions.targetNeurons || this.config.neurons) * 0.72));
      const protectedChampion = this.population.find(genome => genome.neurons >= protectedFloor) || this.population[0];
      if (protectedChampion !== this.population[0]) {
        this.population = [protectedChampion, ...this.population.filter(genome => genome !== protectedChampion)];
      }
      const species = this.speciate();
      const champion = this.population[0].clone();
      this.prepareGenomeContext(champion);
      const spiralMutationBoost = spiral.active ? 2.35 : 1;
      const mutationRate = clamp(this.config.mutation * (options.mutationMultiplier || 1) * spiralMutationBoost, 0.001, 0.25);
      if (dialogueMode) {
        const beforeLoss = champion.loss;
        champion.adaptDialogue(trainingText, 0.014, options.dialogueMaxChars || 900);
        champion.gradientFineTune(trainingText, {
          dialogueMode: true,
          steps: options.gradientSteps ?? this.config.gradientSteps,
          learningRate: options.gradientLearningRate ?? this.config.gradientLearningRate,
          maxTokens: options.gradientMaxTokens || (this.config.neurons > 1800 ? 260 : 420)
        });
        champion.evaluateDialogue(trainingText, options.dialogueMaxChars || options.maxChars || 1200);
        champion.selfTuningGain = Number.isFinite(beforeLoss) ? Math.max(0, beforeLoss - champion.loss) : 0;
      } else {
        const beforeLoss = champion.loss;
        champion.adaptText(trainingText, 0.012, 420);
        champion.gradientFineTune(trainingText, {
          dialogueMode: false,
          steps: options.gradientSteps ?? this.config.gradientSteps,
          learningRate: options.gradientLearningRate ?? this.config.gradientLearningRate,
          maxTokens: options.gradientMaxTokens || 320
        });
        champion.evaluateText(trainingText, options.maxChars || 760);
        champion.selfTuningGain = Number.isFinite(beforeLoss) ? Math.max(0, beforeLoss - champion.loss) : 0;
      }
      if (options.coherenceEval !== false) {
        champion.evaluateCoherence(trainingText, dialogueMode ? "Respond with a clear useful memory from training." : "Summarize the training text clearly.");
      }
      const nudgeEvery = options.topologyNudgeEvery ?? 2;
      if (options.topologyNudge !== false && nudgeEvery > 0 && this.generation % nudgeEvery === 0) {
        champion.nudgeTopology(fitnessOptions.targetNeurons, fitnessOptions.targetSynapses, 0.75);
      }
      this.shapeFitness(champion, fitnessOptions);
      if (options.distill !== false && this.generation % (options.distillEvery || 5) === 0) {
        this.selfDistillChampion(champion, trainingText, {
          prompts: options.distillPrompts,
          maxChars: options.dialogueMaxChars || options.maxChars || 900,
          learningRate: options.distillLearningRate || Math.min(0.026, (this.config.gradientLearningRate || 0.016) * 1.3)
        });
        this.shapeFitness(champion, fitnessOptions);
      }
      let mirrorResult = { accepted: 0, novelty: 0, bestScore: 0, mirrorCorpus: this.mirrorCorpus.length };
      if (spiral.active) {
        mirrorResult = this.runMirrorLoop(champion, trainingText, {
          maxPrompts: options.mirrorPrompts || 4,
          maxOutput: options.mirrorMaxOutput || 360,
          gradientSteps: options.mirrorGradientSteps ?? 1,
          excitation: 0.39,
          plasticityBoost: 1.75
        });
        this.shapeFitness(champion, fitnessOptions);
      }

      const targetPopulationSize = this.population.length < this.config.populationSize
        ? Math.min(this.config.populationSize, this.population.length + (options.populationSpawn || 2))
        : this.config.populationSize;
      const next = [champion];
      const totalFitness = species.reduce((sum, group) => sum + Math.max(0.0001, group.bestFitness), 0) || 1;
      let carriedElites = 1;
      const eliteCarryLimit = Math.min(4, Math.max(1, Math.floor(targetPopulationSize * 0.18)));
      for (const group of species) {
        if (next.length >= targetPopulationSize) break;
        if (carriedElites < eliteCarryLimit && group.members[0] !== this.population[0]) {
          next.push(group.members[0].clone());
          carriedElites += 1;
        }
        const quota = Math.max(1, Math.round((Math.max(0.0001, group.bestFitness) / totalFitness) * targetPopulationSize));
        for (let i = 0; i < quota && next.length < targetPopulationSize; i++) {
          const parentPool = group.members.slice(0, Math.max(1, Math.ceil(group.members.length * 0.65)));
          const parentA = this.tournamentSelect(parentPool);
          const parentB = this.tournamentSelect(parentPool) || parentA;
          const parent = parentA.crossover(parentB);
          parent.origin = "evolved";
          parent.generation = this.generation + 1;
          parent.mutate(mutationRate, {
            targetNeurons: fitnessOptions.targetNeurons,
            targetSynapses: fitnessOptions.targetSynapses,
            scalarMutation: options.scalarMutation ?? this.config.scalarMutation,
            structuralMutationMultiplier: spiral.active ? 2.35 : 1,
            memoryGateMutationMultiplier: spiral.active ? 2.6 : 1
          });
          next.push(parent);
        }
      }
      while (next.length < targetPopulationSize) {
        const group = species[Math.floor(Math.random() * species.length)] || { members: this.population };
        const parentA = this.tournamentSelect(group.members);
        const parentB = this.tournamentSelect(group.members) || parentA;
        const parent = parentA.crossover(parentB);
        parent.origin = "evolved";
        parent.generation = this.generation + 1;
        parent.mutate(mutationRate, {
          targetNeurons: fitnessOptions.targetNeurons,
          targetSynapses: fitnessOptions.targetSynapses,
          scalarMutation: options.scalarMutation ?? this.config.scalarMutation,
          structuralMutationMultiplier: spiral.active ? 2.35 : 1,
          memoryGateMutationMultiplier: spiral.active ? 2.6 : 1
        });
        next.push(parent);
      }
      const protectedImmigrants = this.population
        .filter(genome => genome.origin === "immigrant" && Number(genome.metadata?.protectedUntil || 0) > this.generation)
        .sort((a, b) => this.selectionScore(b) - this.selectionScore(a))
        .slice(0, Math.min(3, Math.max(1, Math.floor(targetPopulationSize * 0.18))));
      for (const immigrant of protectedImmigrants) {
        if (next.some(genome => genome.id === immigrant.id)) continue;
        const survivor = immigrant.clone();
        survivor.generation = this.generation + 1;
        survivor.mutate(mutationRate * 0.65, {
          targetNeurons: fitnessOptions.targetNeurons,
          targetSynapses: fitnessOptions.targetSynapses,
          scalarMutation: options.scalarMutation ?? this.config.scalarMutation,
          structuralMutationMultiplier: 1.35,
          memoryGateMutationMultiplier: 1.2
        });
        if (next.length < targetPopulationSize) next.push(survivor);
        else next[next.length - 1] = survivor;
      }
      this.population = next;
      this.generation += 1;
      this.population[0].generation = this.generation;
      this.population[0].wakeCycles = Math.max(0, Math.floor(Number(this.population[0].wakeCycles || 0))) + 1;
      let spiralConsolidation = null;
      const activeAfterGeneration = this.spiralStatus();
      if (spiral.active && activeAfterGeneration.active && spiral.startFitness > 0 && this.population[0].fitness >= spiral.startFitness * 1.08) {
        spiralConsolidation = this.consolidateSpiralPhase("fitness-improved");
      } else if (spiral.active && !activeAfterGeneration.active) {
        spiralConsolidation = this.consolidateSpiralPhase("max-generations");
      }
      const finalSpiral = this.spiralStatus();
      const elapsed = Math.round(performance.now() - start);
      const best = this.population[0];
      this.history.push({
        generation: this.generation,
        fitness: best.fitness,
        loss: best.loss,
        imageLoss: this.lastImageLoss,
        elapsed,
        species: species.length,
        curriculumLevel: this.curriculumLevel,
        neurons: best.neurons,
        synapses: best.synapses,
        targetNeurons: fitnessOptions.targetNeurons,
        targetSynapses: fitnessOptions.targetSynapses,
        topologyMode: topologyTargets.mode,
        spiralActive: finalSpiral.active,
        spiralReason: finalSpiral.reason,
        mirrorCorpus: this.mirrorCorpus.length
      });
      if (this.history.length > 160) this.history.shift();
      return { best, elapsed, species, imageTarget, imageLoss: this.lastImageLoss, topologyTargets, topologyMode: topologyTargets.mode, spiral: finalSpiral, mirrorResult, spiralConsolidation };
    }

    importChampion(data, options = {}) {
      const genome = NeuralGenome.fromJSON(data);
      this.config.neurons = genome.neurons;
      this.config.synapses = genome.synapses;
      this.config.vocabSize = clamp(genome.vocabSizeTarget || genome.vocab?.length || this.config.vocabSize, PRINTABLE.length, MAX_VOCAB_SIZE);
      this.vocab = genome.vocab;
      this.population = [genome];
      const lazyMinimum = clamp(options.minPopulation ?? Math.min(4, this.config.populationSize), 1, this.config.populationSize);
      const targetPopulation = options.lazyPopulation ? lazyMinimum : this.config.populationSize;
      this.ensurePopulationDiversity(targetPopulation, { protectChampion: true, immigrantEvery: 2, protectionGenerations: options.lazyPopulation ? 90 : 60 });
      this.generation = genome.generation || this.generation;
      return genome;
    }

    ensurePopulationDiversity(target = this.config.populationSize, options = {}) {
      const targetPopulation = clamp(Math.floor(target || this.config.populationSize), 1, this.config.populationSize);
      const champion = this.population[0] || this.best();
      if (!champion) return 0;
      let added = 0;
      while (this.population.length < targetPopulation) {
        const immigrant = options.immigrantEvery && added > 0 && added % options.immigrantEvery === 0;
        const seedNeurons = immigrant
          ? clamp(Math.max(400, Math.floor(champion.neurons * 0.55)), 64, MAX_NEURONS)
          : champion.neurons;
        const seedSynapses = immigrant
          ? clamp(Math.round(seedNeurons * Math.max(2.6, Math.min(6.5, champion.synapses / Math.max(1, champion.neurons)))), 128, MAX_SYNAPSES)
          : champion.synapses;
        const genome = immigrant
          ? new NeuralGenome({
            neurons: seedNeurons,
            synapses: seedSynapses,
            vocab: this.vocab,
            vocabSizeTarget: this.config.vocabSize,
            generation: this.generation,
            origin: "immigrant"
          })
          : champion.clone();
        genome.origin = immigrant ? "immigrant" : "evolved";
        genome.generation = this.generation;
        genome.metadata = {
          ...(genome.metadata || {}),
          protectedUntil: this.generation + clamp(Math.floor(options.protectionGenerations || 70), 20, 180),
          diversityCredit: immigrant ? 0.08 : 0.035
        };
        const passes = immigrant ? 3 : 1;
        for (let pass = 0; pass < passes; pass++) genome.mutate(this.config.mutation * (immigrant ? 2.6 : 1.25), {
          ...this.config,
          targetNeurons: this.config.neurons,
          targetSynapses: this.config.synapses,
          structuralMutationMultiplier: immigrant ? 2.4 : 1.35,
          memoryGateMutationMultiplier: immigrant ? 1.75 : 1
        });
        this.population.push(genome);
        added += 1;
      }
      return added;
    }

    tournamentSelect(pool = [], rounds = 3) {
      if (!pool.length) return this.best();
      let winner = pool[Math.floor(Math.random() * pool.length)];
      for (let i = 1; i < rounds; i++) {
        const challenger = pool[Math.floor(Math.random() * pool.length)] || winner;
        if (this.selectionScore(challenger) > this.selectionScore(winner)) winner = challenger;
      }
      return winner;
    }

    selfDistillChampion(champion = this.best(), trainingText = "", options = {}) {
      if (!champion) return { accepted: 0, bestScore: 0 };
      const reference = cleanTrainingText(trainingText || this.corpus || DEFAULT_SEED_TEXT, options.maxChars || 1200);
      const prompts = options.prompts || [
        "Reply warmly to a user who says hello.",
        "Answer a user's question in one clear natural paragraph.",
        "Recall one useful detail from the recent conversation.",
        "Ask a gentle follow-up when the user's request is unclear."
      ];
      let bestPair = "";
      let bestScore = 0;
      const maxPrompts = clamp(Math.floor(options.maxPrompts || 3), 1, 5);
      const candidatesPerPrompt = clamp(Math.floor(options.candidatesPerPrompt || 2), 1, 3);
      for (const prompt of prompts.slice(0, maxPrompts)) {
        for (let i = 0; i < candidatesPerPrompt; i++) {
          const response = cleanGeneratedText(champion.generate(prompt, 320, 0.55 + i * 0.16), 420);
          if (!isUsefulTrainingText(response, { minQuality: 0.54, minEntropy: 0.45, minDialogue: 0.42, minLength: 36, maxOneLetterRatio: 0.18 })) continue;
          const score = chatQualityScore(response) * 0.36
            + naturalDialogueScore(response) * 0.3
            + coherenceScore(response, reference) * 0.22
            + Math.min(1, Math.log(1 + response.length) / 6) * 0.12;
          if (score > bestScore) {
            bestScore = score;
            bestPair = formatDialoguePair(prompt, response);
          }
        }
      }
      if (!bestPair || bestScore < 0.48) return { accepted: 0, bestScore };
      champion.adaptDialogue(bestPair, options.learningRate || 0.018, options.maxChars || 900);
      const tuned = champion.gradientFineTune(bestPair, {
        dialogueMode: true,
        steps: options.steps || 1,
        learningRate: options.learningRate || 0.018,
        maxTokens: options.maxTokens || 280
      });
      champion.evaluateDialogue(`${CHAT_PRIMER_TEXT}\n${bestPair}`, options.maxChars || 900);
      champion.evaluateCoherence(`${reference}\n${bestPair}`, "Answer naturally from a useful memory.");
      champion.selfTuningGain = clamp((champion.selfTuningGain || 0) * 0.96 + bestScore * 0.025, 0, 0.5);
      this.remember(`Self-distilled dialogue score ${bestScore.toFixed(2)}: ${bestPair}`);
      return { accepted: 1, bestScore, tuned };
    }

    injectImmigrants(count = 4, seedNeurons = 400) {
      const replaceCount = Math.min(Math.max(0, Math.floor(count)), Math.max(0, this.config.populationSize - 1));
      if (!replaceCount) return 0;
      const floor = Math.max(64, Math.floor(this.config.neurons * 0.72));
      const rank = genome => (Number.isFinite(genome.fitness) ? genome.fitness : 0) + (genome.neurons >= floor ? 10 : 0);
      this.population.sort((a, b) => rank(b) - rank(a));
      const immigrants = Array.from({ length: replaceCount }, () => new NeuralGenome({
        neurons: clamp(seedNeurons, 64, MAX_NEURONS),
        synapses: clamp(Math.round(seedNeurons * 3.5), 128, MAX_SYNAPSES),
        vocab: this.vocab,
        generation: this.generation,
        origin: "immigrant",
        fitness: 0
      }));
      for (const genome of immigrants) {
        genome.metadata = { ...(genome.metadata || {}), protectedUntil: this.generation + 110, diversityCredit: 0.1 };
        for (let pass = 0; pass < 3; pass++) genome.mutate(this.config.mutation * 2.4, {
          ...this.config,
          targetNeurons: this.config.neurons,
          targetSynapses: this.config.synapses,
          structuralMutationMultiplier: 2.2,
          memoryGateMutationMultiplier: 1.7
        });
      }
      this.population = this.population.slice(0, Math.max(1, this.config.populationSize - replaceCount)).concat(immigrants);
      return immigrants.length;
    }

    remember(text, options = {}) {
      if (!text || !text.trim()) return;
      const cleaned = cleanTrainingText(text, 4000);
      const source = options.source || (/^(User|Human):/i.test(cleaned) ? "human" : "system");
      const minValue = source === "human" ? 0.18 : source === "tool" ? 0.28 : 0.34;
      if (trainingValueScore(cleaned) < minValue) return;
      if (!isUsefulTrainingText(cleaned, { minQuality: 0.3, minEntropy: 0.28, minDialogue: 0.18, minLength: 8, maxContamination: source === "human" ? 0.52 : 0.34, maxRepetition: 0.42 })) return;
      this.recentTranscript.push({ at: Date.now(), text: cleaned.slice(0, 1400) });
      this.recentTranscript = this.recentTranscript.slice(-32);
      if (this.recentTranscript.length > 18 || this.persistentContext.length > 12000) this.consolidateConversationMemory();
      this.persistentContext = sanitizePersistentContext(`${this.persistentContext}\n${cleaned}`, 12000);
      if (source === "human") this.updateUserProfile(cleaned);
      const keywords = Array.from(keywordSet(cleaned, 24));
      if (cleaned && keywords.length) {
        const humanSignal = humanSignalScore(cleaned);
        const value = trainingValueScore(cleaned);
        this.memoryBank.push({
          at: Date.now(),
          text: cleaned.slice(0, 1800),
          keywords,
          source,
          strength: clamp((options.strength || 1) + humanSignal * 1.4 + value * 0.9, 0.1, 3),
          quality: value,
          humanSignal
        });
        this.memoryBank = sanitizeMemoryBank(this.memoryBank, 240);
      }
    }

    updateUserProfile(text) {
      const cleaned = cleanGeneratedText(text, 1400);
      if (!cleaned) return this.userProfile;
      const userLines = cleaned
        .split(/\n+/)
        .map(line => line.trim())
        .filter(line => /^(User|Human|Chris):/i.test(line) || /\b(i want|i like|i prefer|remember|my|call me|i feel|i think)\b/i.test(line))
        .slice(-8);
      if (!userLines.length) return this.userProfile;
      const source = `${this.userProfile}\n${userLines.join("\n")}`;
      const words = source.toLowerCase().match(/[a-z0-9][a-z0-9'-]{2,}/g) || [];
      const stop = new Set("the and for you are with that this from have into your about what when where how why can will not but all was were then than they them our out use using just very more much some been also there here after before because while should would could".split(" "));
      const counts = new Map();
      for (const word of words) {
        if (stop.has(word)) continue;
        counts.set(word, (counts.get(word) || 0) + 1);
      }
      const keywords = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 22).map(([word]) => word);
      this.userProfile = sanitizePersistentContext([
        keywords.length ? `User profile keywords: ${keywords.join(", ")}.` : "",
        ...userLines
      ].filter(Boolean).join("\n"), 3000);
      return this.userProfile;
    }

    consolidateConversationMemory(force = false) {
      if (!force && this.recentTranscript.length < 10 && this.persistentContext.length < 12000) return this.memorySummary;
      const source = cleanTrainingText([
        this.userProfile,
        this.memorySummary,
        this.recentTranscript.map(item => item.text).join("\n"),
        this.persistentContext.slice(-5000)
      ].filter(Boolean).join("\n"), 14000);
      const words = source.toLowerCase().match(/[a-z0-9][a-z0-9'-]{2,}/g) || [];
      const stop = new Set("the and for you are with that this from have into your about what when where how why can will not but all was were then than they them our out use using just very more much some been also there here after before because while should would could".split(" "));
      const counts = new Map();
      for (const word of words) {
        if (stop.has(word)) continue;
        counts.set(word, (counts.get(word) || 0) + 1);
      }
      const keywords = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 28).map(([word]) => word);
      const usefulLines = source
        .split(/\n+/)
        .map(line => cleanTrainingText(line, 280))
        .filter(line => line.length > 24 && isUsefulTrainingText(line, { minQuality: 0.28, minEntropy: 0.25, minDialogue: 0.12, minLength: 16 }))
        .slice(-16);
      const summary = [
        keywords.length ? `Long-term gist keywords: ${keywords.join(", ")}.` : "",
        ...usefulLines.slice(-8)
      ].filter(Boolean).join("\n");
      this.memorySummary = sanitizePersistentContext(summary, 6000);
      this.persistentContext = sanitizePersistentContext(this.persistentContext.slice(-7000), 9000);
      this.recentTranscript = this.recentTranscript.slice(-10);
      return this.memorySummary;
    }

    recallMemory(query, limit = 4) {
      const keys = keywordSet(query, 32);
      const profileHit = this.userProfile
        ? `[USER_PROFILE]\n${this.userProfile}\n[/USER_PROFILE]\n`
        : "";
      const summaryHit = this.memorySummary && [...keys].some(key => this.memorySummary.toLowerCase().includes(key))
        ? `[LONG_TERM_GIST]\n${this.memorySummary}\n[/LONG_TERM_GIST]\n`
        : "";
      if (!keys.size || !this.memoryBank.length) return `${profileHit}${summaryHit}`.trim();
      const recalled = this.memoryBank
        .map(item => {
          const overlap = item.keywords.reduce((sum, word) => sum + (keys.has(word) ? 1 : 0), 0);
          const recency = Math.max(0, 1 - (Date.now() - (item.at || 0)) / (1000 * 60 * 60 * 24 * 7));
          return { item, score: overlap * 2 + recency + (item.strength || 0) * 0.36 + (item.humanSignal || 0) * 1.25 + (item.source === "human" ? 0.8 : 0) };
        })
        .filter(row => row.score > 0.5)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(row => row.item.text)
        .join("\n");
      return `${profileHit}${summaryHit}${recalled}`.trim();
    }

    applyHumanFeedback(prompt = "", response = "", rating = 1) {
      const cleanPrompt = cleanTrainingText(prompt, 1200);
      const cleanResponse = cleanGeneratedText(response, 1600);
      if (!cleanPrompt || !cleanResponse) return { accepted: false, reason: "empty" };
      const value = trainingValueScore(cleanResponse);
      const best = this.best();
      if (rating > 0) {
        const pair = formatDialoguePair(cleanPrompt, cleanResponse);
        this.remember(`User: ${cleanPrompt}\nGenesis: ${cleanResponse}`, { source: "human", strength: 3 });
        this.addCorpus(`human-approved-${Date.now()}`, pair, 1);
        best.adaptDialogue(`${CHAT_PRIMER_TEXT}\n${this.userProfile || ""}\n${pair}`, 0.032, 1200);
        best.gradientFineTune(pair, {
          dialogueMode: true,
          steps: 2,
          learningRate: Math.min(0.038, (this.config.gradientLearningRate || 0.016) * 1.9),
          maxTokens: 360
        });
        best.evaluateDialogue(pair, 1000);
        best.evaluateCoherence(pair, "Answer naturally in the user's preferred style.");
        best.humanFeedbackScore = clamp((best.humanFeedbackScore || 0) * 0.72 + Math.max(0.42, value) * 0.38, 0, 1);
        this.shapeFitness(best, { protectScale: true, trainingText: pair });
        return { accepted: true, rating: 1, value, fitness: best.fitness };
      }
      const avoid = formatDialoguePair(cleanPrompt, "Give a clearer, more natural answer. Avoid repetition, lab-log words, and fragments.");
      this.mirrorCorpus.push(avoid);
      this.mirrorCorpus = this.mirrorCorpus.slice(-80);
      best.contaminationScore = clamp((best.contaminationScore || 0) + metaContaminationScore(cleanResponse) * 0.25, 0, 1);
      best.repetitionScore = clamp((best.repetitionScore || 0) + repetitionScore(cleanResponse) * 0.25, 0, 1);
      best.humanFeedbackScore = clamp((best.humanFeedbackScore || 0) * 0.92 - 0.05, 0, 1);
      this.shapeFitness(best, { protectScale: true, trainingText: avoid });
      return { accepted: true, rating: -1, value, fitness: best.fitness };
    }

    passiveLearnFromTyping(text = "", options = {}) {
      const cleaned = cleanTrainingText(text, options.maxChars || 1600);
      if (cleaned.length < (options.minChars || 12)) return { learned: false, reason: "too-short" };
      const value = trainingValueScore(cleaned);
      if (value < (options.minValue || 0.2)) return { learned: false, reason: "low-value", value };
      this.updateUserProfile(`User: ${cleaned}`);
      const best = this.best();
      this.prepareGenomeContext(best);
      const pair = formatDialoguePair(cleaned, "I should listen to this wording and answer clearly in the user's style.");
      best.adaptDialogue(`${this.userProfile || ""}\n${pair}`, options.learningRate || 0.006, options.adaptChars || 700);
      const probe = best.evaluateSpeechCoherence(cleaned, `${this.userProfile}\n${cleaned}`);
      best.passiveLearningScore = clamp((best.passiveLearningScore || 0) * 0.78 + Math.max(value, probe.score || 0) * 0.22, 0, 1);
      if (cleaned.length >= 48 && /[.!?]$|\n/.test(cleaned)) {
        this.remember(`User: ${cleaned}`, { source: "human", strength: 1.25 });
      }
      this.shapeFitness(best, { protectScale: true, trainingText: pair });
      return { learned: true, value, speech: probe.score || 0, userProfileChars: this.userProfile.length, fitness: best.fitness };
    }

    evolveSensoryGate(genome = this.best(), rawTokens = "") {
      if (!genome?.evolveSensoryGate) return { filteredText: cleanTrainingText(rawTokens, 6000), efficiency: 0, bonus: 0, tokens: 0 };
      const result = genome.evolveSensoryGate(rawTokens);
      genome.toolUseCount = Math.max(0, Math.floor(Number(genome.toolUseCount || 0))) + 1;
      this.shapeFitness(genome, { protectScale: true, trainingText: result.filteredText || String(rawTokens || "") });
      return result;
    }

    maybeCircadianDream(options = {}) {
      const champion = this.best();
      if (!champion) return null;
      const wakeReady = (champion.wakeCycles || 0) >= (options.wakeThreshold || 200);
      const toolReady = (champion.toolUseCount || 0) >= (options.toolThreshold || 10);
      if (!wakeReady && !toolReady && !options.force) return null;
      const result = this.dreamReplay({
        count: options.count || 8,
        maxChars: options.maxChars || 1200,
        maxTokens: options.maxTokens || 360,
        gradientSteps: options.gradientSteps ?? 1,
        plasticityBoost: options.plasticityBoost || 2.15,
        memoryCalm: options.memoryCalm ?? 0.06,
        memoryCalmAfter: options.memoryCalmAfter ?? 0.045,
        protectScale: true
      });
      champion.wakeCycles = 0;
      champion.toolUseCount = 0;
      champion.metadata = { ...(champion.metadata || {}), wakeCycles: 0, toolUseCount: 0, lastCircadianDreamAt: Date.now() };
      return result;
    }

    dreamReplay(options = {}) {
      const champion = this.best();
      this.prepareGenomeContext(champion);
      this.consolidateConversationMemory();
      const sourceText = cleanTrainingText(`${this.userProfile}\n${this.memorySummary}\n${this.persistentContext}\n${this.mirrorCorpus.slice(-24).join("\n")}\n${this.corpus}`, options.sourceChars ?? 9000);
      if (!this.memoryBank.length && !sourceText) return { dreamed: 0, loss: champion.loss, coherence: champion.coherenceScore || 0, tuned: null, lossDelta: 0 };
      const count = clamp(Math.floor(options.count ?? 6), 1, 18);
      const charBudget = clamp(Math.floor(options.maxChars ?? 1100), 240, 4000);
      const recentChars = Math.max(120, Math.floor(charBudget * 0.4));
      const memoryChars = Math.max(120, Math.floor(charBudget * 0.4));
      const corpusChars = Math.max(80, Math.floor(charBudget * 0.2));
      const now = Date.now();
      const memories = this.memoryBank
        .map(item => {
          const ageDays = Math.max(0, (now - (item.at || now)) / 86_400_000);
          const recency = 1 / (1 + ageDays * 0.4);
          const quality = chatQualityScore(item.text) + textEntropy(item.text) * 0.4;
          return { item, score: (item.strength || 1) * 0.7 + recency * 0.45 + quality };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, count)
        .map(row => row.item.text);
      let memoryReplay = "";
      for (const memory of memories) {
        if (memoryReplay.length >= memoryChars) break;
        memoryReplay = `${memoryReplay}\n${memory}`.trim();
      }
      const weakTurns = this.memoryBank
        .map(item => ({ item, quality: chatQualityScore(item.text) + textEntropy(item.text) * 0.25 }))
        .filter(row => row.quality > 0.08 && row.quality < 0.48)
        .sort((a, b) => a.quality - b.quality)
        .slice(0, options.weakTurnCount ?? 3)
        .map(row => row.item.text);
      const coherenceBoost = weakTurns.length
        ? Array.from({ length: clamp(Math.floor(options.weakTurnRepeats ?? 2), 1, 3) }, () => weakTurns.join("\n")).join("\n")
        : "";
      const corpusReplay = options.includeCorpus === false
        ? ""
        : dialogueTrainingText(sourceText, options.corpusChars ?? corpusChars);
      const replay = [
        CHAT_PRIMER_TEXT,
        this.userProfile ? `[USER_PROFILE]\n${this.userProfile}\n[/USER_PROFILE]` : "",
        this.persistentContext.slice(-recentChars),
        memoryReplay,
        coherenceBoost,
        corpusReplay
      ].filter(Boolean).join("\n");
      const beforeLoss = champion.loss;
      const oldPlasticity = champion.plasticityRate;
      champion.plasticityRate = clamp(oldPlasticity * (options.plasticityBoost ?? 2.2), 0, 0.04);
      const memoryCalmBefore = champion.calmMemoryGates(options.memoryCalm ?? 0.04);
      champion.adaptDialogue(replay, options.adaptRate ?? 0.018, options.maxChars ?? 1100);
      const tuned = champion.gradientFineTune(replay, {
        dialogueMode: true,
        steps: options.gradientSteps ?? Math.max(1, this.config.gradientSteps || 2),
        learningRate: options.gradientLearningRate ?? Math.min(0.028, (this.config.gradientLearningRate || 0.016) * 1.35),
        maxTokens: options.maxTokens ?? 420
      });
      champion.plasticityRate = oldPlasticity;
      champion.evaluateDialogue(replay, options.maxChars ?? 1100);
      champion.evaluateCoherence(replay, "Recall a useful memory and answer coherently.");
      const memoryCalmAfter = champion.calmMemoryGates(options.memoryCalmAfter ?? 0.025);
      champion.selfTuningGain = clamp((champion.selfTuningGain || 0) + Math.max(0, (beforeLoss || champion.loss) - champion.loss) * 0.5, 0, 0.5);
      this.shapeFitness(champion, { ...options, trainingText: replay });
      if (options.incrementDreamCount) {
        champion.metadata = { ...(champion.metadata || {}) };
        champion.dreamCount = Math.max(0, Math.floor(Number(champion.dreamCount || champion.metadata.dreamCount || 0))) + 1;
        champion.metadata.dreamCount = champion.dreamCount;
      }
      champion.wakeCycles = options.resetWakeCycles === true ? 0 : champion.wakeCycles;
      if (options.resetToolUse === true) champion.toolUseCount = 0;
      champion.metadata = { ...(champion.metadata || {}), wakeCycles: champion.wakeCycles || 0, toolUseCount: champion.toolUseCount || 0 };
      return {
        dreamed: memories.length + (corpusReplay ? 1 : 0) + weakTurns.length,
        loss: champion.loss,
        coherence: champion.coherenceScore || 0,
        tuned,
        memoryCalm: {
          energy: memoryCalmAfter.energy || memoryCalmBefore.energy || 0,
          adjusted: (memoryCalmBefore.adjusted || 0) + (memoryCalmAfter.adjusted || 0)
        },
        lossDelta: (beforeLoss || champion.loss) - champion.loss,
        dreamCount: champion.dreamCount || 0,
        mix: { recent: 0.4, memory: 0.4, corpus: options.includeCorpus === false ? 0 : 0.2, weakTurns: weakTurns.length }
      };
    }
  }

  window.GenesisEngine = {
    DEFAULT_SEED_TEXT,
    GENOME_SCHEMA_VERSION,
    MAX_NEURONS,
    MAX_SYNAPSES,
    DEFAULT_VOCAB_SIZE,
    MAX_VOCAB_SIZE,
    CHAT_PRIMER_TEXT,
    CONTROL_HUMAN,
    CONTROL_ASSISTANT,
    CONTROL_TURN_END,
    STRUCTURAL_TOKENS,
    CONTROL_LABELS,
    NEURON_TYPES,
    TYPE_COLORS,
    clamp,
    hashString,
    cleanTrainingText,
    cleanGeneratedText,
    isUsefulTrainingText,
    sanitizePersistentContext,
    sanitizeMemoryBank,
    dialogueTrainingText,
    formatDialoguePair,
    chatQualityScore,
    textEntropy,
    repetitionScore,
    metaContaminationScore,
    humanSignalScore,
    trainingValueScore,
    calculateLinguisticFitness,
    coherenceScore,
    ngramOverlapScore,
    naturalDialogueScore,
    makeVocab,
    encodeTokens,
    decodeTokens,
    extractImageLatent,
    NeuralGenome,
    EvolutionLab
  };
})();
