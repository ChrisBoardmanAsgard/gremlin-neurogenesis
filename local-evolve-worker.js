self.window = self;
importScripts("engine.js");

const { EvolutionLab } = self.GenesisEngine;

function normalizeImageTargets(targets) {
  if (!Array.isArray(targets)) return [];
  return targets.map(target => {
    const size = Number(target?.size || 48);
    const rawPixels = target?.pixels?.value || target?.pixels || [];
    const pixels = Array.isArray(rawPixels)
      ? rawPixels
      : ArrayBuffer.isView(rawPixels)
        ? Array.from(rawPixels)
        : Object.keys(rawPixels || {}).sort((a, b) => Number(a) - Number(b)).map(key => rawPixels[key]);
    if (pixels.length < size * size * 4) return null;
    return {
      name: String(target.name || "image target"),
      size,
      pixels: new Uint8ClampedArray(pixels.slice(0, size * size * 4).map(value => Math.max(0, Math.min(255, Number(value) || 0))))
    };
  }).filter(Boolean);
}

self.onmessage = event => {
  const job = event.data || {};
  if (job.type !== "evolve") return;
  const started = performance.now();
  try {
    const lab = new EvolutionLab({
      corpus: job.corpus,
      corpora: job.corpora,
      persistentContext: job.persistentContext,
      userProfile: job.userProfile,
      memorySummary: job.memorySummary,
      recentTranscript: job.recentTranscript,
      memoryBank: job.memoryBank,
      mirrorCorpus: job.mirrorCorpus,
      spiralPhase: job.spiralPhase,
      curriculumLevel: job.curriculumLevel,
      ...(job.workerConfig || job.config)
    });
    if (job.champion) lab.importChampion(job.champion, { lazyPopulation: true });
    if (job.workerConfig) lab.setConfig(job.workerConfig);
    lab.generation = job.generation || lab.generation;
    if (Array.isArray(job.corpora)) lab.corpora = job.corpora;
    if (typeof job.persistentContext === "string") lab.persistentContext = job.persistentContext;
    if (typeof job.userProfile === "string") lab.userProfile = job.userProfile;
    if (typeof job.memorySummary === "string") lab.memorySummary = job.memorySummary;
    if (Array.isArray(job.recentTranscript)) lab.recentTranscript = job.recentTranscript.slice(-32);
    if (Array.isArray(job.memoryBank)) lab.memoryBank = job.memoryBank.slice(-240);
    if (Array.isArray(job.mirrorCorpus)) lab.mirrorCorpus = job.mirrorCorpus.slice(-80);
    if (job.spiralPhase && typeof job.spiralPhase === "object") lab.spiralPhase = { ...lab.spiralPhase, ...job.spiralPhase };
    if (job.curriculumLevel) lab.curriculumLevel = job.curriculumLevel;
    const imageTargets = normalizeImageTargets(job.imageTargets);
    const imageTarget = normalizeImageTargets(job.imageTarget ? [job.imageTarget] : [])[0] || null;
    const result = lab.evolveOnce({
      maxChars: job.maxChars || 760,
      dialogueMaxChars: job.dialogueMaxChars || job.maxChars || 760,
      gradientSteps: job.gradientSteps ?? lab.config.gradientSteps,
      gradientMaxTokens: job.gradientMaxTokens,
      populationSpawn: job.populationSpawn || 1,
      dialogueProbe: job.dialogueProbe,
      dialogueProbeCount: job.dialogueProbeCount,
      imageTargets,
      imageTarget,
      imagePrompt: job.imagePrompt || imageTarget?.name || "",
      imageLearningRate: job.imageLearningRate || 0.01
    });
    const elapsed = Math.round(performance.now() - started);
    self.postMessage({
      ok: true,
      id: job.id,
      elapsed,
      generation: lab.generation,
      corpus: lab.corpus,
      corpora: lab.corpora,
      persistentContext: lab.persistentContext,
      userProfile: lab.userProfile,
      memorySummary: lab.memorySummary,
      recentTranscript: lab.recentTranscript,
      memoryBank: lab.memoryBank,
      mirrorCorpus: lab.mirrorCorpus,
      spiralPhase: lab.spiralPhase,
      curriculumLevel: lab.curriculumLevel,
      config: job.config || lab.config,
      historyPoint: lab.history.at(-1),
      champion: result.best.toCompactJSON(),
      imageLoss: result.imageLoss,
      imageTarget: result.imageTarget ? { name: result.imageTarget.name, size: result.imageTarget.size } : null
    });
  } catch (error) {
    self.postMessage({ ok: false, id: job.id, error: error.message });
  }
};
