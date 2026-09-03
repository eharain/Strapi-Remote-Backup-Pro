# Bootstrap installers

The one command a customer runs. Everything else in `build/` assembles the
product; these two scripts are the product's front door.

| File | For |
|---|---|
| `install.sh` | macOS and Linux, POSIX `sh` |
| `install.ps1` | Windows, PowerShell 5.1 — what ships in the box |

```bash
curl -fsSL https://tech-style.co/install/strapi-remote-backup-pro.sh | sh
```

```powershell
irm https://tech-style.co/install/strapi-remote-backup-pro.ps1 | iex
```

Those URLs are redirects to the raw files on `main`. Redirects rather than raw
GitHub links because the URL is the thing that ends up in documentation, support
replies and the product page, and it has to outlive any move of the repository.

## What they do

Four steps, announced to the customer as they happen:

1. Stage a pinned Node runtime under the user's own profile, verified against
   the SHA-256 sums nodejs.org publishes.
2. Fetch the program — the published npm release, or the source tree built on
   the spot when there is no release yet.
3. Write a `strapi-backup` shim, add it to `PATH`, and place a desktop shortcut.
4. Run the installed command and report what it found.

Re-running upgrades in place. `--uninstall` / `-Uninstall` reverses everything,
including the `PATH` entry and the shortcuts.

## Decisions worth not re-litigating

**No system Node, and no "install Node first".** A customer who has to install a
toolchain before trying the product does not try the product. The staged runtime
is also the only way the version we tested is the version they run — same
reasoning as [ADR 0004](../../../docs/adr/0004-sidecar-contract.md), which is
why the desktop installer carries one too.

**The pinned version lives in both scripts and must match
`build/scripts/bundle-runtime.ps1`.** Three copies of a version number is two too
many; when that script is written, this is the constant it takes.

**No elevation, ever.** Everything lands under `%LOCALAPPDATA%` or `$HOME`. A UAC
or `sudo` prompt is a place customers stop, and a locked-down work machine should
not be excluded from an evaluation.

**The checksum check is not optional.** A script piped from the internet that
installs an unverified 40 MB binary hands anyone who can intercept that
connection a shell on the customer's machine. A mismatch aborts; it never
retries.

**Step 4 reports what is true.** The self-test looks for commander's `Commands:`
heading in `--help`, because that heading appears only once a subcommand is
actually registered. Searching the help text for `backup` would match the
program's own name and report a working install every single time — including
today, when nothing is implemented. An installer that says "success" over a tool
that does nothing is a support ticket we wrote ourselves.

## Testing a change

Confine a test run to a throwaway directory and leave `PATH` and the desktop
alone:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 `
  -Prefix "$env:TEMP\srbp-test" -NoPath -NoShortcut
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 `
  -Prefix "$env:TEMP\srbp-test" -Uninstall
```

```bash
sh install.sh --prefix /tmp/srbp-test --no-path --no-shortcut
sh install.sh --prefix /tmp/srbp-test --uninstall
```

`sh -n install.sh` catches syntax errors without running anything. For the
PowerShell side, `[System.Management.Automation.Language.Parser]::ParseFile()`
does the same.

Both scripts must keep working when every network call fails, when the npm
package does not exist, and when the source builds but produces nothing
runnable — those are three different messages, and a customer can act on the
difference.

### Long paths on Windows

`Remove-Item -Recurse` and `rd /s /q` both fail part way through a `node_modules`
tree, because the file APIs PowerShell 5.1 sits on still enforce `MAX_PATH` and
the AWS SDK nests past 260 characters on its own. `install.ps1` routes every
recursive delete through `Remove-Tree`, which falls back to mirroring an empty
directory with `robocopy /MIR`. Without it, upgrading and uninstalling both fail
and leave a half-deleted tree the customer cannot clear by hand either. Do not
replace those calls with a plain `Remove-Item`.
