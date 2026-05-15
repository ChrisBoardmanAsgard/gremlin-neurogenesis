self.window = self;
importScripts("engine.js");

const { EvolutionLab } = self.GenesisEngine;

self.onmessage = event => {
  const job = event.data || {};
  if (job.type !== "evolve") return;
  try {
    const lab = new EvolutionLab({
      corpus: job.corpus,
      corpora: job.corpora,
      persistentContext: job.persistentContext,
      curriculumLevel: job.curriculumLevel,
      ...job.config
    });
    if (job.champion) lab.importChampion(job.champion);
    lab.generation = job.generation || lab.generation;
    if (Array.isArray(job.corpora)) lab.corpora = job.corpora;
    if (typeof job.persistentContext === "string") lab.persistentContext = job.persistentContext;
    if (job.curriculumLevel) lab.curriculumLevel = job.curriculumLevel;
    const result = lab.evolveOnce({ maxChars: job.maxChars || 760 });
    self.postMessage({
      ok: true,
      id: job.id,
      generation: lab.generation,
      corpus: lab.corpus,
      corpora: lab.corpora,
      persistentContext: lab.persistentContext,
      curriculumLevel: lab.curriculumLevel,
      config: lab.config,
      historyPoint: lab.history.at(-1),
      champion: result.best.toJSON()
    });
  } catch (error) {
    self.postMessage({ ok: false, id: job.id, error: error.message });
  }
};
