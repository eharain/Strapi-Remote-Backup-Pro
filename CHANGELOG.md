# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Repository structure: Node/TypeScript core, .NET 10 + Avalonia desktop shell.
- Architecture decision records covering engine language, UI stack, the
  sidecar contract, and the archive format.

### Changed
- The engine requires Node.js 22.19 or later (was 20.11). undici 8,
  commander 15, googleapis 186 and vitest 5 all need Node 22, and Node 20
  reached end of life in April 2026.
- Dependencies moved to their latest majors, including zod 4. The contract
  JSON Schemas are now emitted by zod's own `z.toJSONSchema`, replacing
  `zod-to-json-schema`.
