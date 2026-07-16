/**
 * Drag-to-resize divider between layout panels.
 *
 * Renders a 1px visible line with a wider invisible hit area for easier grabbing.
 */
import type { DividerType } from '../shared/hooks/useDividerResize'

interface DividerProps {
  type: NonNullable<DividerType>
  direction: 'horizontal' | 'vertical'
  draggingDivider: DividerType
  onMouseDown: (type: DividerType) => (e: React.MouseEvent) => void
}

export function Divider({ type, direction, draggingDivider, onMouseDown }: DividerProps) {
  return (
    <div
      onMouseDown={onMouseDown(type)}
      className={`flex-shrink-0 group relative ${
        direction === 'vertical' ? 'w-px cursor-col-resize' : 'h-px w-full cursor-row-resize'
      }`}
    >
      <div className={`absolute z-10 ${
        direction === 'vertical' ? 'w-4 h-full -left-2 top-0' : 'h-4 w-full -top-2 left-0'
      }`} />
      <div className={`absolute transition-colors ${
        draggingDivider === type ? 'bg-accent' : 'bg-border-strong group-hover:bg-accent/70'
      } ${direction === 'vertical' ? 'w-px h-full left-0 top-0' : 'h-px w-full top-0 left-0'}`} />
    </div>
  )
}
