# Build and packaging

Nothing in here is imported by application code — this is how the products are
assembled, kept separate so `apps/` stays free of packaging concerns.

| Path | Purpose |
|---|---|
| `scripts/` | version stamping, contract codegen, Node runtime bundling |
| `installers/windows/` | WiX/MSI — bundles the app, the service, and the runtime |
| `installers/macos/` | pkg and notarisation |
| `installers/linux/` | deb and AppImage |
| `ci/` | shared CI steps |

Output goes to `artifacts/`, never into the source tree.

## The bundling step matters

`scripts/bundle-runtime.ps1` places a pinned Node runtime beside the engine inside
the installer. This is not an optimisation — an installer that expects the user to
have Node already forfeits the entire reason for shipping a native app. See
[ADR 0002](../docs/adr/0002-engine-language.md) and
[ADR 0004](../docs/adr/0004-sidecar-contract.md).
