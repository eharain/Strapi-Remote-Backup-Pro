# Third-party notices

This product redistributes third-party software. Their licences are reproduced
here, and this file must ship with the installed application.

**This is a distribution obligation, not a courtesy.** The desktop installer is
the reason it applies: the npm package declares its dependencies and npm resolves
them on the user's machine, but the installer physically bundles the Node.js
runtime and every dependency into one artefact we hand to the user. That makes us
a redistributor, and MIT, BSD, and Apache-2.0 all require the copyright notice and
licence text to travel with the copy.

Apache-2.0 components — the AWS and Azure SDKs among them — additionally require
that any `NOTICE` file they carry be reproduced.

## Generated, not hand-maintained

```bash
pwsh build/scripts/collect-third-party-notices.ps1
```

Walks the resolved dependency tree of the packaged build, collects each package's
licence text, and regenerates the tables below. Run it as part of packaging so the
file describes what actually shipped rather than what was intended to.

A hand-written list goes stale the first time a transitive dependency changes, and
nobody notices because nothing fails.

## Components

### Runtime

| Component | Version | Licence |
|---|---|---|
| Node.js | pinned per release | MIT (with bundled OpenSSL, ICU, and other components under their own terms) |

Node.js carries its own third-party notices for the components it embeds. Its
`LICENSE` file covers them and is reproduced verbatim by the collection script —
summarising it is not sufficient.

### Engine dependencies

Populated by the collection script. Principal components and their licences:

| Component | Licence |
|---|---|
| `@aws-sdk/client-s3`, `@aws-sdk/lib-storage` | Apache-2.0 |
| `@azure/storage-blob` | MIT |
| `googleapis` | Apache-2.0 |
| `dropbox` | MIT |
| `fastify` | MIT |
| `commander` | MIT |
| `archiver`, `yauzl` | MIT |
| `ssh2-sftp-client`, `basic-ftp` | Apache-2.0, MIT |
| `croner` | MIT |
| `pino` | MIT |
| `undici` | MIT |
| `zod` | MIT |

### Desktop dependencies

| Component | Licence |
|---|---|
| Avalonia | MIT |
| .NET runtime and libraries | MIT |
| CommunityToolkit.Mvvm | MIT |
| Serilog | Apache-2.0 |

## Trademarks

Strapi is a trademark of Strapi Solutions SAS. This product is an independent tool
that works with Strapi over its HTTP API; it is not affiliated with, endorsed by,
or sponsored by Strapi Solutions SAS.

The same applies to Amazon Web Services, Microsoft, Google, and Dropbox — named
here only to describe the destinations this tool can write to.
