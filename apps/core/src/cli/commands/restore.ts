/**
 * `strapi-backup restore <archive> --profile staging`
 *
 * Defaults to `--dry-run` semantics in spirit: the plan is always printed and
 * confirmation is required before anything is written, unless `--yes` is passed.
 * This command writes to a live CMS, and the cost of an accidental run is the
 * reason the confirmation is not optional by default.
 *
 * Key flags:
 *   --types <uid,...>      restore only these content types
 *   --ids <uid=id,...>     restore only these documents
 *   --depth <n>            pull in related records the selection depends on
 *   --strategy <s>         create | upsert | skip | replace
 *   --dry-run              print the plan and exit
 *   --yes                  skip confirmation, for CI
 */
export {};
