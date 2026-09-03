/** Bridges the readers to the archive layer, one content type at a time. */
import type { AttributeDef, NormalisedRecord, StrapiDialect } from '../strapi/contracts.js';
import type { ContentModel } from '../schema/discovery.js';
import { isRelationRef } from '../strapi/shared.js';

/**
 * Which documents a set of records point at, grouped by the type they live in.
 *
 * A stored reference is only `{ __ref: 'relation', documentId }` — it does not
 * say which content type it belongs to, because the same documentId means
 * nothing without one. The type comes from the schema instead: the attribute
 * that held the reference declares its target. That is why this walks the record
 * and its content type side by side rather than scanning the record alone, and
 * it is what lets relations buried inside components and dynamic zones be found
 * at all.
 */
export async function collectRelatedIds(
  dialect: StrapiDialect,
  model: ContentModel,
  uid: string,
  documentIds: string[],
): Promise<Map<string, string[]>> {
  const found = new Map<string, Set<string>>();
  const type = model.contentTypes.get(uid);
  if (!type) return new Map();

  const records = await dialect.fetchByIds(uid, documentIds);
  for (const record of records) {
    walk(record.fields, type.attributes, model, found, new Set());
  }

  return new Map([...found].map(([target, ids]) => [target, [...ids]]));
}

function walk(
  value: Record<string, unknown>,
  attributes: Record<string, AttributeDef>,
  model: ContentModel,
  found: Map<string, Set<string>>,
  seenComponents: Set<string>,
): void {
  for (const [name, attribute] of Object.entries(attributes)) {
    const field = value[name];
    if (field === undefined || field === null) continue;

    if (attribute.type === 'relation' && attribute.target) {
      for (const item of asArray(field)) {
        if (isRelationRef(item)) add(found, attribute.target, item.documentId);
      }
      continue;
    }

    if (attribute.type === 'component' && attribute.component) {
      const component = model.components.get(attribute.component);
      if (!component || seenComponents.has(attribute.component)) continue;
      const nested = new Set(seenComponents);
      nested.add(attribute.component);
      for (const item of asArray(field)) {
        if (isRecord(item)) walk(item, component.attributes, model, found, nested);
      }
      continue;
    }

    if (attribute.type === 'dynamiczone') {
      for (const item of asArray(field)) {
        if (!isRecord(item)) continue;
        // A dynamic zone holds a mix of component types, and only the entry
        // itself knows which one it is.
        const componentUid = item['__component'];
        if (typeof componentUid !== 'string') continue;
        const component = model.components.get(componentUid);
        if (!component || seenComponents.has(componentUid)) continue;
        const nested = new Set(seenComponents);
        nested.add(componentUid);
        walk(item, component.attributes, model, found, nested);
      }
    }
  }
}

function add(found: Map<string, Set<string>>, target: string, documentId: string): void {
  const bucket = found.get(target);
  if (bucket) bucket.add(documentId);
  else found.set(target, new Set([documentId]));
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [value];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Records as they are written into the archive: the envelope plus its fields. */
export function serialiseForArchive(record: NormalisedRecord): unknown {
  return {
    documentId: record.documentId,
    ...(record.locale !== undefined ? { locale: record.locale } : {}),
    ...(record.publishedAt !== undefined ? { publishedAt: record.publishedAt } : {}),
    ...(record.createdAt !== undefined ? { createdAt: record.createdAt } : {}),
    ...(record.updatedAt !== undefined ? { updatedAt: record.updatedAt } : {}),
    fields: record.fields,
  };
}
