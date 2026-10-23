import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { privateMetadata, site, siteMetadata } from './site-metadata';
import sitemap from '../app/sitemap';
import robots from '../app/robots';

describe('site metadata', () => {
  it('uses the production site and one shared image for Open Graph and Twitter', () => {
    expect(siteMetadata.metadataBase.href).toBe(`${site.url}/`);
    expect(siteMetadata.openGraph.locale).toBe('zh_TW');
    expect(siteMetadata.openGraph.images[0].url).toBe(site.image);
    expect(siteMetadata.twitter.images[0].url).toBe(site.image);
    expect(siteMetadata.twitter.card).toBe('summary_large_image');
    expect(siteMetadata.description).toContain('節點畫布');
  });

  it('ships an actual 1200 × 630 PNG under the social image size limit', () => {
    const image = readFileSync(new URL(`../../public${site.image}`, import.meta.url));
    expect(image.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(image.readUInt32BE(16)).toBe(1200);
    expect(image.readUInt32BE(20)).toBe(630);
    expect(image.length).toBeLessThan(5 * 1024 * 1024);
  });

  it('keeps private routes out of indexing and lists the public home and guide', () => {
    expect(privateMetadata.robots).toEqual({ index: false, follow: false });
    expect(privateMetadata.referrer).toBe('no-referrer');
    expect(sitemap()).toEqual([{ url: site.url }, { url: `${site.url}/guide` }]);
    expect(robots().sitemap).toBe(`${site.url}/sitemap.xml`);
    expect(siteMetadata).not.toHaveProperty('alternates');
  });
});
