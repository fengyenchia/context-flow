import type { MetadataRoute } from 'next';
import { site } from '@/lib/site-metadata';

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: site.url }, { url: `${site.url}/guide` }];
}
