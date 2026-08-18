# Strapi Remote Backup Pro

Back up and restore any Strapi instance **remotely, without installing a plugin in it**.

You point the tool at a Strapi URL, sign in with admin credentials, and it does the rest —
pulls content, media, and schemas over the same admin API the Strapi admin panel itself
uses, writes a portable `.zip` archive, and ships it wherever you want it.

Restore is selective: pick content types, pick records, pick how deep to follow relations.

```
                 ┌──────────────────────────────┐
   admin creds   │  Strapi (v4 / v5) — untouched │
        │        │  no plugin, no code change    │
        ▼        └──────────────┬───────────────┘
  ┌───────────┐                 │ admin REST API
  │  CLI      │◄────────────────┘
  │  or GUI   │
  └─────┬─────┘
        │  .zip archive
        ▼
  local · S3 · Azure Blob · Google Drive · Dropbox · OneDrive · SFTP · FTP
```

## Two ways to run it

**Command line** — for developers, CI, and cron:

```bash
npx strapi-remote-backup-pro backup \
  --url https://cms.example.com \
  --email admin@example.com \
  --out ./backups
```

**Desktop app** — for everyone else. A native app (Windows, macOS, Linux) that runs the
same engine quietly in the background, adds scheduling, and gives restore a visual
content-type picker with relation-depth control. No Node installation required — the
runtime ships inside the installer.

## What gets backed up

| | |
|---|---|
| Content entries | all collection & single types, drafts and published, all locales |
| Media library | files plus folder structure and metadata |
| Schemas | content types and components, as captured at backup time |
| Relations | preserved by document identity, remapped on restore |

## Repository layout

| Path | What lives there |
|---|---|
| `apps/core` | Node/TypeScript engine — CLI, local API, backup & restore logic |
| `apps/desktop` | .NET 10 + Avalonia desktop app and background service |
| `docs` | architecture decisions, format specs, user guides |
| `build` | packaging scripts and platform installers |
| `tests` | end-to-end tests spanning both stacks |
| `tools/sandbox` | throwaway Strapi v4 + v5 instances for development |
| `artifacts` | build output (not committed) |

Start with [docs/architecture/overview.md](docs/architecture/overview.md) for how the pieces
fit together, or [docs/dev/getting-started.md](docs/dev/getting-started.md) to build it.

## Status

Early development. The structure is in place; features are not yet implemented.

[docs/dev/worksheet.md](docs/dev/worksheet.md) is the current, verified account of
what works and what is outstanding.

## Licence

MIT © 2026 Ejaz Hussain Arain. All rights reserved. See [LICENSE](LICENSE),
[NOTICE](NOTICE), and [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

Published by [Tech Style Ltd](https://tech-style.co/) · Registered in England &
Wales · Company No. 11101491

The desktop installers redistribute the Node.js runtime and third-party libraries;
their notices ship with the installed application. See
[docs/legal/licensing.md](docs/legal/licensing.md).

Strapi is a trademark of Strapi Solutions SAS. This product is an independent tool
and is not affiliated with, endorsed by, or sponsored by Strapi Solutions SAS.
