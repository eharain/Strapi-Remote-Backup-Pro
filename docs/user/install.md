# Installing

One command. You do not need to install anything else first — no Node, no
developer tools — and you will not be asked for an administrator password.

> **Where this is up to:** the installer works. The tool it installs is still a
> preview and cannot back anything up yet, and it will tell you so at the end
> rather than pretending otherwise. Re-run the same command when a release is
> announced and it upgrades itself.

## Windows

Open **PowerShell** (press Start, type `powershell`, press Enter) and paste:

```powershell
irm https://tech-style.co/install/strapi-remote-backup-pro.ps1 | iex
```

## macOS

Open **Terminal** (press ⌘-Space, type `terminal`, press Enter) and paste:

```bash
curl -fsSL https://tech-style.co/install/strapi-remote-backup-pro.sh | sh
```

## Linux

```bash
curl -fsSL https://tech-style.co/install/strapi-remote-backup-pro.sh | sh
```

## What happens

It takes two or three minutes and narrates each of the four steps:

1. **Gets the runtime the tool needs.** About 30–40 MB. It checks the download
   against the checksum the publisher lists, and stops if the two disagree.
2. **Gets the program.** The released version if there is one, otherwise it
   downloads the source and builds it.
3. **Makes it easy to start.** Adds a `strapi-backup` command and puts a
   shortcut on your desktop.
4. **Checks it actually works.** It runs the program and tells you what it
   found — including if there is nothing useful to run yet.

Then open a **new** terminal window (the new command is only visible to windows
opened after installing) and type `strapi-backup`.

## Where things go

Nothing is installed system-wide and nothing outside your own user folder is
touched.

| | |
|---|---|
| Windows | `%LOCALAPPDATA%\StrapiRemoteBackupPro` |
| macOS | `~/Library/Application Support/StrapiRemoteBackupPro` |
| Linux | `~/.local/share/strapi-remote-backup-pro` |

There is an `install.log` in that folder. If anything goes wrong, that file is
the first thing to send us.

## Removing it

```powershell
& ([scriptblock]::Create((irm https://tech-style.co/install/strapi-remote-backup-pro.ps1))) -Uninstall
```

```bash
curl -fsSL https://tech-style.co/install/strapi-remote-backup-pro.sh | sh -s -- --uninstall
```

Your backup archives are never touched — they stay wherever you saved them.

## Options

Both installers take the same options. On macOS and Linux, pass them after
`sh -s --`; on Windows, use the `[scriptblock]::Create(...)` form above, because
`iex` cannot pass arguments to a piped script.

| Option | Does |
|---|---|
| `--channel release` / `-Channel release` | only use a published release, do not build from source |
| `--version 1.2.0` / `-Version 1.2.0` | install a specific version |
| `--prefix <dir>` / `-Prefix <dir>` | install somewhere else |
| `--no-shortcut` / `-NoShortcut` | do not touch the desktop |
| `--no-path` / `-NoPath` | do not add the command to `PATH` |
| `--uninstall` / `-Uninstall` | remove everything the installer created |

## If your organisation blocks this

Some workplaces block running a script downloaded from the internet. Download
the file, read it, and run it from disk instead — it is a plain text file and
short enough to read through:

- Windows: [`install.ps1`](https://raw.githubusercontent.com/eharain/strapi-remote-backup-pro/main/build/installers/bootstrap/install.ps1)
- macOS and Linux: [`install.sh`](https://raw.githubusercontent.com/eharain/strapi-remote-backup-pro/main/build/installers/bootstrap/install.sh)

## For developers

If you already have Node 20.11 or later and just want the command line, the
installer is unnecessary:

```bash
npx strapi-remote-backup-pro backup --url https://cms.example.com --email you@example.com
```

To work on the code instead, see [getting started](../dev/getting-started.md).
