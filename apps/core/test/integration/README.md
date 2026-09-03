# Integration tests

The only tests that can say backup and restore work, because the thing under
test is Strapi's admin API. A mock would keep passing precisely when Strapi
changed, which is the one failure these exist to catch.

They need **two live Strapi instances** and an admin account that exists on
both. Nothing is mocked and nothing is stubbed.

```bash
export SRBP_SOURCE_URL=http://127.0.0.1:13337
export SRBP_TARGET_URL=http://127.0.0.1:13338
export SRBP_EMAIL=admin@example.com
export SRBP_PASSWORD='...'
npm run test:integration -w strapi-remote-backup-pro
```

Without `SRBP_EMAIL` and `SRBP_PASSWORD` the suite skips rather than fails, so
`npm test` stays green on a machine with no instances running.

## What they do to the target

`roundtrip.test.ts` **writes to `SRBP_TARGET_URL`**, and before restoring it
deletes records the archive does not contain plus one record it does. Point it
at a throwaway instance, never at anything you care about.

Deleting one archived record on purpose is the point: without it every document
already exists, the restore only ever updates, and a bug that turns every write
into an update passes unnoticed. That is not hypothetical — it is what happened.

## Two things that make these tests awkward, and why

**Sign-in is rate-limited.** Strapi allows a handful of `POST /admin/login`
attempts per window, so the suite caches its sessions in the temp directory and
reuses them. A suite that signs in on every run locks itself out after three
iterations, and it looks like a broken test rather than a working rate limiter.

**Records are compared by value, not identity.** Strapi v5 assigns its own
`documentId` on insert, so a record the restore had to recreate cannot be matched
back by id. The assertion that matters is that the same records, with the same
field values and the same publication state, exist on both sides.

## Sandbox

`tools/sandbox/docker-compose.yml` brings up throwaway v4 and v5 instances. Any
two instances sharing a content model will do — the round trip compares the
archives, not the schemas.
