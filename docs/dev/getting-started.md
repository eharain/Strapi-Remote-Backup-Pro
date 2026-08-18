# Getting started

## Prerequisites

| | |
|---|---|
| Node | 20.11 or later — engine |
| .NET SDK | 10.0 — desktop app |
| Docker | optional, for the sandbox Strapi instances |

## Engine

```bash
cd apps/core
npm install
npm run build
npm test
```

Run the CLI straight from source without building:

```bash
npx tsx src/cli/index.ts --help
```

Start the local API by hand, which is what the desktop app does for you:

```bash
npm run serve
# prints one line: {"port":54123,"token":"..."}
```

With that port and token you can drive every operation with `curl` alone — the
engine is fully usable without the .NET app existing, and that is deliberate.

## Desktop app

```bash
cd apps/desktop
dotnet restore
dotnet build
dotnet run --project src/StrapiBackup.App
```

Point it at a working-tree engine instead of a bundled one:

```bash
export STRAPIBACKUP_CORE=/path/to/apps/core/src/cli/index.ts
```

Without that variable, `CoreLocator` prefers the bundled runtime and falls back to
a global `strapi-backup` on `PATH` — see
[ADR 0004](../adr/0004-sidecar-contract.md) for why that order matters.

## Sandbox instances

Integration tests need a real Strapi to talk to, because the admin API is the thing
under test and a mock would keep passing precisely when Strapi changed.

```bash
docker compose -f tools/sandbox/docker-compose.yml up -d
# Strapi v5 on :1337, Strapi v4 on :1338
cd apps/core && npm run test:integration
```

The seed schema deliberately includes the awkward cases: circular relations,
dynamic zones, nested repeatable components, several locales, and a mix of draft
and published entries. If a change works against the sandbox but you have not
exercised those, you have not tested it.

## Contract changes

The zod schemas in `apps/core/src/contracts` are the source of truth for everything
crossing the process boundary. After changing one:

```bash
cd apps/core && npm run schema:emit    # -> docs/api/schema/*.json
pwsh build/scripts/codegen.ps1          # -> generated C# DTOs
```

Both outputs are committed so contract changes show up in review. CI fails if they
are stale. Never hand-edit the generated C# — see
[ADR 0008](../adr/0008-generated-contracts.md).

## Where to start reading

1. [../architecture/overview.md](../architecture/overview.md) — how the pieces fit
2. [../adr](../adr) — why each piece is the way it is
3. `apps/core/src/contracts` — the vocabulary everything else is written in
4. `apps/core/src/strapi/contracts.ts` — the boundary v4/v5 differences stop at

## Conventions

**Everything streams.** No operation may hold an unbounded amount of data in
memory. If you find yourself collecting records into an array before writing them,
that is the bug.

**Logic goes in the engine.** The desktop app does UI, OS service control, native
pickers, and the credential vault. Nothing else.

**Restore paths get the strictest review.** Backup reads; restore writes to
someone's production CMS.
