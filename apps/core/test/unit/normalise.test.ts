import { describe, expect, it } from 'vitest';
import {
  OMIT,
  identifyByNumericId,
  normaliseMedia,
  relationRef,
  toEnvelope,
} from '../../src/strapi/shared.js';

describe('relationRef', () => {
  it('reduces a populated relation to an identity reference', () => {
    // The content manager returns the whole related record. Keeping it would put
    // a copy of the author inside every one of their articles.
    const result = relationRef({
      id: 3,
      documentId: 'abc123',
      name: 'Author 1',
      createdAt: '2026-01-01T00:00:00.000Z',
    });

    expect(result).toEqual({ __ref: 'relation', documentId: 'abc123' });
  });

  it('reduces a media object to a reference carrying its filename', () => {
    const result = relationRef({
      id: 4,
      documentId: 'media1',
      name: 'photo.png',
      hash: 'photo_9a784ee60c',
      ext: '.png',
      mime: 'image/png',
      url: '/uploads/photo_9a784ee60c.png',
    });

    expect(result).toEqual({
      __ref: 'media',
      hash: 'photo_9a784ee60c',
      name: 'photo.png',
      ext: '.png',
      mime: 'image/png',
    });
  });

  it('drops an un-populated to-many relation reported as a count', () => {
    // `{ count: 2 }` is derived state. Archiving it would store a number where a
    // list belongs, and restoring it would send that number to a relation field.
    expect(relationRef({ count: 2 })).toBe(OMIT);
    expect(relationRef({ count: 0 })).toBe(OMIT);
  });

  it('keeps a component and strips its instance-local id', () => {
    const result = relationRef({
      id: 9,
      __component: 'shared.quote',
      body: 'Something quoted',
    });

    expect(result).toEqual({ __component: 'shared.quote', body: 'Something quoted' });
  });

  it('does not mistake a component for a relation', () => {
    // Both arrive as nested objects with an id. Only a record carries timestamps.
    const result = relationRef({ id: 9, title: 'a repeatable component entry' });
    expect(result).toEqual({ title: 'a repeatable component entry' });
  });

  it('recurses into arrays and nested components', () => {
    const result = relationRef({
      id: 1,
      __component: 'shared.slider',
      files: [
        { id: 2, name: 'a.png', hash: 'a_1', ext: '.png', mime: 'image/png', url: '/uploads/a_1.png' },
        { id: 3, name: 'b.png', hash: 'b_2', ext: '.png', mime: 'image/png', url: '/uploads/b_2.png' },
      ],
    });

    expect(result).toEqual({
      __component: 'shared.slider',
      files: [
        { __ref: 'media', hash: 'a_1', name: 'a.png', ext: '.png', mime: 'image/png' },
        { __ref: 'media', hash: 'b_2', name: 'b.png', ext: '.png', mime: 'image/png' },
      ],
    });
  });

  it('identifies v4 relations by numeric id', () => {
    const result = relationRef({ id: 7, title: 'x', updatedAt: '2026-01-01T00:00:00.000Z' }, identifyByNumericId);
    expect(result).toEqual({ __ref: 'relation', documentId: '7' });
  });
});

describe('toEnvelope', () => {
  it('separates envelope fields from user data', () => {
    const record = toEnvelope(
      {
        id: 1,
        documentId: 'doc1',
        locale: 'en',
        publishedAt: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      },
      { title: 'Hello' },
    );

    expect(record).toEqual({
      documentId: 'doc1',
      id: 1,
      locale: 'en',
      publishedAt: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
      fields: { title: 'Hello' },
    });
  });

  it('omits absent optionals rather than setting them undefined', () => {
    const record = toEnvelope({ documentId: 'doc1' }, {});
    expect(Object.keys(record).sort()).toEqual(['documentId', 'fields']);
  });
});

describe('normaliseMedia', () => {
  it('converts Strapi kilobytes to bytes', () => {
    // Strapi divides by 1000, not 1024. Measured against a real file: 271542
    // bytes is reported as 271.54.
    const file = normaliseMedia({ id: 1, name: 'a.png', hash: 'a_1', ext: '.png', mime: 'image/png', size: 271.54, url: '/uploads/a_1.png' });
    expect(file.size).toBe(271540);
  });

  it('treats an empty folder path as no folder', () => {
    // Strapi writes the root as both '' and '/'. Left as-is, the same file in
    // the same place compares unequal and a restore uploads a second copy.
    const empty = normaliseMedia({ id: 1, name: 'a.png', hash: 'a_1', ext: '.png', mime: 'image/png', size: 1, url: '/u', folderPath: '' });
    expect(empty.folderPath).toBeUndefined();

    const nested = normaliseMedia({ id: 1, name: 'a.png', hash: 'a_1', ext: '.png', mime: 'image/png', size: 1, url: '/u', folderPath: '/brand' });
    expect(nested.folderPath).toBe('/brand');
  });
});
