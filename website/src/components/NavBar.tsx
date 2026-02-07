'use client'

import { useEffect, useState } from 'react'
import { DownloadButtons } from './DownloadButton'

export default function NavBar() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const onScroll = () => {
      setVisible(window.scrollY > 400)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 border-b border-border-subtle bg-bg-page/90 backdrop-blur-sm transition-transform duration-300 ${
        visible ? 'translate-y-0' : '-translate-y-full'
      }`}
    >
      <div className="mx-auto flex max-w-[1200px] items-center justify-between px-6 py-3 md:px-12">
        <span className="text-lg font-semibold text-text-primary">Broomy</span>
        <DownloadButtons compact />
      </div>
    </nav>
  )
}
