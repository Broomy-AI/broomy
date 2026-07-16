/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/renderer/index.html",
    "./src/renderer/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'bg-primary': '#1a1a1a',
        'bg-secondary': '#252525',
        'bg-tertiary': '#2d2d2d',
        'border': '#3a3a3a',
        'text-primary': '#e0e0e0',
        'text-secondary': '#a0a0a0',
        // Used 34 times across the app but never defined, so `text-text-tertiary`
        // emitted no CSS at all and those elements silently inherited their
        // parent's colour instead of being de-emphasised. 5.74:1 on bg-primary
        // and 4.54:1 on bg-tertiary — AA on every surface it lands on.
        'text-tertiary': '#949494',
        'accent': '#4a9eff',
        'status-working': '#4ade80',
        'status-waiting': '#facc15',
        // GitignoreChip uses `status-warning`, but only `status-waiting` existed,
        // so its tint and text emitted nothing. Alias rather than rename, so both
        // spellings keep working.
        'status-warning': '#facc15',
        'status-idle': '#6b7280',
        'status-error': '#f87171',
      }
    },
  },
  plugins: [],
}
