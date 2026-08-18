# 0008 — C# DTOs are generated from the engine's schemas

**Status:** Accepted · 2026-08-18

## Context

Two languages exchange structured data across a process boundary
([0004](0004-sidecar-contract.md)). Both need types for the same shapes.

## Decision

The engine's zod schemas in `apps/core/src/contracts` are the single source of
truth. They are emitted to JSON Schema, and the C# DTOs are generated from that.

```
apps/core/src/contracts/*.ts        zod — authored by hand
        │  npm run schema:emit
        ▼
docs/api/schema/*.json              JSON Schema — committed
        │  build/scripts/generate-csharp-dtos
        ▼
apps/desktop/src/StrapiBackup.Core.Client/Generated/*.cs
```

CI regenerates and fails the build if the committed output differs from what the
current contracts produce.

## Consequences

**Why not hand-write both sides.** Two hand-maintained models in two languages
drift, and the drift is invisible until runtime. The failure mode is a field
silently arriving as null in the middle of a long backup run — expensive to
reproduce and easy to misdiagnose as a Strapi problem.

**Why zod as the source, not JSON Schema.** The engine needs runtime validation at
its API boundary regardless, since untrusted input arrives there. Deriving the
schema from the validator that already exists means the validation and the contract
cannot disagree. Authoring JSON Schema by hand would create a third artefact to
keep in sync.

**Why commit the JSON Schema.** It makes contract changes visible in a pull-request
diff. A change to a shared type is exactly the kind of change that deserves a
reviewer's attention, and in TypeScript alone it can look like a one-line edit.

**The generated folder is not editable.** Any fix belongs in the zod schema.
Editing generated C# produces a change that survives until the next codegen run and
then vanishes, which is worse than not making it.
