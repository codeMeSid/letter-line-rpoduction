import type { Metadata } from 'next';
import Script from 'next/script';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Letter Factory Line',
  description: 'Every typed letter runs an animated isometric line-art factory.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Script src="/hairline/kernel.js" strategy="beforeInteractive" />
        {children}
      </body>
    </html>
  );
}
