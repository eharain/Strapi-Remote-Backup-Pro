# Project worksheet

The single answer to "where is this up to?". Every other document says what the
product *should* be; this one says what it *is*.

Rules for keeping it honest:

- A line moves to **Done** only when the command that proves it exits zero.
  "The file exists" is not done.
- The gate table below is measured, not remembered. Re-run it before editing.
- When a milestone completes, update this file in the same commit as the code.

Last verified: 2026-08-27, against the working tree — every gate in the table
below was re-run, and the round trip was run twice to confirm it is idempotent.

---

## Snapshot

**The engine works against Strapi v5.** Backing up a live instance and restoring
into another one has been run end to end, repeatedly, against two Strapi 5.52.0
instances — content, components, dynamic zones, relations, draft/published pairs
and a media library — and the result compared record by record.

The .NET desktop app is still entirely unimplemented, seven of the eight
destinations still throw, and the v4 dialect is written but has never been run
against a v4 instance.

### Verification gates

Run from the repository root. Measured 2026-08-27, not remembered.

| Gate | Command | Status |
|---|---|---|
| Engine typecheck | `npm run typecheck` | **pass** |
| Engine build | `npm run build` | **pass** |
| Engine lint | `npm run lint` | **pass** |
| Engine unit tests | `npm test` | **pass** — 39 tests |
| Contract emit | `npm run schema:emit` | **pass** — 17 schemas, byte-idempotent |
| Desktop build | `dotnet build apps/desktop/StrapiBackup.sln -c Release` | **pass**, 0 warnings |
| Desktop tests | `dotnet test apps/desktop/StrapiBackup.sln -c Release` | passes vacuously — no tests exist |
| Integration | `npm run test:integration -w strapi-remote-backup-pro` | **pass** — 7 tests against two live v5 instances; skips without credentials |

All four CI jobs in [.github/workflows/ci.yml](../../.github/workflows/ci.yml)
are green on a clean checkout. M0 is cleared.

---

## Done

### Decisions

Eight ADRs in [docs/adr](../adr), each recording alternatives and cost:
remote-only over the admin API (0001), Node/TypeScript engine (0002), Avalonia
UI (0003), localhost sidecar contract (0004), zip + NDJSON archive (0005),
scheduling in the engine (0006), v4/v5 behind a dialect (0007), generated C#
contracts (0008). The companion-Strapi-plugin route is recorded as deferred with
its reasoning, in [docs/dev/publishing.md](publishing.md).

### Engine contracts

Zod schemas in [apps/core/src/contracts/](../../apps/core/src/contracts/) —
`connection`, `selection`, `job`, `archive`, `target`. These are the source of
truth for everything crossing a process boundary, and they compile and export
cleanly. Also real: [branding.ts](../../apps/core/src/branding.ts), the lazy
provider [registry.ts](../../apps/core/src/targets/registry.ts), and the
`BackupTarget` / `TargetProvider` interfaces in
[targets/contract.ts](../../apps/core/src/targets/contract.ts).

### The engine, end to end on Strapi v5

Verified 2026-08-27 against two live Strapi 5.52.0 instances: back up A, restore
into B, back up B, compare record by record. Fifteen assertions, run repeatedly,
green and idempotent. The suite is
[test/integration/roundtrip.test.ts](../../apps/core/test/integration/roundtrip.test.ts).

- **Transport** — `strapi/http.ts`, `client.ts`, `auth.ts`. Retry with jittered
  backoff, `Retry-After` honoured, concurrency capped, one shared token renewal.
  Sign-in is never retried at any status: Strapi allows five attempts per window
  and a retry loop locks the user out of their own CMS.
- **Dialects** — `strapi/v5/` fully exercised; `strapi/v4/` written but never run
  against a v4 instance. `strapi/probe.ts` detects the version from
  `/admin/information`, falling back to whether records carry a `documentId`.
- **Schema** — `discovery`, `graph` (relations through components and dynamic
  zones, cycles reported not fatal), `depth` (breadth-first, deduplicated).
- **Archive** — streaming zip with inline SHA-256, Zip64 always, NDJSON content,
  optional AES-256-GCM per entry with the manifest left readable.
- **Backup and restore** — planner, readers, runner on both sides; two-pass
  restore with deferred relation patching; media matched so a second restore
  uploads nothing.
- **CLI** — `login`, `backup`, `restore`, `inspect`, `verify`.

What the round trip preserves, measured rather than assumed: field values,
relations (including across a cycle), components and dynamic zones, media
binaries, and draft/published pairs as two distinct versions.

### Module skeleton

24 C# files exist with final signatures and doc comments explaining intent and
constraints. Nothing behind them runs.

### Repository furniture

Workspace layout, tsconfig/eslint/vitest configs, .NET central package management,
CI and release workflows, issue forms and PR template, CONTRIBUTING, SECURITY,
CHANGELOG, and the full legal set — LICENCE, NOTICE, third-party notices, and
[docs/legal/licensing.md](../legal/licensing.md) covering the installer as a
redistribution.

### Getting it onto a customer's machine

Verified 2026-08-27. `build/installers/bootstrap/install.ps1` and `install.sh` —
the one command a non-technical customer runs. Stage a checksum-verified pinned
Node runtime, install the released package or build the source tree, write a
`strapi-backup` shim with a `PATH` entry and a desktop shortcut, then run the
result and report honestly. Re-running upgrades; uninstall reverses everything.

Measured on Windows, into a throwaway prefix: runtime download, checksum check
and unpack pass; the npm channel correctly finds nothing published and falls
back to source; `npm ci` and `npm run build` pass on the fetched tree; the shim
runs and reports `0.1.0`; uninstall clears the tree in 21 s. Not yet run on
macOS or Linux.

The self-test looks for commander's `Commands:` heading, which appears only once
a subcommand is actually registered. It reported **preview build** for as long as
that was true and reports a working install now that the CLI has commands —
which is the whole point of checking behaviour rather than checking that files
copied.

Two bugs found by running it, both fixed:

- **The CLI entry point was not in the repository.** `.gitignore` carried a bare
  `bin/` under its .NET section, which also matched `apps/core/bin/` — the file
  `package.json` names under `"bin"` and lists in `"files"`. It existed only on
  the machine it was written on, so a fresh clone could not run the CLI and
  `npm publish` from [release.yml](../../.github/workflows/release.yml) would
  have shipped a package whose command was missing from the tarball. The ignore
  rules are now scoped to `apps/desktop/**/`.
- **Recursive delete fails on Windows.** `Remove-Item -Recurse` and `rd /s /q`
  both give up part way through `node_modules`, which nests past `MAX_PATH`.
  Every upgrade and every uninstall failed. `Remove-Tree` in `install.ps1` falls
  back to a `robocopy /MIR` mirror.

### Developer docs

[getting-started.md](getting-started.md), [install.md](../user/install.md),
architecture overview, archive-format and security specs, and the sandbox
`docker-compose.yml` for Strapi v4 + v5.

### Dependency hygiene

Avalonia floored at 11.3.20 to clear GHSA-xrw6-gwf8-vvr9 (transitive
`Tmds.DBus.Protocol`), with `Avalonia.Controls.DataGrid` tracked separately at
11.3.13 because it releases on its own cadence. Desktop builds warning-free with
`TreatWarningsAsErrors`.

---

## Not done

Ordered by dependency. M0 through M3 and M5 are cleared; what follows is what
remains.

### M4 · Destinations — one of eight

`local` is implemented and is the reference: staged write to a `.part` file then
rename, path traversal refused, retention pruning that will not empty a folder.
`targets/retention.ts` is done and unit-tested.

Still throwing: `s3`, `azureBlob`, `googleDrive`, `dropbox`, `oneDrive`, `sftp`,
`ftp`. SDKs are already in `package.json` and registration is already lazy.

### M6 · Interfaces — CLI done, the rest not

Done: `cli/index.ts` and five commands — `login`, `backup`, `restore`, `inspect`,
`verify` — with `cli/options.ts` (flag and credential resolution, hidden password
prompt) and `cli/render.ts`.

Still empty: `cli/commands/serve.ts`, `schedule.ts`, `targets.ts`. Local API:
`api/server.ts` (port 0 + bearer token per ADR 0004), `auth.ts`, `routes/`,
`events.ts` (SSE job events). Plus `config/` profiles, `scheduler/` (croner), and
`telemetry/`.

### M7 · Desktop app

Sidecar: `CoreLocator`, `CoreProcessSupervisor` (including the version-match
refusal), `EngineHostedService`. Client: `CoreApiClient` (6 throws),
`JobEventStream`. Shell: `ICredentialVault` has no platform implementation;
`AppPaths` throws; every view model is an empty declaration and every `.axaml`
view is a placeholder. `SelectionView` needs the content-type picker with
relation-depth control — the feature that justifies the GUI.

### M8 · Tests — engine covered, gaps named

Done: 39 engine unit tests (relation graph, depth expansion, normalisation,
identity remapping, retention, archive round trip including encryption) and a
7-assertion integration round trip against two live v5 instances.

Not done, and each is a real gap rather than a formality:

- **No v4 coverage at all.** The v4 dialect is written from the documented
  differences and has never spoken to a v4 instance. Treat it as unverified.
- **No i18n coverage.** Both test instances have a single locale, so the
  per-locale paths in `readers/entries.ts` have never run with more than one.
- **No seed fixtures.** [tools/sandbox/seed/](../../tools/sandbox/seed/) is still
  an empty README, so the round trip depends on whatever the instances happen to
  hold. Needed: circular relations, dynamic zones, nested repeatable components,
  multiple locales, and draft/published mixes.
- **No scale test.** The largest library exercised was 12 files. The constant-
  memory claim for a 50 GB library is a design property, not a measured one.
- **No xUnit tests** for the sidecar, which has nothing to test yet.

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
