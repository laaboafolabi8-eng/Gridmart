---
name: Vite manualChunks TDZ blanks production
description: Why a manualChunks config can blank the deployed site while dev works fine, and the rule for keeping it cycle-free.
---

# Symptom
Deployed/published site is a blank white page; dev preview works fine. Live HTML + JS chunks return 200. Browser console shows a single `pageerror`: `Cannot access 'X' before initialization` (minified) thrown at top level of a vendor chunk (e.g. `vendor-charts`). `#root` stays empty → React never mounts.

# Root cause
A Vite/Rollup `manualChunks` config that splits the React ecosystem across chunks creates a **circular dependency between two manual chunks**. When chunk A's top-level code runs (e.g. `Layer = React.forwardRef(...)`) before chunk B finished initializing the `React` binding, you get a temporal-dead-zone crash. Dev never hits this because Vite serves modules individually with no chunking.

Two concrete back-edges seen here:
1. Greedy `id.includes('react')` swept `react-smooth` (recharts' animation dep) AND scoped packages like `@uppy/react` into `vendor-react`; those use lodash `throttle`/`debounce` which lived in `vendor-charts` → `vendor-react` imported back from `vendor-charts`.
2. Rollup's shared CommonJS interop helper (`getDefaultExportFromCjs`, virtual module `commonjsHelpers`) got placed in `vendor-charts`; `vendor-react`'s CJS packages imported it back → cycle.

# The rule (how to keep manualChunks cycle-free)
- **The react core chunk must be a pure sink**: imported by everything, importing nothing. Verify by inspecting built chunks — `vendor-react -->` should list no other chunks.
- Match React core by **node_modules path boundary**, not substring, so scoped pkgs (`@uppy/react`) are excluded: `/[\\/]node_modules[\\/](react|react-dom|react-is|scheduler|use-sync-external-store|object-assign|prop-types)[\\/]/`.
- Keep a library's whole ecosystem together (recharts + `react-smooth` + `react-transition-group` + `d3-` + `victory-vendor` + `internmap` in one `vendor-charts`).
- **Co-locate the CJS interop helper with react core**: `if (id.includes('commonjsHelpers')) return 'vendor-react';` as the FIRST rule (it's a virtual module, not under node_modules).

# How to debug it fast
Chromium exists at `/nix/store/*-chromium-*/bin/chromium`; puppeteer is installed but has no bundled Chrome — pass that `executablePath`. Run probe scripts from the workspace root (not `/tmp`) so `node_modules` resolves. Build unminified (`npx vite build --minify false`) to get the real variable name + chunk:line in the stack. Map back-edges by grepping each built chunk for `from "./vendor-*.js"`.

**Why:** this exact bug blanked the published GridMart site (June 2026) while dev was fine; took several iterations because each fix shifted the cycle to a different shared module. A build-config fix only reaches production after the user re-Publishes.
