import type { ContentTypeDef, ComponentDef, StrapiDialect } from '../strapi/contracts.js';

/**
 * Read the full content model out of a running instance.
 *
 * A Strapi plugin would get this for free from the in-process `strapi.contentTypes`
 * registry. Running outside the instance, the Content-Type Builder admin API is
 * the equivalent, and reaching it is the single hard requirement that makes
 * admin credentials necessary rather than an API token.
 */
export interface ContentModel {
  contentTypes: Map<string, ContentTypeDef>;
  components: Map<string, ComponentDef>;
  locales: string[];
}

export async function discoverModel(dialect: StrapiDialect): Promise<ContentModel> {
  const [contentTypes, components, locales] = await Promise.all([
    dialect.listContentTypes(),
    dialect.listComponents(),
    dialect.listLocales(),
  ]);

  return {
    contentTypes: new Map(contentTypes.map((type) => [type.uid, type])),
    components: new Map(components.map((component) => [component.uid, component])),
    // An instance without the i18n plugin reports no locales at all. Treating
    // that as one unnamed locale keeps every caller from special-casing it.
    locales: locales.length > 0 ? locales : [],
  };
}

/** Content types that belong to plugins rather than the user's own API. Backed
 *  up only on request — most users want their own data, not Strapi's plumbing. */
export function isSystemType(uid: string): boolean {
  return uid.startsWith('admin::') || uid.startsWith('strapi::');
}

/**
 * Types a backup takes when the user has not named any.
 *
 * `api::` only. The plugin types that remain — upload files, i18n locales,
 * users-permissions roles — are either captured by a dedicated part of the run
 * (media) or are instance configuration rather than content, and sweeping them
 * into a default backup produces archives that fight the target instance on
 * restore.
 */
export function defaultBackupTypes(model: ContentModel): string[] {
  return [...model.contentTypes.keys()].filter((uid) => uid.startsWith('api::')).sort();
}
