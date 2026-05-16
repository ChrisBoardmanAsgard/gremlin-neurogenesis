# Gremlin NeuroGenesis

Gremlin NeuroGenesis is a local-first, from-scratch neuroevolution lab. It evolves sparse recurrent neural organisms in JavaScript using genetic crossover, structural mutation, Hebbian-style lifetime plasticity, small local gradient tuning, memory gates, visual genes, and persistent genome checkpoints.

It does not call OpenAI, Claude, Gemini, Stable Diffusion, or any external AI model. The core "brain" is the evolving sparse genome in `engine.js`. Internet access, when enabled, is a controlled learned tool sense: Gremlin can learn to emit command tokens such as `[WIKI:...]`, `[SEARCH:...]`, `[FETCH:...]`, and `[YOUTUBE:...]`, and the Node server safely injects cleaned results back into context.

## Current Scope

Gremlin currently includes:

- Sparse recurrent neural genomes with evolvable neurons, synapses, weights, memory gates, personality vectors, visual heads, and token embeddings.
- NEAT-inspired speciation, innovation IDs, crossover, disabled genes, add/split/prune mutations, protected immigrants, and diversity rescue.
- Dynamic topology scaling with current caps of up to `20,000` neurons and `500,000` synapses.
- Subword-style tokenizer with default vocab target around `768` tokens, preserving chat control tokens:
  - `\u0001` human turn
  - `\u0002` Gremlin turn
  - `\u0003` turn end
- Masked dialogue training so Gremlin is graded mainly on the assistant side of conversations.
- Hebbian/STDP-like lifetime plasticity during forward passes and training.
- Champion-only local gradient tuning for faster exploitation without replacing the genetic system.
- Persistent long-term memory, recent transcript memory, memory summaries, and a user profile.
- Human feedback buttons in chat:
  - `Good reply` strengthens that prompt/answer pattern.
  - `Needs work` adds a correction pattern and penalizes repetition or contaminated output.
- Dream, Deep Dream, Deep Reflection, and bounded Spiral/Mirror mode.
- Text, PDF, Wikipedia article, image, and YouTube transcript ingestion.
- Visual encoder/decoder-style image training and local image generation/reconstruction.
- Controlled internet tools through the Node server.
- Local browser worker evolution and optional LAN workers.
- Render.com deployment support for always-on server evolution.
- Import/export of browser and server champions, including compact genome export.

## What This Is Not

This is not a frontier LLM. It is not trained on trillion-token datasets, does not use transformer-scale attention, and does not have GPU-backed tensor libraries like PyTorch or TensorFlow. It is a real experimental neural/evolutionary system, but coherence will be uneven, especially after resets, small corpora, noisy training data, or aggressive mutation phases.

The goal is not to wrap another AI. The goal is to grow a local organism whose behavior emerges from:

- genetic selection,
- sparse recurrent structure,
- memory gates,
- Hebbian plasticity,
- small local tuning,
- tool-use rewards,
- user feedback,
- and carefully filtered training data.

## Main Files

- `index.html` - Browser UI.
- `styles.css` - UI styling.
- `app.js` - Browser app logic, chat, import/export, visualization, feedback, Dream/Deep Dream controls.
- `engine.js` - Core genome, tokenizer, evolution, memory, fitness, image training, Spiral/Mirror, and feedback logic.
- `server.js` - Node server, 24/7 evolution, WebSocket updates, controlled tools, server checkpoints.
- `local-evolve-worker.js` - Browser Web Worker evolution.
- `worker.html` and `worker.js` - LAN worker page.
- `data/server-model.json` - Server champion save file, created at runtime.

## Run Locally

From this folder:

```powershell
node server.js
```

Then open:

```text
http://localhost:4173
```

If `node` is not recognized, install Node.js 20+ or use the included launch scripts from this folder:

```powershell
.\launch-genesis-lab.bat
```

Or, from anywhere:

```powershell
& "C:\Users\USER\Documents\Codex\2026-05-14\build-an-app-that-uses-the\launch-genesis-lab.bat"
```

## 24/7 Local Evolution

Start the server evolution window:

```powershell
.\launch-evolve-24-7.bat
```

Keep that server window open. The browser can close; the Node server keeps evolving and saves the best model regularly under `data/`.

Useful environment variables:

```text
AUTO_EVOLVE=1
EVOLVE_DELAY_MS=900
POPULATION_SIZE=16
MAX_NEURONS=12000
MAX_SYNAPSES=300000
NODE_ENV=production
```

The app also has throttling and worker timeouts to reduce browser lockups on large genomes.

## Render Deployment

This repo is set up for Render-style Node deployment:

- Build command: `npm install`
- Start command: `npm start`
- Runtime: Node 20+
- Health check: `/ping`

Free Render instances may sleep after inactivity. A ping monitor can help wake the service, but free-tier uptime and CPU are limited. Keep genome sizes and population settings conservative on hosted free tiers.

## Training Data

Supported inputs:

- Pasted text.
- Multiple named corpora with curriculum difficulty.
- Full Wikipedia article imports.
- PDFs through the server PDF endpoint.
- Image files for visual training.
- YouTube URLs for transcript context when available.
- Controlled web/wiki/search/fetch tool results.

Important: training data quality matters more than volume. Gremlin now filters low-value self-generated data, lab-log spam, repetition, tool-result clutter, and noisy text. Still, bad data can contaminate behavior. Prefer clean examples of the kind of conversation, facts, images, and style you want.

## Memory And Feedback

Gremlin keeps:

- short-term recurrent state,
- memory gates,
- a memory bank,
- a persistent context,
- a summarized long-term gist,
- and a user profile.

Human feedback is intentionally strong. Use `Good reply` when an answer has the tone or shape you want. Use `Needs work` when it repeats, fragments, overuses lab terms, or misses your intent.

## Evolution Modes

- `Evolve` - Normal local evolution.
- `Dream` - Offline replay/consolidation of memory, recent context, and corpus.
- `DEEP Dream` - Multimodal replay using image/video context plus text.
- `Deep Reflection` - Runs after pausing/stopping to inspect dips and consolidate weak areas.
- `Spiral/Mirror` - Bounded high-novelty phase for plateaus. It temporarily increases mutation, memory-gate mutation, novelty pressure, and self-reflective mirror prompts, then consolidates through Dream/repair-prune.

Spiral mode is intentionally bounded so it cannot run forever.

## Current Limits

- Text generation can still be fragmented, repetitive, or unstable.
- Fitness can plateau or dip, especially after importing noisy data or pulling a champion from a different environment.
- Visual generation is experimental and abstract.
- Tool use is controlled and useful for context, but Gremlin is not a search engine or fact model by itself.
- Browser performance can degrade with very large genomes, image training, or long PDF imports.
- Render free tier has limited CPU/RAM and may sleep.
- The system is research/prototype software, not a production assistant.

Recommended working ranges:

- Local laptop: start around `400` to `2,000` neurons, then grow.
- Stronger machine/server: `5,000` to `12,000` neurons can be practical with conservative population and delay settings.
- Current absolute caps: `20,000` neurons and `500,000` synapses.

## Practical Advice

- Keep a clean export before importing large corpora.
- Use focused, high-quality dialogue examples.
- Do not overfeed self-generated text.
- Use Dream after meaningful chat/training.
- Use Spiral/Mirror only for plateaus or when exploration is wanted.
- Pull server champions carefully; the app now protects against major neuron-count downgrades, but checkpoints are still your friend.

## Philosophy

Gremlin is an attempt to grow intelligence rather than rent it. It should stay local-first, inspectable, evolutionary, and weird in the productive sense: a sparse organism learning through pressure, memory, feedback, and lived training data.
