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
const dataDir = path.join(root, "data");
const backupsDir = path.join(dataDir, "backups");
const serverModelPath = path.join(dataDir, "server-model.json");
const serverLastGoodPath = path.join(dataDir, "server-model.last-good.json");
const toolLogPath = path.join(dataDir, "tool-use.log");

const { EvolutionLab, DEFAULT_SEED_TEXT, CHAT_PRIMER_TEXT, CONTROL_HUMAN, CONTROL_ASSISTANT, CONTROL_TURN_END, cleanGeneratedText, cleanTrainingText, dialogueTrainingText, chatQualityScore, textEntropy, naturalDialogueScore } = global.GenesisEngine;

// ====================== AUTO-LOAD CHAMPION ======================
async function loadChampionFromGitHub() {
  try {
    console.log("🔄 Attempting to load Gen 3431 champion from GitHub...");
    
    const response = await fetch('https://raw.githubusercontent.com/ChrisBoardmanAsgard/gremlin-neurogenesis/main/genesis-lab-generation-3431.json');
    
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const modelData = await response.json();
    
    if (serverLab && typeof serverLab.importChampion === 'function') {
      serverLab.importChampion(modelData.champion || modelData);
      console.log(`✅ Successfully loaded Gen ${modelData.generation || 3431} champion (${modelData.neurons || '?'} neurons)`);
      
      // Also load other fields
      if (modelData.corpus) serverLab.setCorpus(modelData.corpus);
      if (modelData.persistentContext) serverLab.persistentContext = modelData.persistentContext;
      if (Array.isArray(modelData.memoryBank)) serverLab.memoryBank = modelData.memoryBank.slice(-200);
      if (modelData.curriculumLevel) serverLab.curriculumLevel = modelData.curriculumLevel;
      
      saveServerModel(true);
      broadcastEvent("champion-loaded", { generation: modelData.generation });
    }
  } catch (err) {
    console.error("❌ Failed to load champion from GitHub:", err.message);
  }
}
// ============================================================

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
let serverLab = new EvolutionLab();
let serverImageTargets = [];
let serverEvolution = {
  running: false,
  delayMs: Number(process.env.EVOLVE_DELAY_MS || (isHosted ? 1200 : 180)),
  lastSavedAt: 0,
  startedAt: null,
  cycles: 0,
  dreams: 0,
  lastDream: null,
  error: null
};

// ... (rest of your existing code remains unchanged until the end) ...

// Keep all your existing functions (serveFile, serverChat, etc.)

// At the very end, after server.listen(...), add this:
server.listen(port, "0.0.0.0", () => {
  console.log(`Genesis Lab running at http://localhost:${port}`);
  for (const address of localAddresses()) {
    console.log(`LAN address: ${address}`);
  }
  console.log(`Server model path: ${serverModelPath}`);
  
  if (isHosted) {
    console.log("Hosted mode enabled: using conservative evolution pacing for small cloud instances.");
  }

  // Auto-load the big model
  setTimeout(loadChampionFromGitHub, 4000);

  if (process.env.AUTO_EVOLVE === "1") {
    startServerEvolution();
    console.log("Server evolution autopilot is running.");
  }
});

process.on("SIGINT", () => {
  stopServerEvolution();
  process.exit(0);
});