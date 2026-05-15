# Genesis Lab

Genesis Lab is a local, from-scratch experimental neural system. It does not call an external LLM or image model.

What it includes:

- Sparse neural genomes with visible neuron and synapse counts.
- NEAT-style speciation, innovation IDs, disabled genes, add-synapse mutation, and split-synapse mutation.
- Short-term memory gates for longer context than the original tiny recurrent state.
- Persistent context and an evolving personality vector.
- Default 400 neurons, current UI limit 20,000 neurons and 500,000 synapses.
- Genetic evolution over weights, sparse topology, and visual pattern genes.
- Character-level language generation from imported text.
- Wikipedia import through Wikimedia's public API, including batch full-article wikitext loading.
- Multiple corpora with curriculum difficulty.
- Image import, visual latent encoding, and local image reconstruction/generation.
- Chat mode driven by the current local champion genome.
- Image mode driven by the current local visual genome.
- Optional LAN worker page for browser tabs or devices you control.
- Browser-side Web Worker evolution for non-image training cycles.
- Live fitness graph and neuron activity visualizer.

Run it:

```powershell
node server.js
```

Then open:

```text
http://localhost:4173
```

On Windows you can also run `launch-genesis-lab.bat` from this folder. If PowerShell is open somewhere else, run:

```powershell
& "C:\Users\USER\Documents\Codex\2026-05-14\build-an-app-that-uses-the\launch-genesis-lab.bat"
```

For extra local compute, open the worker URL shown in the Network tab on another browser tab or another device on the same network.

Run 24/7 server evolution:

```powershell
& "C:\Users\USER\Documents\Codex\2026-05-14\build-an-app-that-uses-the\launch-evolve-24-7.bat"
```

Keep that server window open. The browser can close; the Node server keeps evolving and regularly saves the best model to `data/server-model.json`.

Limits:

This is a real local neural/evolutionary system, but it is not comparable to frontier LLMs trained on huge clusters. With 400 to 5,000 neurons, expect experimental behavior: noisy text at first, gradual corpus imitation, and abstract/generated images that improve only with enough evolution cycles and useful targets.
