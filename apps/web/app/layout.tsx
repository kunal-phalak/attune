import { Analytics } from '@vercel/analytics/next';

import 'mapbox-gl/dist/mapbox-gl.css';
import './globals.css';

import type { Metadata } from 'next';

import { AttuneUiProvider } from '../components/attune-ui-provider';

export const metadata: Metadata = {
  title: 'Attune — Create what does not exist yet',
  description:
    'An agent-native specification layer for custom physical work, beginning with constrained 2D fabrication.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="isolate min-h-dvh bg-kumo-canvas text-kumo-contrast antialiased">
        <AttuneUiProvider>{children}</AttuneUiProvider>
        <Analytics />
      </body>
    </html>
  );
}
