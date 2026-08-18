# Project worksheet

The single answer to "where is this up to?". Every other document says what the
product *should* be; this one says what it *is*.

Rules for keeping it honest:

- A line moves to **Done** only when the command that proves it exits zero.
  "The file exists" is not done.
- The gate table below is measured, not remembered. Re-run it before editing.
- When a milestone completes, update this file in the same commit as the code.

Last verified: 2026-08-18, against commit `455d8c3` plus the working-tree changes
committed alongside this file.

---

## Snapshot

The repository is a **complete scaffold with no implemented behaviour**. Every
type, module boundary, and architectural decision is in place and compiles; every
execution path throws `not implemented` / `NotImplementedException`.

That is the intended state at this point — the structure was built first, on
purpose, so that implementation work has somewhere to land and the constraints
that matter (streaming, engine-owns-logic, restore safety) are encoded in the
signatures before any code fills them in.

### Verification gates

Run from the repository root.

| Gate | Command | Status |
|---|---|---|
| Engine typecheck | `npm run typecheck` | **pass** |
| Engine build | `npm run build` | **pass** |
| Engine lint | `npm run lint` | **FAIL** (exit 2) — see B1 |
| Engine unit tests | `npm test` | **FAIL** (exit 1) — see B2 |
| Contract emit | `npm run schema:emit` | **FAIL** (exit 1) — see B3 |
| Desktop build | `dotnet build apps/desktop/StrapiBackup.sln -c Release` | **pass**, 0 warnings |
| Desktop tests | `dotnet test apps/desktop/StrapiBackup.sln -c Release` | passes vacuously — no tests exist |
| Integration | `npm run test:integration -w strapi-remote-backup-pro` | not runnable — no tests, no seed |

Three of the four CI jobs in [.github/workflows/ci.yml](../../.github/workflows/ci.yml)
are therefore red on a clean checkout. Clearing that is milestone M0.

---

## Done

### Decisions

Eight ADRs in [docs/adr](../adr), each recording alternatives and cost:
remote-only over the admin API (0001), Node/TypeScript engine (0002), Avalonia
UI (0003), localhost sidecar contract (0004), zip + NDJSON archive (0005),
scheduling in the engine (0006), v4/v5 behind a dialect (0007), generated C#
contracts (0008). The companion-Strapi-plugin route is recorded as deferred with
its reasoning, in [docs/dev/publishing.md](publishing.md).

### Engine contracts — the only substantive code in the repo

Zod schemas in [apps/core/src/contracts/](../../apps/core/src/contracts/) —
`connection`, `selection`, `job`, `archive`, `target`. These are the source of
truth for everything crossing a process boundary, and they compile and export
cleanly. Also real: [branding.ts](../../apps/core/src/branding.ts), the lazy
provider [registry.ts](../../apps/core/src/targets/registry.ts), and the
`BackupTarget` / `TargetProvider` interfaces in
[targets/contract.ts](../../apps/core/src/targets/contract.ts).

### Module skeleton

~70 engine modules and 24 C# files exist with final signatures and doc comments
explaining intent and constraints. Nothing behind them runs.

### Repository furniture

Workspace layout, tsconfig/eslint/vitest configs, .NET central package management,
CI and release workflows, issue forms and PR template, CONTRIBUTING, SECURITY,
CHANGELOG, and the full legal set — LICENCE, NOTICE, third-party notices, and
[docs/legal/licensing.md](../legal/licensing.md) covering the installer as a
redistribution.

### Developer docs

[getting-started.md](getting-started.md), architecture overview, archive-format
and security specs, and the sandbox `docker-compose.yml` for Strapi v4 + v5.

### Dependency hygiene

Avalonia floored at 11.3.20 to clear GHSA-xrw6-gwf8-vvr9 (transitive
`Tmds.DBus.Protocol`), with `Avalonia.Controls.DataGrid` tracked separately at
11.3.13 because it releases on its own cadence. Desktop builds warning-free with
`TreatWarningsAsErrors`.

---

## Not done

Everything below is unimplemented. Ordered by dependency — each milestone is
mostly blocked by the one above it.

### M0 · Unblock the feedback loop

Small, and worth doing before anything else: until these pass, no later milestone
has a working signal.

- **B1** `npm run lint` fails. `eslint src test` is passed a `test` directory
  containing only `.gitkeep` and a README, and ESLint exits 2 on a glob that
  matches nothing lintable. Fix when the first test file lands, or narrow the
  glob now.
- **B2** `npm test` fails. Vitest exits 1 when no test files match. Needs either
  a first real test or `passWithNoTests`.
- **B3** `npm run schema:emit` fails. `build/scripts/emit-json-schema.ts` is
  documented in [build/scripts/README.md](../../build/scripts/README.md) and
  wired into `package.json` and CI, but was never written. All five build
  scripts named there are missing: `codegen.ps1`, `emit-json-schema.ts`,
  `bundle-runtime.ps1`, `version.ps1`, `package-desktop.ps1`.

### M1 · Reach a live Strapi

The foundation for everything else, and the only part that cannot be designed
further without a real instance to test against.

`strapi/auth.ts` (admin login → JWT, never retried), `strapi/client.ts` (HTTP
transport: retry, backoff, concurrency cap, refresh), `strapi/probe.ts` (detect
v4 vs v5), `strapi/v4/` and `strapi/v5/` dialects, `strapi/contracts.ts` response
shapes, and `schema/discovery.ts` + `graph.ts` + `depth.ts` for the content model
and relation graph.

### M2 · Archive I/O

`archive/zip-writer.ts` (streaming, Zip64 unconditional, inline SHA-256),
`zip-reader.ts`, `format.ts` manifest, `crypto.ts` at-rest encryption. Spec
already written in [archive-format.md](../architecture/archive-format.md).

### M3 · Backup

`backup/planner.ts`, the five readers (`entries`, `media`, `schemas`, `i18n`,
`settings`), `backup/runner.ts` (streaming, resumable), `backup/writer.ts`.

### M4 · Destinations

Eight providers, all currently throwing: `local` first as the reference
implementation, then `s3`, `azureBlob`, `googleDrive`, `dropbox`, `oneDrive`,
`sftp`, `ftp`. SDKs are already in `package.json` and registration is already
lazy. Plus `targets/retention.ts` pruning.

### M5 · Restore — highest-risk work in the project

`restore/planner.ts` (produce a reviewable plan without writing), `remap.ts`
(relation identity remapping), `strategies.ts`, `applier.ts`. Writes to someone's
production CMS; gets the strictest review per CONTRIBUTING.

### M6 · Interfaces

Local API: `api/server.ts` (port 0 + bearer token per ADR 0004), `auth.ts`,
`routes/`, `events.ts` (SSE job events). CLI: all eight commands under
`cli/commands/` are empty — `backup`, `restore`, `login`, `inspect`, `verify`,
`serve`, `schedule`, `targets`. Plus `config/`, `scheduler/` (croner), and
`telemetry/`.

### M7 · Desktop app

Sidecar: `CoreLocator`, `CoreProcessSupervisor` (including the version-match
refusal), `EngineHostedService`. Client: `CoreApiClient` (6 throws),
`JobEventStream`. Shell: `ICredentialVault` has no platform implementation;
`AppPaths` throws; every view model is an empty declaration and every `.axaml`
view is a placeholder. `SelectionView` needs the content-type picker with
relation-depth control — the feature that justifies the GUI.

### M8 · Tests

No test exists in either stack. Needed: engine unit tests, xUnit tests for the
sidecar, sandbox seed data ([tools/sandbox/seed/](../../tools/sandbox/seed/) is
an empty README) covering circular relations, dynamic zones, nested repeatable
components, multiple locales, and draft/published mixes, then integration tests
against v4 and v5.

### M9 · Packaging and release

The five build scripts from B3, Node runtime bundling, per-platform installers
([build/](../../build/) is README-only), release workflow validation, and the
npm publish path.

---

## Constraints that bind every task

Four rules from CONTRIBUTING that are correctness requirements, not style:

1. **Everything streams.** Collecting records into an array before writing is the
   bug. Memory must stay flat on a 50 GB media library.
2. **Logic lives in the engine.** The desktop app does UI, OS service control,
   native pickers, and the credential vault. Nothing else.
3. **The engine is a guest on someone's production CMS.** Concurrency is capped,
   429/503 are backed off, login is never retried.
4. **Restore always produces a reviewable plan before it writes.**

Admin passwords are never persisted — used once for a JWT, then dropped. Only
destination credentials reach the vault.
