# Generated DTOs — do not edit

These types are generated from the engine's zod contracts:

```
apps/core/src/contracts/*.ts
        │  npm run schema:emit
        ▼
docs/api/schema/*.json          (JSON Schema, committed — reviewable in diffs)
        │  build/scripts/generate-csharp-dtos.ps1
        ▼
this folder
```

Regenerate with `build/scripts/codegen.ps1`. CI fails the build if the committed
output differs from what the current contracts produce, so drift is caught in a
pull request rather than at runtime.
