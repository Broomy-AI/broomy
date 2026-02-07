import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' })
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' })

export const metadata: Metadata = {
  metadataBase: new URL('https://broomy.org'),
  title: 'Broomy — Command center for AI coding agents',
  description:
    'Manage multiple AI coding sessions across repositories. Open source desktop app with agent status detection, file explorer, git integration, and code review. Download for macOS.',
  openGraph: {
    title: 'Broomy — Command center for AI coding agents',
    description:
      'Manage multiple AI coding sessions across repositories. Open source desktop app for developers.',
    images: ['/screenshots/hero.png'],
    type: 'website',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body>
        <a href="#main-content" className="skip-link">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  )
}
