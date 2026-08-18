# 0007 — Support Strapi v4 and v5 behind a dialect interface

**Status:** Accepted · 2026-08-18

## Context

Strapi v5 is current, but the v4 installed base is large and slow-moving — and
older instances are exactly the ones most likely to need a backup tool and least
likely to have one. The two majors disagree about nearly everything structural in
their admin API responses.

## Decision

Both are supported, behind a single `StrapiDialect` interface with one
implementation per major under `src/strapi/v4` and `src/strapi/v5`. The version is
detected by probing behaviour at connect time. Nothing above the dialect layer
knows which version is on the other end.

## Consequences

**What differs, and stops at the boundary.**

| | v4 | v5 |
|---|---|---|
| Identity | numeric `id`, instance-local | `documentId`, stable |
| Payload shape | fields nested under `attributes` | flat |
| Draft state | `publishedAt: null`, filtered by `publicationState` | document versions, filtered by `status` |
| Relations | wrapped in `{ data: ... }` envelopes at every level | direct |
| Locales | separate entries linked by `localizations` | documents sharing a `documentId` |

**Version is probed, not trusted.** Strapi does not reliably advertise its major on
any unauthenticated endpoint, and a version banner can be absent, proxied away, or
simply wrong. The shape of a Content-Type Builder response distinguishes the two
reliably, so behaviour is the signal.

**v4 cross-instance restore is inherently weaker.** With no `documentId`, identity
has to be synthesised from an instance-local numeric id. Restoring a v4 archive
into a *different* instance therefore needs an explicit identity mapping, and the
tool must say so rather than silently producing duplicates. This limitation belongs
to v4, not to the tool, and cannot be engineered away.

**What it costs.** Every read and write path is implemented twice, and integration
tests must run against both — hence the two containers in `tools/sandbox`. The
payoff is that supporting a future Strapi major should mean adding one folder and
changing nothing above it.
