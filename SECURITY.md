# Security policy

## Reporting a vulnerability

Report privately through
[GitHub Security Advisories](https://github.com/eharain/strapi-remote-backup-pro/security/advisories/new),
or by email to hello@tech-style.co.

**Please do not open a public issue.** This tool holds admin credentials for other
people's production CMS instances; a public report is a disclosure to everyone
running it before there is a fix.

Expect an acknowledgement within three working days.

## What is in scope

This tool handles high-value secrets, so the following are treated as serious even
without a full exploit:

- Anything that exposes the local API beyond loopback, or lets a request through
  without the bearer token
- Admin credentials, JWTs, or passphrases appearing in logs, archives, profiles,
  crash dumps, or the credential store in plaintext
- An engine process surviving its parent and continuing to hold credentials
- Archive decryption succeeding on tampered or truncated data, or a restore
  writing unverified content into a live CMS
- Path traversal from an archive entry writing outside the extraction root
- A backup destination receiving data intended for a different one

## What is not in scope

- Vulnerabilities in Strapi itself — report those to Strapi
- The tool being able to read data the supplied admin account can already read;
  that is what admin credentials mean
- Denial of service against a target instance caused by deliberately raising the
  concurrency setting past its default

## Supported versions

Pre-1.0. Only the latest release receives fixes.

## Design commitments

These are asserted in [docs/architecture/security.md](docs/architecture/security.md)
and are what a report can hold us to:

- The Strapi admin password is exchanged for a JWT and never persisted
- The local API binds to `127.0.0.1` only and requires a per-process bearer token
- Credentials, tokens, and passphrases are redacted at the logger, not per call site
- Archives can be encrypted with AES-256-GCM, and tags are verified on read
- Login is never retried automatically, so the tool cannot lock a user out of their
  own CMS
