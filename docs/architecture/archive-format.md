# Archive format v1.0

The specification for what this tool writes. Decisions behind it are in
[ADR 0005](../adr/0005-archive-format.md).

Archives outlive the software that wrote them. Treat this document as the contract:
a reader written years from now should be able to open an archive using nothing but
what is written here.

## Layout

```
backup-2026-08-18T1430.zip
├── manifest.json                        always plaintext, always first
├── schemas/
│   ├── content-types.json               definitions as captured at backup time
│   └── components.json
├── content/
│   ├── api--article.article.ndjson      one JSON record per line
│   ├── api--author.author.ndjson
│   └── api--homepage.homepage.ndjson    single types too, one line
├── media/
│   ├── media.ndjson                     file metadata, folder paths, hashes
│   └── files/
│       ├── a1b2c3d4e5.jpg               named by content hash
│       └── f6g7h8i9j0.pdf
└── meta/
    ├── locales.json
    └── run-report.json                  counts, durations, warnings
```

## Naming

Content-type UIDs contain `::`, which is awkward inside zip entry paths, so
`api::article.article` is stored as `api--article.article.ndjson`. The mapping is
mechanical and reversible — see `contentEntryPath` in
`apps/core/src/archive/format.ts`.

Media files are named by content hash rather than original filename. Two entries
referencing the same upload store one copy, and filename collisions across folders
become impossible. Original names and folder paths live in `media.ndjson`.

## manifest.json

The only entry that is never encrypted, so an archive can be listed and identified
without its passphrase.

```json
{
  "formatVersion": "1.0",
  "producedBy": { "tool": "strapi-remote-backup-pro", "version": "0.1.0" },
  "createdAt": "2026-08-18T14:30:00.000Z",
  "label": "nightly-production",

  "source": {
    "url": "https://cms.example.com",
    "version": "v5",
    "versionString": "5.4.2"
  },

  "selection": {
    "contentTypes": ["api::article.article"],
    "depth": 2,
    "includeMedia": true,
    "locales": ["en", "fr"]
  },

  "encryption": {
    "algorithm": "aes-256-gcm",
    "kdf": "scrypt",
    "salt": "base64..."
  },

  "contents": {
    "contentTypes": [
      {
        "uid": "api::article.article",
        "recordCount": 4213,
        "file": "content/api--article.article.ndjson",
        "sha256": "..."
      }
    ],
    "mediaFiles": 1820,
    "mediaBytes": 3221225472,
    "componentCount": 12,
    "locales": ["en", "fr"]
  }
}
```

`encryption` is absent on unencrypted archives.

## Content entries

One JSON object per line, no wrapping array, no trailing comma, newline-terminated.
Records are written in `updatedAt` ascending order — the same order they were
paged from Strapi.

```
{"documentId":"a1b2c3","locale":"en","publishedAt":"2026-01-04T09:00:00.000Z","fields":{...}}
{"documentId":"d4e5f6","locale":"en","publishedAt":null,"fields":{...}}
```

Records are normalised: v4's `attributes` nesting and `{ data: ... }` relation
envelopes are already unwrapped, so an archive taken from v4 and one taken from v5
have the same internal shape. The originating dialect is recorded in
`source.version` because it still affects what a restore can safely do — see
[ADR 0007](../adr/0007-strapi-v4-and-v5.md).

`fields` holds everything user-defined: scalars, components, dynamic zones, and
relations expressed as document references.

## Version compatibility

`formatVersion` is `major.minor`.

- **Same major, same or lower minor** — read normally.
- **Same major, higher minor** — read, but warn. Minor bumps only add entries or
  optional fields.
- **Higher major** — refuse. The layout has changed in a way this reader cannot be
  trusted to interpret, and guessing risks writing wrong data into a live CMS.

## Integrity

SHA-256 per content entry, computed while writing and recorded in the manifest.
`strapi-backup verify <archive>` re-checks every one.

Encrypted archives use AES-256-GCM per entry with a scrypt-derived key. GCM tags
are verified on read, so tampering or truncation fails loudly rather than restoring
corrupted records into production.

## Reading one without this tool

Unzip it. `manifest.json` tells you what is inside; `content/*.ndjson` is one JSON
object per line; `media/files/` holds the binaries, with `media/media.ndjson`
mapping hashes back to original names and folders. That property is deliberate — a
backup format that needs its own software to inspect fails at exactly the moment it
matters most.
