/** Locale enumeration and per-locale record retrieval. */
import type { Selection } from '../../contracts/index.js';
import type { ContentModel } from '../../schema/discovery.js';

/**
 * Which locales this run covers.
 *
 * An empty selection means every locale the instance has. A selection naming
 * locales the instance does not have is a user error worth surfacing rather than
 * silently backing up nothing, so unknown codes are returned separately.
 */
export function resolveLocales(
  selection: Selection,
  model: ContentModel,
): { locales: string[]; unknown: string[] } {
  if (selection.locales.length === 0) return { locales: model.locales, unknown: [] };
  const available = new Set(model.locales);
  return {
    locales: selection.locales.filter((code) => available.has(code)),
    unknown: selection.locales.filter((code) => !available.has(code)),
  };
}
