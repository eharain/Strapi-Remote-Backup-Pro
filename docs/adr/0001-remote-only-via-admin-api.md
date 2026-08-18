# 0001 — Operate remotely over the admin API, never as a plugin

**Status:** Accepted · 2026-08-18

## Context

Existing Strapi backup tools are plugins. Installing one means adding a dependency
to someone's CMS, redeploying it, and asking them to trust code running inside
their production process. For an agency or consultant who needs a backup of a
client's instance, that is often simply not possible — they may not have deploy
access at all.

## Decision

The tool runs entirely outside the target instance. It authenticates against
`POST /admin/login` and works through the same admin REST API the Strapi admin
panel itself uses: `/content-type-builder/*` for the content model,
`/content-manager/*` for records, `/upload/*` for media.

Nothing is installed into Strapi. Nothing is redeployed. Admin credentials are the
only requirement.

## Consequences

**What this buys.** Works against any reachable instance, including ones we have no
deploy access to. No version coupling to a plugin API. Nothing to uninstall, and no
possibility of the tool destabilising the CMS process it is backing up.

**What it costs.**

*The admin API is not a public contract.* It is documented far less than the
content API, and Strapi may change it between minor releases. This is the central
risk of the whole product. It is mitigated by pinning behaviour per dialect
(see [0007](0007-strapi-v4-and-v5.md)) and by testing against real instances
rather than mocks — a mock would keep passing precisely when Strapi changed.

*Admin credentials are a high bar.* Nothing less reaches the Content-Type Builder,
so a schema-complete backup cannot be taken with an API token alone. Instances
behind SSO or 2FA fall back to the narrower API-token path and produce a less
complete archive.

*Login is rate-limited.* Strapi throttles `POST /admin/login` — five attempts per
window by default. A failed login must never be retried automatically; doing so
locks the user out of their own CMS.

*We are a guest on a live production system.* Every request competes with real
traffic. Concurrency is capped low by default, and 429 and 503 are honoured with
backoff rather than retried hard. A backup must never be the reason a site goes
down.
