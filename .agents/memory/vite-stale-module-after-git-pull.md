---
name: Vite stale-module crash after git pull
description: Diagnosing the "Failed to fetch dynamically imported module" + "Invalid hook call" runtime crash that appears after a git pull/merge
---

# Stale Vite module crash after git pull / merge

**Symptom:** Browser runtime error `Failed to fetch dynamically imported module: .../src/pages/Xxx.tsx?t=<timestamp>` often paired with React `Invalid hook call`. The Express/Vite server logs show it was serving requests fine, then the browser-side error appears.

**Root cause:** A `git pull`/merge rewrote many frontend files while the dev server was running. The browser holds stale dynamic-import module URLs (note the `?t=` cache-buster) that no longer match the new bundle. It is NOT an actual hook-rule violation in the code.

**Fix:** Restart the `Start application` workflow to get a clean Vite dev server, then reload the page. No code change needed.

**Why this recurs here:** The user frequently pulls their divergent GitHub repo into the repl, which swaps out large numbers of frontend files at once.

**How to apply:** Before editing code to chase an "Invalid hook call", check whether a git pull just happened and the error includes "Failed to fetch dynamically imported module" — if so, restart the workflow first and re-check.
