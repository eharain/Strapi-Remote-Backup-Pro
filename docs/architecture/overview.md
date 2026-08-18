# Architecture overview

## The shape of the thing

```
   ┌──────────────────────────────────────────────────────────────┐
   │  Strapi v4 / v5 — someone else's live production CMS         │
   │  no plugin installed, no code deployed, nothing changed      │
   └───────────────────────────┬──────────────────────────────────┘
                               │  admin REST API over HTTPS
                               │  /admin/login · /content-type-builder
                               │  /content-manager · /upload
   ┌───────────────────────────┴──────────────────────────────────┐
   │  ENGINE  (Node + TypeScript, apps/core)                      │
   │                                                              │
   │   strapi/   dialect adapters — v4 and v5 differences end here│
   │   schema/   content model, relation graph, depth expansion   │
   │   backup/   plan → stream records and media → archive        │
   │   restore/  plan → diff → apply in dependency order          │
   │   archive/  streaming zip, NDJSON, checksums, encryption     │
   │   targets/  local · S3 · Azure · Drive · Dropbox · OneDrive  │
   │             · SFTP · FTP                                     │
   │   scheduler/ cron, retention, catch-up                       │
   └──────┬─────────────────────────────────────┬─────────────────┘
          │ in-process                          │ 127.0.0.1 HTTP + SSE
          │                                     │ bearer token, port 0
   ┌──────┴────────┐                    ┌───────┴──────────────────┐
   │  CLI          │                    │  DESKTOP  (.NET 10)      │
   │  npx / global │                    │  Avalonia UI             │
   │  CI · cron    │                    │  credential vault        │
   └───────────────┘                    │  OS service control      │
                                        │  sidecar supervisor      │
                                        └──────────────────────────┘
```

## The one rule

**If it can be done in the engine, it is done in the engine.**

The desktop app contributes four things and nothing else: the UI, OS service
registration, native file pickers, and the credential vault. No backup logic, no
scheduling, no relation traversal.

The moment logic appears in both, the CLI and the GUI become two products that
behave differently, and every bug has to be diagnosed twice. The CLI is the
reference implementation; the GUI is a way of driving it.

## How a backup runs

1. **Probe** — reachability, Strapi major version, whether the credentials can read
   the Content-Type Builder. Failures surface here, before anything long-running
   starts.
2. **Discover** — content types, components, locales. This replaces the in-process
   `strapi.contentTypes` a plugin would have had, and is why admin credentials are
   required rather than an API token.
3. **Plan** — expand the selection along the relation graph to the requested depth,
   estimate record counts and media size. The user sees the scale and can
   reconsider before touching production.
4. **Stream** — page through records sorted by `updatedAt` ascending, writing each
   straight into the archive. Media downloads run through the same concurrency
   limiter.
5. **Finalise** — write the manifest with per-entry checksums, close the zip.
6. **Deliver** — fan the finished archive out to every configured target, then run
   retention *after* each write is confirmed.

## How a restore runs

1. **Read the manifest** — possible without the passphrase, so a UI can show what
   an archive holds before asking to unlock it.
2. **Plan** — diff the archive against the live instance. Creates, updates,
   deletes, skips, plus schema drift and relations that will land dangling.
3. **Confirm** — the plan is always shown. Restore writes to a live CMS; the
   confirmation is not a formality.
4. **Apply, pass one** — write records in dependency order, leaving circular
   relations empty.
5. **Apply, pass two** — patch the circular relations now that every target exists.

Two passes are not an optimisation. Real schemas contain cycles — article ↔ author
is the canonical one — and a single-pass restore has the CMS reject every write
whose target does not yet exist.

## Constraints that shape everything

**Memory is flat, not proportional.** Nothing holds more than one page of records
or one media file at a time. The largest instance is the one that most needs
backing up, so a design that works only on small ones fails at the point of the
product.

**We are a guest.** Concurrency is capped low, 429 and 503 are honoured with
backoff, and login is never retried automatically. A backup must not be the reason
a site goes down, and a retry loop against a throttled `/admin/login` locks the
user out of their own CMS.

**Restore is the dangerous half.** Backup reads; restore writes to production. The
plan is a first-class output, `replace` requires an explicit opt-in, and nothing is
written without confirmation.

**Credentials are handled once.** The Strapi admin password is exchanged for a JWT
and dropped — never persisted, never written into an archive, never logged. Only
long-lived destination secrets go to the vault, because unattended scheduled runs
cannot work without them.

## Where decisions are recorded

Every non-obvious choice above has an ADR in [../adr](../adr) explaining what else
was considered and what it costs. Read those before changing any of them — the
costs are written down precisely so they do not have to be rediscovered.
