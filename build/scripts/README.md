# Build scripts

| Script | Does |
|---|---|
| `codegen.ps1` | zod → JSON Schema → C# DTOs; fails on drift |
| `emit-json-schema.ts` | the zod → JSON Schema half, run from `apps/core` |
| `bundle-runtime.ps1` | fetch and stage the pinned Node runtime |
| `version.ps1` | stamp one version across package.json, csproj, and installers |
| `package-desktop.ps1` | publish the .NET app and build the platform installer |
