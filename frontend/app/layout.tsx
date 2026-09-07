import type { Metadata, Viewport } from 'next'

import { ThemeProvider } from '@/lib/theme'
import './globals.css'

export const metadata: Metadata = {
  title: 'Kazifeed Cost Dashboard',
  description:
    'Feed production, logistics and inventory cost across the Kazi Farms feed mills.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

/**
 * Applied before paint so a dark-mode reader never sees a white flash.
 * Mirrors lib/theme.tsx — keep the storage key in sync.
 */
const NO_FLASH = `
(function(){
  try {
    var m = localStorage.getItem('kfg-theme');
    if (m === 'light' || m === 'dark') document.documentElement.setAttribute('data-theme', m);
  } catch (e) {}
})();
`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH }} />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
