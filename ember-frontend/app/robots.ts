import type { MetadataRoute } from 'next';
import { config } from '@/lib/server/config';

/**
 * Only the shared recipe pages are for crawlers. Everything else is either
 * behind the sign-in wall or an API, so it's disallowed explicitly rather than
 * left to chance.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/r/'],
        disallow: ['/api/', '/admin', '/admin/', '/discover', '/create', '/daily', '/cookbook', '/profile', '/recipe/'],
      },
    ],
    sitemap: `${config.appOrigin}/sitemap.xml`,
  };
}
