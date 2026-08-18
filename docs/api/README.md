# Generated API artefacts

Not hand-written. Produced from the engine's contracts and committed so that
changes to a shared type are visible in a pull-request diff.

| Path | Produced by |
|---|---|
| `schema/*.json` | `npm run schema:emit` in `apps/core` |
| `openapi.json` | the engine's route definitions |

CI regenerates both and fails if the committed copies are stale.
See [ADR 0008](../adr/0008-generated-contracts.md).
