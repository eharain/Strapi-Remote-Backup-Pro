# 0006 — Scheduling lives in the engine, not the shell

**Status:** Accepted · 2026-08-18

## Context

Recurring backups are the main reason anyone installs a backup tool rather than
running an export by hand. The scheduler could live in the .NET service — which
already has to exist for OS service integration — or in the engine.

## Decision

The engine owns scheduling. The .NET service supervises the engine process and
handles OS service semantics, but does not decide when anything runs.

## Consequences

**What this buys.** A CLI user on a headless Linux server gets scheduling with no
GUI installed, which is a substantial share of the audience for a backup tool. And
there is one scheduler to keep correct rather than two implementations that must
agree about timezones, missed runs, and retry.

**What it costs.** The .NET service becomes thin enough that its value is easy to
question. That is the intended outcome — see [0003](0003-desktop-ui-avalonia.md).
It still earns its place: OS service registration, restart-on-failure, log
destination, and the credential vault that unattended runs depend on.

**Missed runs are caught up once, not replayed.** A laptop that slept through three
nightly windows should produce one backup on waking, not three. Skipping the
catch-up entirely is also wrong — the user asked for a nightly backup and would
have none.

**Retention runs only after a new archive is confirmed written.** Pruning before
the replacement has landed is the single most damaging bug a backup tool can have,
so the ordering is a correctness requirement rather than an implementation detail.
