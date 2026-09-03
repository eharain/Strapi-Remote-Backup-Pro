import { describe, expect, it } from 'vitest';
import { createIdMap, rewriteFields } from '../../src/restore/remap.js';

const targets = (attribute: string): string | undefined =>
  ({ author: 'api::author.author', category: 'api::category.category' })[attribute];

describe('rewriteFields', () => {
  it('resolves a relation to the id the destination assigned', () => {
    const ids = createIdMap();
    ids.record('api::author.author', 'old-author', 'new-author');

    const result = rewriteFields(
      { title: 'Hello', author: { __ref: 'relation', documentId: 'old-author' } },
      ids,
      targets,
    );

    expect(result.fields).toEqual({ title: 'Hello', author: 'new-author' });
    expect(result.unresolved).toEqual([]);
  });

  it('resolves media by hash to the uploaded file id', () => {
    const ids = createIdMap();
    ids.recordMedia('photo_abc', 42);

    const result = rewriteFields(
      { cover: { __ref: 'media', hash: 'photo_abc', name: 'p.png', ext: '.png', mime: 'image/png' } },
      ids,
      targets,
    );

    expect(result.fields).toEqual({ cover: 42 });
  });

  it('reports an unresolved relation and nulls the field rather than dropping it', () => {
    // Omitting the key on an update would leave the destination's previous value
    // in place, which is not what the archive says.
    const result = rewriteFields(
      { author: { __ref: 'relation', documentId: 'never-written' } },
      createIdMap(),
      targets,
    );

    expect(result.fields).toEqual({ author: null });
    expect(result.unresolved).toEqual([
      { attribute: 'author', kind: 'relation', identity: 'never-written' },
    ]);
  });

  it('drops only the unresolvable entries from a to-many relation', () => {
    const ids = createIdMap();
    ids.record('api::category.category', 'known', 'known-new');

    const result = rewriteFields(
      {
        category: [
          { __ref: 'relation', documentId: 'known' },
          { __ref: 'relation', documentId: 'unknown' },
        ],
      },
      ids,
      targets,
    );

    expect(result.fields).toEqual({ category: ['known-new'] });
    expect(result.unresolved).toHaveLength(1);
  });

  it('rewrites references nested inside components', () => {
    const ids = createIdMap();
    ids.recordMedia('img_1', 7);

    const result = rewriteFields(
      {
        blocks: [
          {
            __component: 'shared.media',
            file: { __ref: 'media', hash: 'img_1', name: 'a.png', ext: '.png', mime: 'image/png' },
          },
        ],
      },
      ids,
      targets,
    );

    expect(result.fields).toEqual({
      blocks: [{ __component: 'shared.media', file: 7 }],
    });
  });

  it('leaves plain values untouched', () => {
    const result = rewriteFields(
      { title: 'x', count: 3, flag: true, nothing: null, list: [1, 2] },
      createIdMap(),
      targets,
    );
    expect(result.fields).toEqual({ title: 'x', count: 3, flag: true, nothing: null, list: [1, 2] });
  });
});

describe('createIdMap', () => {
  it('keeps identities separate per content type', () => {
    const ids = createIdMap();
    ids.record('api::a.a', 'same', 'a-new');
    ids.record('api::b.b', 'same', 'b-new');

    expect(ids.resolve('api::a.a', 'same')).toBe('a-new');
    expect(ids.resolve('api::b.b', 'same')).toBe('b-new');
    expect(ids.resolve('api::c.c', 'same')).toBeUndefined();
  });

  it('maps media by both hash and previous numeric id', () => {
    const ids = createIdMap();
    ids.recordMedia('h1', 20, 5);
    expect(ids.resolveMediaHash('h1')).toBe(20);
    expect(ids.resolveMedia(5)).toBe(20);
  });
});
