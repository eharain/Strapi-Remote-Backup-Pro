# 0004 — The .NET app drives the engine over localhost HTTP

**Status:** Accepted · 2026-08-18

## Context

Two processes in two languages have to cooperate: the .NET desktop app and the Node
engine. The mechanism connecting them is the thing most likely to produce
hard-to-diagnose failures, so it is decided explicitly rather than allowed to
emerge.

Options considered: spawn the CLI per operation and parse stdout; a long-lived
process exchanging messages over stdin/stdout; a localhost HTTP server; named pipes
or Unix domain sockets.

## Decision

The engine runs as a long-lived child process exposing an HTTP API on loopback.

**Startup handshake.**

1. .NET spawns `strapi-backup serve --port 0 --parent-pid <pid>`.
2. The engine binds to port 0, letting the OS choose a free port, and generates a
   random bearer token.
3. It prints exactly one line of JSON to stdout: `{"port":54123,"token":"..."}`.
4. .NET reads that line, then stops reading stdout and speaks HTTP for everything
   else.

Logs go to stderr. Progress arrives as Server-Sent Events on
`GET /jobs/:id/events`.

## Consequences

**Why not stdout parsing.** Text output is written for humans and changes whenever
someone rewords a message. A .NET side that parsed it would break silently, and it
would break in the shape of a hang rather than an error — the worst possible
failure to diagnose from a user's bug report. The single handshake line is the only
structured thing on stdout, and it is a fixed contract.

**Why HTTP over pipes.** The same API serves the desktop app, and — behind the same
schemas — the CLI in-process. There is one implementation of every operation, so
the GUI and the command line cannot diverge. It is also testable with `curl` alone,
which means the engine can be developed and debugged without the .NET app existing
at all.

**Why port 0 and a per-process token.** A fixed port collides when two instances
run, and on a shared machine it lets any local process reach the engine. This
process holds live admin credentials for someone's CMS. Two rules follow and are
not negotiable: **bind to 127.0.0.1 only**, and **require the token on every
request**. Binding to `0.0.0.0` would publish those credentials to the network.

**Orphan prevention needs two independent guarantees.** An engine that outlives its
parent is a security problem, not an untidy one. The engine watches `--parent-pid`
and exits when the parent disappears; on Windows the .NET side additionally places
the child in a Job Object with `KILL_ON_JOB_CLOSE`, so even a hard kill of the app
takes the engine with it. Either mechanism alone leaves a gap.

**The runtime is bundled.** The installer ships the Node runtime and the engine
together, and `CoreLocator` prefers the bundled copy over anything on `PATH`.
Falling back to a machine-wide Node would run the engine on whatever version
happens to be installed and produce bug reports nobody can reproduce. A version
mismatch between app and engine is refused at startup rather than tolerated,
because the two share generated contracts and skew surfaces as malformed JSON deep
inside a backup run.

**A crash loses the run.** Job state lives in the engine, so restarting it cannot
resume an in-flight backup. The UI is told the run was lost rather than left
showing a progress bar that will never move again.
