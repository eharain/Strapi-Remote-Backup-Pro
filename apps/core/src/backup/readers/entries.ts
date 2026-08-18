/**
 * Page through a content type's records.
 *
 * Sorted by `updatedAt` ascending and paged by offset. That ordering matters:
 * records edited during a long backup would otherwise shift between pages and be
 * silently skipped, which is the classic way a backup tool loses exactly the
 * data that was being worked on.
 */
export {};
