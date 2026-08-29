import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: 'Attune — Create what does not exist yet',
  description:
    'An agent-native specification layer for custom physical work, beginning with constrained 2D fabrication.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
