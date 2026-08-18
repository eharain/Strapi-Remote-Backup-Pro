# strapi-remote-backup-pro

Back up and restore any Strapi v4 or v5 instance **remotely, without installing a
plugin in it**. Admin credentials are the only requirement.

```bash
npx strapi-remote-backup-pro backup \
  --url https://cms.example.com \
  --email admin@example.com \
  --out ./backups
```

It authenticates against the same admin API the Strapi admin panel uses, streams
content, media, and schemas into a portable `.zip`, and delivers it to local disk,
S3, Azure Blob, Google Drive, Dropbox, OneDrive, SFTP, or FTP.

Restore is selective: choose content types, choose records, choose how deep to
follow relations. The plan is always shown before anything is written.

## Why no plugin

Installing a plugin means adding a dependency to someone's CMS and redeploying it.
For an agency backing up a client's instance, that is often not possible at all.
This runs entirely outside the target — nothing installed, nothing redeployed,
nothing to uninstall afterwards.

## Install

```bash
npm install -g strapi-remote-backup-pro    # or use npx
```

Requires Node.js 20.11 or later.

A desktop application with a visual content-type picker, scheduling, and a restore
diff is available separately — it bundles this engine and needs no Node
installation.

## Commands

| | |
|---|---|
| `login` | verify credentials, detect version, save a profile |
| `backup` | run a backup |
| `restore` | plan and apply a restore |
| `inspect` | read an archive manifest |
| `verify` | checksum an archive against its manifest |
| `targets` | manage destinations |
| `schedule` | recurring backups |
| `serve` | start the local API |

Run `strapi-backup <command> --help` for flags.

## Documentation

Architecture, the archive format specification, and the decision records are in
the [repository](https://github.com/eharain/strapi-remote-backup-pro).

## Licence

MIT © 2026 Ejaz Hussain Arain. See [LICENSE](LICENSE) and [NOTICE](NOTICE).

Published by [Tech Style Ltd](https://tech-style.co/) · Registered in England &
Wales · Company No. 11101491

Strapi is a trademark of Strapi Solutions SAS. This is an independent tool, not
affiliated with or endorsed by Strapi Solutions SAS.
