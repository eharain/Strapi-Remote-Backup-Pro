# 0002 — Engine in Node + TypeScript

**Status:** Accepted · 2026-08-18

## Context

The engine does the real work: talking to Strapi, walking the relation graph,
streaming archives, and pushing to eight destinations. It has to run as a CLI, as a
background service, and behind the desktop app.

Two candidates were considered seriously: Node + TypeScript, and Rust.

The opening argument for Node was direct code reuse from the sibling project
`strapi-content-sync-pro`, which already implements dependency resolution, media
sync, and a record applier. On inspection that argument was weaker than it looked.
Those modules read the content model from the in-process `strapi.contentTypes`
registry, and this tool has no in-process Strapi — they must be rewritten against
the Content-Type Builder API regardless of language. What genuinely transfers is
knowledge: draft/publish divergence, `documentId` semantics, the `fields[]`
rejection rules. Knowledge transfers to any language, so it stopped being an
argument for this one.

## Decision

Node + TypeScript.

## Consequences

**What this buys.** The fastest path to working software, and the speed lands
exactly where the complexity is. Walking and remapping dynamically-shaped JSON
graphs is the bulk of the restore logic, and it is markedly less verbose in
TypeScript than in a statically-typed alternative. First-party SDKs exist for every
destination, including the OAuth-heavy ones — Google Drive, Dropbox, OneDrive —
where other ecosystems offer only community wrappers. And
`npx strapi-remote-backup-pro` reaches Strapi developers on the channel they
already use, on the same publishing pipeline as the team's other products.

**What it costs.**

*The Node runtime must be bundled into the desktop installer.* This is not
optional. If a GUI user has to install Node first, the entire cost of running two
runtimes has been paid for nothing. See [0004](0004-sidecar-contract.md).

*The engine ships as readable source.* ~~For a commercial product, minification is
not protection, and a licence check in a Node CLI is trivially removed. This was
the strongest argument for Rust.~~

**Correction, same day.** This cost was struck once the licence was settled. The
product ships under MIT ([licensing](../legal/licensing.md)), matching the two
sibling Pro products. MIT already grants everyone the right to read, modify, and
redistribute the source, so a compiled binary would withhold nothing the licence
does not give away — and a licence key would be a removable formality rather than a
restriction.

What was written up as the strongest argument for Rust turns out to carry no weight
here. It was reasoned from an assumption about the commercial model that was never
checked. Recorded rather than deleted, because the reasoning would otherwise be
repeated the next time this comes up.

*Memory ceilings need active defence.* Node's heap will not tolerate careless
buffering the way a native binary would. Record paging, archive writing, and media
transfer are all stream-based for this reason. That discipline is load-bearing, not
stylistic — the first place it lapses is the first instance too large to back up.

## Revisiting

The engine sits behind a process boundary and a schema-defined API
([0004](0004-sidecar-contract.md), [0008](0008-generated-contracts.md)). If binary
distribution or IP protection later outweighs the above, the engine can be replaced
without the desktop app noticing. That was a deliberate property of the design, not
a happy accident.
