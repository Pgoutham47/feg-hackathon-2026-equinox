import type { Metadata, Viewport } from 'next';

import { PrefetchProvider } from '@/features/prefetch/prefetch-provider';
import { QueryProvider } from '@/lib/query-provider';

import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Empire of Gold', template: '%s · Empire of Gold' },
  description: 'Instant-loading casino lobby.',
};

export const viewport: Viewport = {
  themeColor: '#000000',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">
        <QueryProvider>
          <PrefetchProvider>{children}</PrefetchProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
