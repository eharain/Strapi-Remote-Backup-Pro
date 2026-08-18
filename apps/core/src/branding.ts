/**
 * Product identity and attribution, in one place.
 *
 * The CLI banner, the `--version` output, the archive manifest's `producedBy`
 * field, the local API's health response, and the desktop About screen all read
 * from here. Attribution that is retyped in six places is attribution that
 * disagrees with itself by the third release.
 *
 * The MIT licence requires the copyright notice to travel with every copy, and
 * the archives this tool writes outlive the tool — so `PRODUCT.name` and
 * `PRODUCT.version` are recorded inside each one, letting a future reader
 * identify what produced a file it has never seen before.
 */
export const PRODUCT = {
  /** npm package name, and the identifier written into archive manifests. */
  id: 'strapi-remote-backup-pro',
  name: 'Strapi Remote Backup Pro',
  version: '0.1.0',

  author: {
    name: 'Ejaz Hussain Arain',
    email: 'hello@tech-style.co',
  },

  company: {
    name: 'Tech Style Ltd',
    url: 'https://tech-style.co/',
    registration: 'Registered in England & Wales · Company No. 11101491',
  },

  copyright: 'Copyright © 2026 Ejaz Hussain Arain. All rights reserved.',
  license: 'MIT',

  links: {
    product: 'https://tech-style.co/products.html#remote-backup',
    repository: 'https://github.com/eharain/strapi-remote-backup-pro',
    npm: 'https://www.npmjs.com/package/strapi-remote-backup-pro',
    issues: 'https://github.com/eharain/strapi-remote-backup-pro/issues',
  },
} as const;

/**
 * Trademark position, shown in About and in the published listings.
 *
 * This tool drives Strapi's admin API from outside without a plugin installed,
 * so being explicit about the lack of affiliation is worth doing plainly rather
 * than leaving to inference.
 */
export const TRADEMARK_NOTICE =
  'Strapi is a trademark of Strapi Solutions SAS. This product is an independent ' +
  'tool and is not affiliated with, endorsed by, or sponsored by Strapi Solutions SAS.';

/** One-line attribution for the CLI banner and log headers. */
export function attributionLine(): string {
  return `${PRODUCT.name} v${PRODUCT.version} — ${PRODUCT.author.name}, ${PRODUCT.company.name} (${PRODUCT.company.url})`;
}
