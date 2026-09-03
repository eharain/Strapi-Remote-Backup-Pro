import { describe, expect, it } from 'vitest';
import { buildGraph } from '../../src/schema/graph.js';
import type { ContentModel } from '../../src/schema/discovery.js';
import type { ComponentDef, ContentTypeDef } from '../../src/strapi/contracts.js';

function type(uid: string, attributes: ContentTypeDef['attributes']): ContentTypeDef {
  return {
    uid,
    apiId: uid.split('.').pop() ?? uid,
    kind: 'collectionType',
    displayName: uid,
    draftAndPublish: false,
    i18nEnabled: false,
    attributes,
  };
}

function component(uid: string, attributes: ComponentDef['attributes']): ComponentDef {
  return { uid, category: 'shared', displayName: uid, attributes };
}

function model(types: ContentTypeDef[], components: ComponentDef[] = []): ContentModel {
  return {
    contentTypes: new Map(types.map((t) => [t.uid, t])),
    components: new Map(components.map((c) => [c.uid, c])),
    locales: ['en'],
  };
}

describe('buildGraph', () => {
  it('records an edge for a direct relation', () => {
    const graph = buildGraph(
      model([
        type('api::article.article', {
          author: { type: 'relation', relation: 'manyToOne', target: 'api::author.author' },
        }),
        type('api::author.author', {}),
      ]),
    );

    expect(graph.edges).toHaveLength(1);
    expect(graph.outgoing('api::article.article')[0]).toMatchObject({
      from: 'api::article.article',
      to: 'api::author.author',
      attribute: 'author',
    });
    expect(graph.incoming('api::author.author')).toHaveLength(1);
  });

  it('follows relations nested inside a component', () => {
    const graph = buildGraph(
      model(
        [
          type('api::page.page', {
            hero: { type: 'component', component: 'shared.hero' },
          }),
          type('api::author.author', {}),
        ],
        [
          component('shared.hero', {
            writer: { type: 'relation', relation: 'oneToOne', target: 'api::author.author' },
          }),
        ],
      ),
    );

    // A relation buried in a component is exactly as load-bearing as one at the
    // top level: missing it means the backup omits records the archive needs.
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0]).toMatchObject({
      from: 'api::page.page',
      to: 'api::author.author',
      viaComponent: 'shared.hero',
    });
  });

  it('follows relations inside every component of a dynamic zone', () => {
    const graph = buildGraph(
      model(
        [
          type('api::page.page', {
            blocks: { type: 'dynamiczone', components: ['shared.quote', 'shared.media'] },
          }),
          type('api::author.author', {}),
          type('api::asset.asset', {}),
        ],
        [
          component('shared.quote', {
            said_by: { type: 'relation', relation: 'oneToOne', target: 'api::author.author' },
          }),
          component('shared.media', {
            asset: { type: 'relation', relation: 'oneToOne', target: 'api::asset.asset' },
          }),
        ],
      ),
    );

    expect(graph.edges.map((edge) => edge.to).sort()).toEqual(['api::asset.asset', 'api::author.author']);
  });

  it('survives a component that contains itself', () => {
    // Strapi permits this, so the walker has to terminate on it rather than
    // recursing until the stack gives out on a schema the CMS accepts.
    const graph = buildGraph(
      model(
        [type('api::page.page', { body: { type: 'component', component: 'shared.nest' } })],
        [
          component('shared.nest', {
            child: { type: 'component', component: 'shared.nest' },
          }),
        ],
      ),
    );

    expect(graph.edges).toEqual([]);
  });

  it('orders types so a relation target comes first', () => {
    const graph = buildGraph(
      model([
        type('api::article.article', {
          category: { type: 'relation', relation: 'manyToOne', target: 'api::category.category' },
        }),
        type('api::category.category', {}),
      ]),
    );

    const { order, cycles } = graph.topologicalOrder();
    expect(cycles).toEqual([]);
    expect(order.indexOf('api::category.category')).toBeLessThan(order.indexOf('api::article.article'));
  });

  it('reports a cycle instead of failing, and still orders every type', () => {
    const graph = buildGraph(
      model([
        type('api::article.article', {
          author: { type: 'relation', relation: 'manyToOne', target: 'api::author.author' },
        }),
        type('api::author.author', {
          articles: { type: 'relation', relation: 'oneToMany', target: 'api::article.article' },
        }),
      ]),
    );

    const { order, cycles } = graph.topologicalOrder();
    // article ↔ author is the commonest shape in any real schema. It must be
    // reported for the applier's second pass, not treated as an error.
    expect(cycles).toEqual([['api::article.article', 'api::author.author']]);
    expect(order.sort()).toEqual(['api::article.article', 'api::author.author']);
  });

  it('does not treat a self-reference as an ordering constraint', () => {
    const graph = buildGraph(
      model([
        type('api::page.page', {
          parent: { type: 'relation', relation: 'manyToOne', target: 'api::page.page' },
        }),
      ]),
    );

    const { order, cycles } = graph.topologicalOrder();
    expect(cycles).toEqual([]);
    expect(order).toEqual(['api::page.page']);
  });
});
