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

export async function discoverModel(_dialect: StrapiDialect): Promise<ContentModel> {
  throw new Error('not implemented');
}

/** Content types that belong to plugins rather than the user's own API. Backed
 *  up only on request — most users want their own data, not Strapi's plumbing. */
export function isSystemType(uid: string): boolean {
  return uid.startsWith('admin::') || uid.startsWith('strapi::');
}
