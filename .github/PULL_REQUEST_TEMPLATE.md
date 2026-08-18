## What this changes

<!-- and why -->

## Checklist

- [ ] `npm run lint`, `npm run typecheck`, and `npm test` pass
- [ ] Contracts regenerated if `apps/core/src/contracts` changed
      (`npm run schema:emit` — CI fails on drift)
- [ ] Tested against **both** sandbox instances if this touches a dialect,
      the relation graph, or the archive format
- [ ] No unbounded buffering introduced — everything still streams
- [ ] An ADR added or updated if this changes a decision in `docs/adr`

## If this touches restore

Restore writes to someone's live CMS, so these get the strictest review.

- [ ] The restore plan still reflects what will actually be written
- [ ] Behaviour verified against a schema with circular relations
