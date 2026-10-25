# Portable Lab 11 CI fixture

Derived from the existing local Lab 11 React/Vite fixture. It retains the real three-route application, TypeScript/ESLint checks, styles, logo and dependency lockfile. Source defaults to the clean scenario. No generated output or dependencies are included.

The CI harness changes only a temporary copy's three scenario switches: broken image, console error, and network error. It rewrites the temporary copy's network target to an owned loopback HTTP server on an ephemeral port which deliberately resets connections. This avoids unrelated services and Vite's HTML fallback masking a missing resource. The copied QA configuration uses the normal CI profile, full scans and reports; the unrelated public sample API was removed so integration does not depend on a third-party service. Quality gates are not disabled.

Build locally with `npm ci` then `npm run build`. Run the complete integration from the repository root with `node tests/integration/lab11-cicd.mjs` after building the CLI and installing Playwright Chromium. `npm_execpath` can point to npm's JS entrypoint when npm is installed outside the Node installation directory.
