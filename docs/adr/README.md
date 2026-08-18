# Architecture decision records

One file per decision that would be expensive to reverse. Each records what was
decided, what else was considered, and what it costs — the last part matters most,
because a decision whose downsides were never written down gets re-litigated every
time one of them shows up.

| # | Decision | Status |
|---|---|---|
| [0001](0001-remote-only-via-admin-api.md) | Operate remotely over the admin API, never as a plugin | Accepted |
| [0002](0002-engine-language.md) | Engine in Node + TypeScript | Accepted |
| [0003](0003-desktop-ui-avalonia.md) | Desktop UI in .NET 10 + Avalonia | Accepted |
| [0004](0004-sidecar-contract.md) | .NET drives the engine over localhost HTTP | Accepted |
| [0005](0005-archive-format.md) | Zip archive with NDJSON content entries | Accepted |
| [0006](0006-scheduling-in-engine.md) | Scheduling lives in the engine, not the shell | Accepted |
| [0007](0007-strapi-v4-and-v5.md) | Support v4 and v5 behind a dialect interface | Accepted |
| [0008](0008-generated-contracts.md) | C# DTOs are generated from the engine's schemas | Accepted |
