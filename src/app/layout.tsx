import type { Metadata, Viewport } from 'next';

import { AccountProvider } from '@/lib/account';

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
      {/* The account is read from this browser's storage, so it wraps the whole
          tree rather than the dashboard alone — the game shell reads it too. */}
      <body className="min-h-dvh antialiased">
        <AccountProvider>{children}</AccountProvider>
      </body>
    </html>
  );
}
