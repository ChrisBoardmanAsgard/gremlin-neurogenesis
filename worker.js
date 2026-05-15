(function () {
  const { NeuralGenome } = window.GenesisEngine;
  const workerId = `worker-${Math.random().toString(36).slice(2, 9)}`;
  const status = document.getElementById("workerStatus");
  const logEl = document.getElementById("workerLog");
  const idEl = document.getElementById("workerId");
  let lastJobId = null;

  idEl.textContent = workerId;

  function log(message) {
    const line = `[${new Date().toLocaleTimeString()}] ${message}`;
    logEl.textContent = `${line}\n${logEl.textContent}`.slice(0, 6000);
  }

  async function tick() {
    try {
      status.textContent = "Polling";
      const response = await fetch(`/api/job?worker=${encodeURIComponent(workerId)}`);
      const payload = await response.json();
      const job = payload.job;
      if (!job || job.id === lastJobId) {
        status.textContent = "Waiting";
        return;
      }
      lastJobId = job.id;
      status.textContent = "Evolving";
      log(`Job ${job.id}: mutating ${job.rounds} candidates`);
      const parent = NeuralGenome.fromJSON(job.genome);
      let best = null;
      for (let i = 0; i < job.rounds; i++) {
        const candidate = parent.clone().mutate(job.mutation, {
          targetNeurons: job.neurons,
          targetSynapses: job.synapses,
          scalarMutation: job.scalarMutation || 0.028
        });
        candidate.evaluateDialogue(job.corpus, job.maxChars || 620);
        if (!best || candidate.fitness > best.fitness) best = candidate;
      }
      await fetch("/api/result", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: job.id,
          workerId,
          genome: best.toJSON(),
          fitness: best.fitness,
          loss: best.loss
        })
      });
      log(`Submitted fitness ${best.fitness.toFixed(4)}, loss ${best.loss.toFixed(3)}`);
      status.textContent = "Submitted";
    } catch (error) {
      status.textContent = "Offline";
      log(error.message);
    }
  }

  log("Ready.");
  tick();
  const pollTimer = setInterval(tick, 4000);
  window.addEventListener("beforeunload", () => clearInterval(pollTimer), { once: true });
})();
