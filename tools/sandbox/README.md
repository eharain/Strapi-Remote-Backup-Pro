# Sandbox instances

```bash
docker compose up -d      # v5 on :1337, v4 on :1338
```

Create the first admin user through each admin panel on first run; the integration
tests read those credentials from `.env` (see `.env.example`).

## Why two instances, not mocks

The admin API *is* the thing under test. A mock encodes what we currently believe
Strapi does, so it keeps passing at exactly the moment Strapi changes and the tool
breaks — which is the one failure these tests exist to catch.

## Why the seed schema is deliberately awkward

Real Strapi projects are not tidy, and every one of these has a specific failure it
provokes:

| Seeded case | What it catches |
|---|---|
| circular relations (article ↔ author) | single-pass restore rejecting writes |
| dynamic zones | relations hidden inside component payloads |
| nested repeatable components | naive depth expansion missing nested targets |
| multiple locales | v4 `localizations` vs v5 shared `documentId` |
| drafts and published together | the two dialects' different draft filters |
| media in nested folders | folder structure lost on restore |

A change that works against a flat single-locale schema has not been tested.
