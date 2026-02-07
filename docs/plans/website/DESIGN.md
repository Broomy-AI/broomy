# Visual Design System

## Design Philosophy

Professional. Restrained. Dark. The website should look like it was made by the same team that built the app — engineering-first, not marketing-first. Think Vercel's website or Linear's landing page: generous whitespace, sharp typography, real product screenshots as the primary visual element.

No illustrations. No abstract gradients. No stock photography. The product IS the visual.

## Color Palette

Based on the app's own Tailwind config, extended for the website:

### Primary (from the app)
```
--bg-primary:     #0a0a0a    (page background — slightly darker than app's #1a1a1a)
--bg-secondary:   #141414    (card/section backgrounds)
--bg-tertiary:    #1a1a1a    (code blocks, elevated surfaces — matches app)
--border:         #2a2a2a    (subtle borders)
--border-hover:   #3a3a3a    (hover/active borders)
--text-primary:   #f0f0f0    (headings, primary text)
--text-secondary: #888888    (body text, descriptions)
--text-tertiary:  #555555    (captions, metadata)
--accent:         #4a9eff    (links, CTAs, interactive elements — matches app)
```

### Status colors (for badges/indicators in screenshots explanation)
```
--status-working: #4ade80    (green)
--status-idle:    #6b7280    (gray)
--status-error:   #f87171    (red)
```

### CTA Colors
```
--cta-primary-bg:     #f0f0f0    (white button on dark bg)
--cta-primary-text:   #0a0a0a    (dark text on white button)
--cta-secondary-bg:   transparent
--cta-secondary-border: #3a3a3a
--cta-secondary-text: #f0f0f0
```

## Typography

### Font Stack
```css
--font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
--font-mono: 'JetBrains Mono', 'SF Mono', 'Fira Code', monospace;
```

Use **Inter** via Google Fonts (variable weight). It's the standard for developer tools — familiar, highly legible, and professional.

### Scale
```
Hero headline:     text-5xl (48px) / font-bold / tracking-tight
Section headlines:  text-3xl (30px) / font-semibold / tracking-tight
Sub-headlines:     text-xl (20px) / font-medium
Body text:         text-base (16px) / font-normal / text-secondary
Small/caption:     text-sm (14px) / font-normal / text-tertiary
Code:              text-sm (14px) / font-mono
```

### Line heights
```
Headings:  leading-tight (1.25)
Body:      leading-relaxed (1.625)
```

## Layout

### Container
```
max-width: 1200px
padding: 0 24px (mobile), 0 48px (desktop)
centered
```

### Section spacing
```
Section gap:     160px (py-20)
Inner padding:   64px (py-16)
```

### Breakpoints
```
sm:  640px
md:  768px
lg:  1024px
xl:  1280px
```

Mobile-first, but this is a desktop app — the mobile layout is informational. Feature screenshots stack vertically on mobile.

## Components

### Screenshot Container
```
- Rounded corners (rounded-xl, 12px)
- Subtle border (1px solid #2a2a2a)
- Drop shadow: 0 25px 50px rgba(0, 0, 0, 0.5)
- Optional: very subtle outer glow using accent color at 5% opacity
- Max width: 1100px for hero, 900px for feature screenshots
- Aspect ratio preserved (the app window is ~1400x900)
```

### Download Button (Hero CTA)
```
- Large: px-8 py-4 text-lg font-semibold
- White background, dark text (high contrast)
- Rounded-lg
- Hover: slight scale (1.02) + shadow increase
- Icon: Apple logo or download icon
- Text: "Download for macOS" with version number below
```

### GitHub Button (Secondary CTA)
```
- Ghost style: transparent bg, white border, white text
- Same size as download button
- GitHub icon
- Text: "View on GitHub"
```

### Feature Section Layout
```
Alternating two-column layout:
  - Column 1: Screenshot (60% width)
  - Column 2: Text content (40% width)
  - Swap sides on alternating sections
  - Stack vertically on mobile

Text column contains:
  - Eyebrow label (text-sm, text-accent, font-mono, uppercase)
  - Heading (text-3xl, font-semibold)
  - Description (text-base, text-secondary, max-w-md)
```

### Tech Stack Badges
```
- Pill shape (rounded-full)
- Dark background (#1a1a1a)
- Border (#2a2a2a)
- Text: text-sm, text-secondary
- Horizontal scroll on mobile, wrap on desktop
```

### Code Block (for installation)
```
- Background: #141414
- Border: 1px solid #2a2a2a
- Rounded-lg
- Padding: 24px
- Font: JetBrains Mono
- Copy button in top-right corner
- Syntax highlighting for bash commands
```

## Screenshot Treatment

Screenshots are the most important visual element. They must look sharp and professional.

### Capture specifications
- **Resolution**: 2x (Retina) — capture at 2800x1800, display at 1400x900
- **Format**: PNG for quality, WebP with PNG fallback for production
- **Window chrome**: Include macOS title bar (the Electron window frame)
- **Background**: Screenshots sit on the dark page background with shadow

### Post-processing (done in the build pipeline)
1. Capture raw PNG from Playwright at 2x resolution
2. Convert to WebP (quality 90) with PNG fallback
3. Generate blur placeholder (10px wide) for lazy loading
4. No cropping, no annotations, no overlays — show the real app

## Animations

Minimal. The site should feel fast and solid, not bouncy.

- **Scroll reveal**: Sections fade in + translate up 20px as they enter viewport. Duration 600ms, ease-out.
- **Screenshot hover**: Subtle scale(1.01) on hover. 200ms transition.
- **CTA hover**: Scale(1.02) + shadow increase. 150ms transition.
- **No parallax. No scroll-jacking. No loading animations.**

## Accessibility

- All text meets WCAG AA contrast ratios against the dark background
- Screenshots have descriptive alt text
- Interactive elements have visible focus states (accent color ring)
- Skip navigation link for keyboard users
- Reduced motion media query disables all animations
