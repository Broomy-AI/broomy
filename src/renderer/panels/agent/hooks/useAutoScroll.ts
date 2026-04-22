/**
 * Auto-scroll hook for the AgentChat message list.
 *
 * Tracks whether the user is scrolled to the bottom and auto-scrolls on new
 * messages. Exposes a "Go to End" button state for when the user scrolls up.
 */
import { useRef, useEffect, useCallback, useState } from 'react'

const NEAR_BOTTOM_THRESHOLD = 80

export function useAutoScroll(messageCount: number) {
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const shouldAutoScrollRef = useRef(true)
  const prevMessageCountRef = useRef(0)
  const [showScrollButton, setShowScrollButton] = useState(false)

  const isNearBottom = useCallback((el: HTMLElement) => {
    return el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_THRESHOLD
  }, [])

  const handleScrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    shouldAutoScrollRef.current = true
    setShowScrollButton(false)
  }, [])

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const atBottom = isNearBottom(el)
    shouldAutoScrollRef.current = atBottom
    setShowScrollButton(!atBottom)
  }, [isNearBottom])

  // Before new messages render, snapshot whether we're at the bottom
  if (messageCount !== prevMessageCountRef.current) {
    const el = scrollContainerRef.current
    if (el) {
      shouldAutoScrollRef.current = isNearBottom(el)
    }
    prevMessageCountRef.current = messageCount
  }

  // After render, scroll if we were at bottom
  useEffect(() => {
    if (shouldAutoScrollRef.current) {
      messagesEndRef.current?.scrollIntoView()
    }
  }, [messageCount])

  return { messagesEndRef, scrollContainerRef, showScrollButton, handleScrollToBottom, handleScroll }
}
