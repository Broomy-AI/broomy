import { useState, useEffect, useRef, useCallback } from 'react'
import { useTutorialStore, TUTORIAL_STEPS } from '../store/tutorial'

export default function TutorialPanel() {
  const { completedSteps, markStepComplete, markStepIncomplete } = useTutorialStore()

  const completedCount = completedSteps.length
  const totalCount = TUTORIAL_STEPS.length
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0

  // Find the first incomplete step index as default expanded
  const firstIncompleteIndex = TUTORIAL_STEPS.findIndex(s => !completedSteps.includes(s.id))
  const defaultExpanded = firstIncompleteIndex >= 0 ? firstIncompleteIndex : 0

  const [expandedIndex, setExpandedIndex] = useState(defaultExpanded)
  const stepRefs = useRef<(HTMLDivElement | null)[]>([])
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to the current expanded step
  useEffect(() => {
    const el = stepRefs.current[expandedIndex]
    if (el && scrollContainerRef.current) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [expandedIndex])

  const handleToggleStep = useCallback((index: number) => {
    setExpandedIndex(prev => prev === index ? -1 : index)
  }, [])

  const allComplete = completedCount === totalCount

  return (
    <div className="h-full flex flex-col">
      {/* Header with progress */}
      <div className="p-4 border-b border-border flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-medium text-text-primary">Getting Started</h2>
          <span className="text-xs text-text-secondary">
            {completedCount}/{totalCount}
          </span>
        </div>
        <div className="h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
          <div
            className="h-full bg-accent transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        {allComplete && (
          <p className="text-xs text-accent mt-2">All steps complete!</p>
        )}
      </div>

      {/* Accordion steps */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
        {TUTORIAL_STEPS.map((step, index) => {
          const isComplete = completedSteps.includes(step.id)
          const isExpanded = expandedIndex === index

          return (
            <div
              key={step.id}
              ref={el => { stepRefs.current[index] = el }}
              className="border-b border-border last:border-b-0"
            >
              {/* Step header - clickable */}
              <button
                onClick={() => handleToggleStep(index)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-bg-tertiary/50 transition-colors"
              >
                {/* Completion indicator */}
                <div className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${
                  isComplete ? 'bg-accent text-white' : 'bg-bg-secondary border border-border'
                }`}>
                  {isComplete ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <span className="text-[10px] text-text-secondary font-medium">{index + 1}</span>
                  )}
                </div>

                {/* Title */}
                <span className={`flex-1 text-sm ${
                  isComplete ? 'text-text-primary' : 'text-text-secondary'
                }`}>
                  {step.title}
                </span>

                {/* Expand chevron */}
                <svg
                  width="12" height="12" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2"
                  className={`flex-shrink-0 text-text-secondary transition-transform duration-200 ${
                    isExpanded ? 'rotate-180' : ''
                  }`}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {/* Expanded content */}
              {isExpanded && (
                <div className="px-4 pb-4 pl-12">
                  <p className="text-xs text-text-secondary leading-relaxed mb-3">
                    {step.description}
                    {step.link && (
                      <>
                        {' '}
                        <button onClick={() => window.shell.openExternal(step.link!.url)} className="text-accent hover:underline">{step.link.label}</button>
                      </>
                    )}
                  </p>
                  {isComplete ? (
                    <button
                      onClick={() => markStepIncomplete(step.id)}
                      className="text-xs px-2.5 py-1 rounded bg-bg-tertiary text-text-secondary hover:text-text-primary transition-colors"
                    >
                      Mark not done
                    </button>
                  ) : (
                    <button
                      onClick={() => markStepComplete(step.id)}
                      className="text-xs px-2.5 py-1 rounded bg-accent text-white hover:bg-accent/80 transition-colors"
                    >
                      Done
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

    </div>
  )
}
