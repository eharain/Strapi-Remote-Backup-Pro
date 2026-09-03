/** Capture content-type and component definitions as they stood at backup time,
 *  so a restore can detect that the target's schema has since drifted. */
import type { ComponentDef, ContentTypeDef } from '../../strapi/contracts.js';
import type { ContentModel } from '../../schema/discovery.js';

export function captureContentTypes(model: ContentModel): ContentTypeDef[] {
  return [...model.contentTypes.values()].sort((a, b) => a.uid.localeCompare(b.uid));
}

export function captureComponents(model: ContentModel): ComponentDef[] {
  return [...model.components.values()].sort((a, b) => a.uid.localeCompare(b.uid));
}
