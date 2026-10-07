import type { MetadataRoute } from 'next';

/** Web app manifest: makes CEngine installable with its own window, icon and shortcuts. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'CEngine',
    short_name: 'CEngine',
    description: 'End-to-end encrypted messaging for people and teams.',
    start_url: '/chat',
    scope: '/',
    display: 'standalone',
    display_override: ['window-controls-overlay', 'standalone'],
    orientation: 'any',
    background_color: '#f6f6f7',
    theme_color: '#3355d6',
    categories: ['social', 'communication', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    shortcuts: [
      {
        name: 'New message',
        short_name: 'New',
        url: '/chat?action=new',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
      },
    ],
  };
}
