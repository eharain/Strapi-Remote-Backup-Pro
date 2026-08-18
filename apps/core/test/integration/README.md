# Integration tests

These run against the throwaway Strapi instances in `tools/sandbox` — a v4 and a
v5 container, seeded with a schema that deliberately includes the awkward cases:
circular relations, dynamic zones, nested repeatable components, multiple locales,
and a mix of draft and published entries.

They are excluded from `npm test` because they need those containers running.

```bash
docker compose -f ../../../../tools/sandbox/docker-compose.yml up -d
npm run test:integration
```
