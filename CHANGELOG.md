# Changelog

## 2.0.0 — Proposed, unreleased

### Breaking

- Require Node.js >=22.19. Node 20 and earlier Node 22 releases are unsupported.
- Move from Lighthouse 12.8.2 to 13.5.0. Upstream scoring and audit identifiers can
  differ; review baselines before accepting comparisons across engine versions.

### Security

- Replace fast-glob/micromatch/braces with tinyglobby while preserving source
  discovery behavior and surfacing filesystem permission failures.
- Remove the vulnerable extract-zip/basic-ftp/proxy dependency cohort through the
  Lighthouse browser-management upgrade and update its telemetry dependency tree.
- Preserve independent production audits of the source lockfile and the installed
  tarball consumer. High/critical findings or incomplete audit evidence block release.

### Compatibility and reliability

- Reject unsupported Node runtimes before loading the application, including
  `--version` and `--help`; print an actionable compatibility message.
- Preserve server-response TTFB semantics with Lighthouse 13 insight extraction
  and legacy fallback. Add separate navigationTTFB, metric provenance and engine
  version evidence; missing metrics remain unavailable.
- Retain owned Chrome/worker cleanup, route-specific diagnostics, incomplete-audit
  failures, full scanner coverage and regression gates.
- Validate installed tarballs on Windows, Ubuntu and macOS using supported Node
  versions, with explicit negative Node 20 tests.
- Validate Lab 13 deterministic fixture scores separately from variable Lighthouse
  performance contributions, while retaining performance budgets and real reports.

### Release preparation

- Set the proposed package and root lockfile versions to 2.0.0.
- Generate Node 22.19.0 workflows with `qa-check init`, preserving existing files.
- Build with `prepack` to prevent missing or stale compiled output in normal packs.
- Include the MIT license text and document the Node 20 migration.

This entry is a proposed release, not a record of npm publication. Historical lab
documents retain the versions and audit results measured at their original dates.
