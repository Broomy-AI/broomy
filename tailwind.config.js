/** @type {import('tailwindcss').Config} */

// Colours resolve through CSS custom properties (see src/renderer/index.css), so
// the whole app can be re-themed without touching a component.
//
// Two rules this file must obey:
//
// 1. The `rgb(var(--x) / <alpha-value>)` FUNCTION form is mandatory. A bare
//    `var(--x)` holding a hex silently emits nothing for every alpha-modifier
//    utility, and there are ~110 of them (`bg-accent/80`, `border-border/50`).
//
// 2. The palette stays under `theme.extend.colors`. Moving it to `theme.colors`
//    would drop Tailwind's default grey scale, which is what Preflight's
//    `borderColor.DEFAULT` resolves to — every bare `border` in the app would
//    repaint.
const token = (name) => `rgb(var(--color-${name}) / <alpha-value>)`

// Font sizes are multiplied by --app-text-scale (default 1, so this is a no-op).
// That variable is the seam the "App text size" control plugs into: it scales the
// agent transcript, session list and explorer — all React text, none of which a
// terminal font-size setting can reach.
const scaled = (rem, lh) => [
  `calc(${rem}rem * var(--app-text-scale))`,
  { lineHeight: `calc(${lh}rem * var(--app-text-scale))` },
]

export default {
  content: [
    "./src/renderer/index.html",
    "./src/renderer/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'bg-primary': token('bg-primary'),
        'bg-secondary': token('bg-secondary'),
        'bg-tertiary': token('bg-tertiary'),
        'border': token('border'),
        'border-strong': token('border-strong'),
        'text-primary': token('text-primary'),
        'text-secondary': token('text-secondary'),
        'text-tertiary': token('text-tertiary'),
        'accent': token('accent'),
        'on-accent': token('on-accent'),
        'on-solid': token('on-solid'),
        'status-working': token('status-working'),
        'status-waiting': token('status-waiting'),
        'status-idle': token('status-idle'),
        'status-error': token('status-error'),
        'danger-soft': token('danger-soft'),
        'danger-fg': token('danger-fg'),
        'danger-base': token('danger-base'),
        'danger-solid': token('danger-solid'),
        'danger-deeper': token('danger-deeper'),
        'danger-deep': token('danger-deep'),
        'warning-subtle': token('warning-subtle'),
        'warning-soft': token('warning-soft'),
        'warning-fg': token('warning-fg'),
        'warning-base': token('warning-base'),
        'warning-solid': token('warning-solid'),
        'warning-strong': token('warning-strong'),
        'warning-deep': token('warning-deep'),
        'success-soft': token('success-soft'),
        'success-fg': token('success-fg'),
        'success-base': token('success-base'),
        'success-solid': token('success-solid'),
        'success-deep': token('success-deep'),
        'info-subtle': token('info-subtle'),
        'info-soft': token('info-soft'),
        'info-fg': token('info-fg'),
        'info-base': token('info-base'),
        'info-solid': token('info-solid'),
        'info-strong': token('info-strong'),
        'info-deep': token('info-deep'),
        'review-fg': token('review-fg'),
        'review-base': token('review-base'),
        'review-solid': token('review-solid'),
        'review-strong': token('review-strong'),
        'review-deep': token('review-deep'),
        'attention-fg': token('attention-fg'),
        'attention-base': token('attention-base'),
        'attention-solid': token('attention-solid'),
        'note-fg': token('note-fg'),
        'note-base': token('note-base'),
        'muted': token('muted'),
        'surface-hover': token('surface-hover'),
        'overlay': token('overlay'),
        'elevate': token('elevate'),
        'focus-ring': token('focus-ring'),
        'search-highlight': token('search-highlight'),
        // Alias, not a rename: GitignoreChip uses `status-warning`, everything
        // else uses `status-waiting`. Both keep working.
        'status-warning': token('status-waiting'),
      },
      fontSize: {
        // Replacements for the hardcoded `text-[10px]`-style classes. These set
        // font-size ONLY. An arbitrary value like `text-[10px]` sets no
        // line-height, so attaching one here would make those elements taller and
        // shift every row beneath them.
        'micro': `calc(0.5625rem * var(--app-text-scale))`, //  9px
        '3xs': `calc(0.625rem * var(--app-text-scale))`,    // 10px
        '2xs': `calc(0.6875rem * var(--app-text-scale))`,   // 11px
        // Tailwind's own scale, re-emitted through --app-text-scale. The
        // line-heights are Tailwind's exact defaults, so at scale 1 these are
        // byte-identical to what they replace.
        'xs': scaled(0.75, 1),
        'sm': scaled(0.875, 1.25),
        'base': scaled(1, 1.5),
        'lg': scaled(1.125, 1.75),
        'xl': scaled(1.25, 1.75),
        '2xl': scaled(1.5, 2),
      },
    },
  },
  plugins: [],
}
