import { useState, useEffect } from 'react'
import type { HelpMenuEvent } from '../../preload/index'
import { useTutorialStore } from '../store/tutorial'

export function useHelpMenu(currentProfileId: string | undefined) {
  const { loadTutorial, resetProgress: resetTutorial } = useTutorialStore()
  const [showHelpModal, setShowHelpModal] = useState(false)
  const [showShortcutsModal, setShowShortcutsModal] = useState(false)

  // Load tutorial data on mount
  useEffect(() => {
    void loadTutorial(currentProfileId)
  }, [])

  // Listen for help menu events from main process
  useEffect(() => {
    const unsubscribe = window.help.onHelpMenu((event: HelpMenuEvent) => {
      if (event === 'getting-started') {
        setShowHelpModal(true)
      } else if (event === 'shortcuts') {
        setShowShortcutsModal(true)
      } else {
        resetTutorial()
      }
    })
    return unsubscribe
  }, [])

  return { showHelpModal, setShowHelpModal, showShortcutsModal, setShowShortcutsModal }
}
