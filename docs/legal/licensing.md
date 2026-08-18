# Licensing and attribution

## The product

| | |
|---|---|
| Licence | MIT |
| Copyright holder | Ejaz Hussain Arain |
| Author | Ejaz Hussain Arain · hello@tech-style.co |
| Publisher | Tech Style Ltd · https://tech-style.co/ |
| Company registration | England & Wales · No. 11101491 |
| Year | 2026 |

This matches `strapi-content-sync-pro` and `strapi-api-guard-pro`: copyright to the
individual, Tech Style Ltd as publisher and contributor, MIT throughout.

## Where attribution is defined

Once each, and read from there — attribution retyped in six places disagrees with
itself by the third release.

| Surface | Source |
|---|---|
| Engine, CLI banner, archive manifests | `apps/core/src/branding.ts` |
| Desktop app, About screen, file properties | `apps/desktop/Directory.Build.props` → `StrapiBackup.Shared/ProductInfo.cs` |
| npm listing | `apps/core/package.json` |
| Legal text | `LICENSE`, `NOTICE` |

`ProductInfo` reads assembly metadata rather than holding literals, so the About
screen cannot disagree with the installer.

The archive manifest records `producedBy.tool` and `producedBy.version` inside
every backup. Archives outlive the software that wrote them, so a reader years from
now can identify what produced a file it has never seen.

## What MIT means here — worth being deliberate about

MIT permits anyone to use, modify, sell, and redistribute this, including a
competitor shipping it under their own name. That is the same choice already made
for the other two Pro products, so it is consistent rather than accidental.

**It is effectively irreversible.** Once a version ships under MIT, that version
stays MIT forever. Later releases can change licence, but the published one cannot
be recalled. If a different model was ever intended for this product, before the
first publish is the moment to decide.

Two consequences follow, and both are worth stating plainly:

*Technical protection of the source is moot.* [ADR 0002](../adr/0002-engine-language.md)
weighed a compiled binary as protection for a commercial product. Under MIT that
argument carries no weight — the licence grants what the compilation would have
withheld. The ADR records this correction.

*Licence keys would be unenforceable.* Neither sibling product has one, and under
MIT a key check is a removable formality rather than a restriction.

## Redistribution obligations

The npm package declares its dependencies and npm resolves them on the user's
machine. **The desktop installer is different**: it physically bundles the Node.js
runtime and every dependency into one artefact handed to the user. That makes us a
redistributor.

Consequently:

- MIT and BSD components require their copyright notice and licence text to travel
  with the copy.
- Apache-2.0 components — the AWS and Azure SDKs among them — additionally require
  reproducing any `NOTICE` file they carry.
- Node.js embeds OpenSSL, ICU, and others under their own terms. Its `LICENSE`
  covers them and must be reproduced verbatim; summarising it is not sufficient.

`THIRD-PARTY-NOTICES.md` is generated from the resolved dependency tree of the
packaged build, not hand-maintained — a hand-written list goes stale the first time
a transitive dependency changes, and nothing fails to signal it.

`Directory.Build.props` copies `LICENSE`, `NOTICE`, and `THIRD-PARTY-NOTICES.md`
beside every executable, so the obligation is satisfied by the build rather than by
remembering.

## Trademarks

Strapi is a trademark of Strapi Solutions SAS. This is an independent tool that
drives Strapi's HTTP API from outside; it is not affiliated with, endorsed by, or
sponsored by Strapi Solutions SAS. Stated plainly in the README, the About screen,
and the npm listing.

Naming the product *for* Strapi is nominative use and is normal for an ecosystem
tool — `strapi-content-sync-pro` is already listed on the official Strapi
Marketplace on the same basis. Worth noting, though: this product is **not a Strapi
plugin**, so the Marketplace route that fits the siblings does not apply here. Its
listings are npm and the company website.

AWS, Azure, Google Drive, Dropbox, and OneDrive are named only to describe
supported destinations.

## Website listing

The product will be listed on [tech-style.co](https://tech-style.co/). Note that
the existing Strapi entries sit under *Open Source → Strapi plugins*, and this one
does not belong there — it is a standalone desktop app and CLI, with installers, so
`products.html` and `downloads.html` are the right homes. The counts on
`open-source.html` ("Strapi plugins **4**", "Three packages on npm") will need
updating when the npm package publishes.
