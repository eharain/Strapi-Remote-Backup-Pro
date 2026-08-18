# Security model

This tool holds admin credentials for other people's production CMS instances and
writes archives that may contain their entire content database. The rules below are
requirements, not preferences.

## Credentials

**The Strapi admin password is used once and dropped.** It is exchanged for a JWT at
`POST /admin/login` and never persisted — not to a profile, not to a log, not into
an archive. The desktop app does not bind it to any saved state; the CLI prompts
for it rather than accepting a flag, because a flag lands in the shell history of a
machine that also stores the backups.

**Destination secrets go to the OS vault.** S3 keys, OAuth refresh tokens, SFTP
private keys are long-lived by nature and unattended scheduled runs cannot work
without them. They live in DPAPI, Keychain, or libsecret — never in a profile file.

**Profiles are safe to commit.** They carry a `secretRef` naming a vault entry, not
a secret. This is what makes it safe to sync a profile between machines or keep one
in a repository.

**Login is never retried automatically.** Strapi throttles `/admin/login` to five
attempts per window by default. An automatic retry locks the user out of their own
CMS — the tool would cause exactly the outage it exists to protect against.

## The local API

The engine process holds live admin credentials, so its HTTP surface is treated as
a security boundary rather than an internal convenience.

- **Bind to 127.0.0.1 only.** Never `0.0.0.0`. A misconfiguration here publishes a
  customer's CMS credentials to the network.
- **Bearer token on every request.** Generated per process, passed to the
  supervisor over the stdout handshake, never written to disk.
- **Port 0.** The OS picks a free port, so instances cannot collide and the port is
  not predictable.
- **No configurable host on the client side.** The .NET client's base address is
  always loopback on the handshake port, so no setting can point it elsewhere.

See [ADR 0004](../adr/0004-sidecar-contract.md).

## Process lifetime

An engine that outlives its parent is an orphan holding credentials. Two
independent guarantees, because either alone leaves a gap:

1. The engine watches `--parent-pid` and exits when the parent disappears.
2. On Windows the supervisor puts the child in a Job Object with
   `KILL_ON_JOB_CLOSE`, so a hard kill of the app takes the engine with it.

## Archives

An archive can hold an entire customer database, and — if the user opted into
backing up settings — admin accounts too. It then gets uploaded to Dropbox.

- **AES-256-GCM encryption is offered on every backup** and is strongly recommended
  for any archive leaving the local machine.
- **The manifest stays plaintext** so archives remain listable without the
  passphrase. It contains no record data.
- **GCM tags are verified on read**, so a tampered archive fails rather than
  restoring corrupted data into production.
- **Unencrypted FTP requires an explicit opt-in.** FTPS is the default. Sending a
  content database over a cleartext channel should be a deliberate act.

## Logging

Credentials, tokens, and passphrases are redacted at the logger, not at each call
site. A support log is exactly the artefact users paste into a public issue
tracker, and per-call-site redaction fails the first time someone adds a log line
without thinking about it.

Logs go to stderr; stdout is reserved for the sidecar handshake and
machine-readable CLI output.

## Backing up settings and users

Roles, permissions, and admin accounts are **off by default**. They are the most
sensitive material an instance holds, most backups do not need them, and a restore
of them can lock people out of a working CMS. Including them is an explicit choice.
