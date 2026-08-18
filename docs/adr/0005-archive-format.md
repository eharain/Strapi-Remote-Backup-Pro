# 0005 — Zip archive with NDJSON content entries

**Status:** Accepted · 2026-08-18

## Context

A backup has to be one portable file the user can move, store, and hand to someone
else. It also has to be readable years later, possibly by a version of this tool
that has not been written yet, and possibly by a person with no tool at all.

## Decision

A `.zip` archive with a fixed internal layout. Content is stored as NDJSON — one
JSON record per line — rather than as JSON arrays. The full layout is specified in
[../architecture/archive-format.md](../architecture/archive-format.md).

## Consequences

**Why zip.** Openable by every operating system without this tool installed. That
matters more than compression ratio: a backup format that requires its own software
to inspect is a format that fails at the moment it is most needed. It also supports
per-entry compression and random access, so a manifest can be read without
inflating the archive.

**Why NDJSON, not JSON.** This is the load-bearing choice. A 200,000-entry
collection as a single JSON array cannot be written or read without holding all of
it in memory. Per-line records let the writer stream from Strapi straight to disk
and the reader yield one record at a time, so peak memory stays flat regardless of
instance size. It also degrades well: a truncated NDJSON file loses its last line,
while a truncated JSON array is unparseable in its entirety.

**Zip64 is always on.** Media libraries cross the 4 GB boundary far more often than
people expect, and discovering that limit at the end of a long backup is the worst
possible moment.

**Checksums are computed while writing.** SHA-256 per entry, recorded in the
manifest, with no second pass over the finished file. `verify` re-checks them — a
backup nobody has ever verified is a hypothesis, not a backup.

**Encryption leaves the manifest in the clear.** AES-256-GCM with a scrypt-derived
key, applied per entry. The manifest stays readable so a UI can list what an
archive holds before asking for the passphrase. GCM tags are verified on read, so a
tampered or truncated archive fails loudly instead of restoring corrupted records
into a live CMS.

**The format is versioned.** `formatVersion` in the manifest. A reader refuses a
future major and warns on a future minor. Archives outlive the software that wrote
them, so this is cheaper to establish now than to retrofit.
