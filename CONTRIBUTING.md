# Contributing

Thanks for taking an interest. Start with
[docs/dev/getting-started.md](docs/dev/getting-started.md) to get a build running,
then read [docs/architecture/overview.md](docs/architecture/overview.md) so the
shape of the thing makes sense before you change it.

## Before you open a pull request

```bash
npm run lint && npm run typecheck && npm test
```

If you touched `apps/core/src/contracts`, regenerate and commit the schemas —
CI fails on drift:

```bash
npm run schema:emit
```

## Four rules that are not style preferences

**Everything streams.** No operation may hold an unbounded amount of data in
memory. Collecting records into an array before writing them is the bug this tool
cannot afford — the largest instance is the one that most needs backing up.

**Logic goes in the engine.** The desktop app does UI, OS service control, native
pickers, and the credential vault. Nothing else. The moment backup logic exists in
both, the CLI and the GUI become two products that behave differently and every bug
has to be diagnosed twice.

**We are a guest on someone's production CMS.** Concurrency stays capped, 429 and
503 are honoured with backoff, and `POST /admin/login` is never retried
automatically — an automatic retry locks the user out of their own CMS.

**Restore gets the strictest review.** Backup reads; restore writes to production.
Changes there need the plan to still reflect what will actually be written, and
need testing against a schema with circular relations.

## Testing

Unit tests run anywhere. Anything touching a dialect, the relation graph, or the
archive format needs the sandbox:

```bash
npm run sandbox:up        # Strapi v5 on :1337, v4 on :1338
npm run test:integration -w strapi-remote-backup-pro
```

The seed schema is deliberately awkward — circular relations, dynamic zones, nested
repeatable components, several locales, drafts alongside published entries. A
change that only works against a flat single-locale schema has not been tested.

Integration tests run against real Strapi containers rather than mocks on purpose.
The admin API *is* the thing under test, and a mock keeps passing at exactly the
moment Strapi changes and the tool breaks.

## Decisions

Non-obvious choices live in [docs/adr](docs/adr) with their alternatives and costs
written down. If a change contradicts one, update the ADR in the same pull request
and say what changed — the costs are recorded so they do not have to be
rediscovered.

## Commits

Conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`.
Explain why in the body, not just what.

## Attribution

A commit carries one author: the person who made it. No assistant, bot, or tool is
ever credited as an author or co-author — no `Co-Authored-By:` trailer naming a
non-human, no "generated with" line, and no tool name in the message.

This is enforced rather than merely asked for. Three hooks live in
[.githooks](.githooks) and are versioned with the repository, so the protection
travels with a fresh clone:

| Hook | What it checks |
| --- | --- |
| `pre-commit` | author and committer identity, staged file names, staged file content |
| `commit-msg` | the commit message |
| `pre-push` | every commit being pushed — identity, message, file names, added lines |

`npm install` switches them on through the `prepare` script. To enable them by
hand, or to confirm they are on:

```bash
git config core.hooksPath .githooks
git config --get core.hooksPath      # -> .githooks
```

`pre-push` re-checks the whole history of what it is sending, so a commit made
with `--no-verify`, or one imported by cherry-pick or rebase, is still caught
before it can reach a remote.

## Licence

Contributions are accepted under the MIT licence
([LICENSE](LICENSE)). By opening a pull request you agree your contribution is
licensed on those terms.
