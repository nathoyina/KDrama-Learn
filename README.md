# DramaK Companion (KDrama-Learn)

A local web companion for **learning Korean from the dramas you watch**—not just following the plot.

## Value proposition

- **Depth over raw subtitles:** Turn a single line into **translation**, **clickable vocabulary** (slang, honorifics, grammar), and **cultural notes** so you understand *how* people speak, not only *what* was said.
- **Study the moment:** Capture a line by typing or short **Listen & Analyze** audio, then **replay from the bookmark** or continue watching—aligned with deliberate practice instead of passive reading.
- **Your own corpus:** Save words to **My Bank**, search them, and use **practice** mode to revisit what you pulled from real scenes.

Subtitles help you **follow the story**. DramaK Companion helps you **learn language and nuance** from the same scenes.

## Target audience

- **Korean learners** who already watch K-dramas (or Korean shows) and want **retention**—vocabulary and cultural context tied to lines they care about.
- **Self-directed learners** who prefer a **lightweight companion** over switching to a textbook or separate app for every new phrase.
- **Technical users** comfortable running a **local** Node app and supplying their **own video files** (and optional `.srt` / `.vtt` for a clickable cue list).

## Run locally

**Prerequisites:** Node.js

1. Install dependencies:
   ```bash
   npm install
   ```
2. **API key (required):** Copy `.env.example` to `.env` and set `GEMINI_API_KEY`, or use encrypted env with `@chainlink/env-enc` (see `.env.example`). Vite reads env from the project root.
3. Start the dev server:
   ```bash
   npm run dev
   ```
   Open **http://localhost:3000** (default port in `package.json`).

Other scripts: `npm run build`, `npm run preview`, `npm run lint`.

## Security: do not commit API keys

- **Never commit** `.env`, `.env.local`, or `.env.enc`. They are listed in `.gitignore`.
- **Only** [`.env.example`](.env.example) should carry placeholder or commented examples—**no real keys** in the repository.
- If a key was ever committed, **rotate it** in [Google AI Studio](https://aistudio.google.com/apikey) and remove the file from git history (e.g. `git filter-repo` or GitHub guidance for leaked secrets).

---

Original AI Studio reference: [View app in AI Studio](https://ai.studio/apps/4a407789-08fb-405a-9754-2531ead3bb90)
