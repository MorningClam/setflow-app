<!--
Project: Setflow (static frontend prototype)
Purpose: Give AI coding agents quick, actionable guidance to be productive in this workspace.
Keep this file short (20-50 lines) and focused on discoverable, concrete patterns.
-->

# Copilot instructions for Setflow

- Project type: Static frontend prototype. The UI is a set of standalone HTML pages located at the repository root (files named `Setflow - *.html`). No package.json, bundler, or build step is present.

- Key files:
  - `api.js` — small placeholder for future API helpers and the main place to add network logic.
  - `Setflow - *.html` — individual page prototypes. They load Tailwind and Google Fonts via CDN and are intended to be drop-in static pages.

- Architecture / conventions to follow:
  - Treat each `Setflow - <Page>.html` as a single-page prototype (self-contained markup + styles via Tailwind CDN). Changes should avoid introducing a build chain unless the user requests it.
  - Keep JavaScript minimal and add helpers to `api.js` rather than scattering logic across many HTML files. When adding shared scripts, reference them with relative `<script src="...">` tags in the HTML files.
  - UI styling uses Tailwind via the CDN script tag at the top of each HTML. Do not convert to npm/Tailwind CLI without user approval.

- Data & integration notes:
  - There are currently no backend endpoints configured. `api.js` is a stub — add functions like `login()`, `fetchGigs()`, and `sendMessage()` here and wire them into pages where needed.
  - Pages link to each other by filename (for navigation). Preserve these relative links unless a routing decision is requested.

- Developer workflows discovered:
  - No build/test commands found. Run pages directly in a browser (open the HTML file). For quick iterative testing, open the local file in the browser or serve the directory with a static server when needed (e.g., `npx http-server .`).

- Example patterns to copy:
  - Add shared JS exports in `api.js` and include as `<script src="api.js"></script>` before page-specific inline scripts.
  - Follow existing naming: `Setflow - <Page Name>.html` (space-dash-space) for new pages.

- When editing or generating code, prefer small, isolated changes. Note in PR descriptions that this is a static prototype and whether a build system was added.

If anything above is unclear or you'd like me to target a specific page or add a basic static server script, tell me which one and I'll update the instructions.
