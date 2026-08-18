# Publishing and distribution

Where this product is listed, how each release gets there, and one channel that
does not accept it.

## Channels

| Channel | What ships | Status |
|---|---|---|
| GitHub | source, issues, releases | repo not created yet |
| npm | `strapi-remote-backup-pro` — the engine and CLI | not published |
| GitHub Releases | desktop installers per platform | needs the bundling step |
| tech-style.co | product page and download links | page drafted |
| Strapi Marketplace | — | **not eligible — see below** |

## Strapi Marketplace

**This product cannot be listed there, and the reason is the product itself.**

The Marketplace lists plugins that are installed *into* a Strapi project. Checked
against `strapi-content-sync-pro`, which is listed, eligibility requires all of:

| Requirement | content-sync-pro | this product |
|---|---|---|
| `strapi.kind: "plugin"` in package.json | yes | no |
| `strapi-plugin` keyword | yes | no |
| `@strapi/strapi` peer dependency | `^5.0.0` | none |
| `./strapi-server` and `./strapi-admin` exports | yes | no |
| Runs inside the Strapi process | yes | no |

None of these can be added. This is a standalone desktop app and CLI that drives
Strapi's admin API from outside, and *not being a plugin* is the entire premise —
see [ADR 0001](../adr/0001-remote-only-via-admin-api.md). Submitting it would be
rejected, correctly.

### The companion-plugin option — agreed, deferred

**Status: deferred by decision, not rejected.** Out of scope until the core tool
works. Recorded here so the reasoning survives until it is picked up.

There is a legitimate way onto the Marketplace that does not compromise the
premise: a **small, optional companion plugin** — published separately — that
contains none of the backup engine and is never required for the tool to work.

Its primary purpose is reach: a Marketplace listing puts this tool in front of
Strapi developers who would otherwise never encounter it, and the plugin becomes
the channel that promotes the standalone app. A minimal in-Strapi backup capability
is the hook that earns the listing.

It would be worth building for a reason beyond discoverability. It solves a real
limitation already documented in
[ADR 0001](../adr/0001-remote-only-via-admin-api.md): instances behind SSO or 2FA
cannot use admin login, and an API token cannot read the Content-Type Builder, so
those instances only get a schema-incomplete backup. A companion plugin could
expose one narrow, scoped, backup-only endpoint — far less privileged than a full
admin account — and close that gap.

Sketch of what it would carry:

- a scoped backup token, so no admin password is needed at all
- a read-only schema endpoint for SSO-locked instances
- a Backup panel in the Strapi admin showing history and last-run status
- a link to the desktop app

The core tool keeps working with zero plugin installed. The plugin is strictly an
enhancement, so ADR 0001 stands. This is a proposal, not a decision — it needs its
own ADR before anyone builds it.

## GitHub

The repository does not exist yet. It must be created before anything can be
pushed — creating it requires the `gh` CLI or a personal access token, neither of
which is available in this environment.

```bash
# once, with gh installed and authenticated
gh repo create eharain/strapi-remote-backup-pro --public \
  --description "Back up and restore any Strapi v4/v5 instance remotely — no plugin required" \
  --homepage "https://tech-style.co/"

# or create it empty through the web UI, then
git remote add origin https://github.com/eharain/strapi-remote-backup-pro.git
git push -u origin main
```

Repository settings worth applying once it exists:

- Topics: `strapi`, `strapi-v5`, `strapi-v4`, `backup`, `restore`, `cli`,
  `dotnet`, `avalonia`, `disaster-recovery`
- Enable **private vulnerability reporting** — `SECURITY.md` links to it
- Protect `main`: require the CI checks in
  [ci.yml](../../.github/workflows/ci.yml), including the contract-drift job
- Description and homepage as above

## npm

Publishing is automated by [release.yml](../../.github/workflows/release.yml) on a
`v*` tag, using the `NPM_TOKEN` repository secret.

```bash
npm version minor -w strapi-remote-backup-pro
git push --follow-tags
```

Before the first publish:

- Confirm the name is free on npm
- Check `npm publish --dry-run -w strapi-remote-backup-pro` includes `dist`,
  `bin`, `README.md`, `LICENSE`, `NOTICE`, and `THIRD-PARTY-NOTICES.md`
- Publishing under MIT is irreversible for that version. See
  [legal/licensing.md](../legal/licensing.md).

## Desktop installers

Built per platform by the release workflow and attached to the GitHub Release.

**The bundling step is a blocker, not a formality.** `build/scripts` currently
contains placeholders. The installer must carry a pinned Node runtime — an
installer that expects the user to have Node already forfeits the entire reason for
shipping a native app ([ADR 0004](../adr/0004-sidecar-contract.md)).

The installer also redistributes third-party code, which brings licence
obligations that are satisfied by the build rather than by remembering — see
[legal/licensing.md](../legal/licensing.md).

Unsigned installers will trigger SmartScreen on Windows and Gatekeeper on macOS.
Code signing certificates are needed before this is something to hand to
non-technical users.

## Release checklist

1. `npm run lint && npm run typecheck && npm test`
2. Integration tests green against **both** sandbox instances
3. `npm run schema:emit` — no drift
4. CHANGELOG updated
5. `npm version` and push the tag
6. Verify the npm tarball contents and the attached installers
7. Update the tech-style.co product page and `downloads.html`
8. Update the counts on `open-source.html` — they are hand-maintained
