# Design Tokens – GradeBook Pro Client

**Last updated:** 2026-02-15  
**Source:** `src/index.css` CSS custom properties

---

## Overview

Design tokens are centralized variables used across the UI for consistency. Use these tokens instead of hardcoded values.

---

## Colors

### Primary (Blue)

| Token | Hex | Use |
|-------|-----|-----|
| `--primary-50` | #e8f4fc | Lightest tint, hover backgrounds |
| `--primary-100` | #c6e4f9 | Very light tint |
| `--primary-200` | #9fd1f5 | Light tint |
| `--primary-300` | #78bdf1 | Lighter |
| `--primary-400` | #5aaeee | **Primary action** (buttons, links) |
| `--primary-500` | #3d9feb | Default primary |
| `--primary-600`–`900` | Darker shades | Borders, pressed states |

### Accent

| Token | Use |
|-------|-----|
| `--accent-gradient` | Primary CTA gradient (e.g. btn-primary) |
| `--accent-purple` | Secondary actions, highlights |
| `--accent-pink` | Special accents |
| `--accent-cyan` | Info, links |
| `--accent-emerald` | Success states |
| `--accent-amber` | Warning |
| `--accent-red` | Error, destructive |

### Backgrounds (Dark Theme)

| Token | Use |
|-------|-----|
| `--bg-primary` | Page background |
| `--bg-secondary` | Cards, sidebars |
| `--bg-tertiary` | Nested cards, hover |
| `--bg-card` | Card surface |
| `--bg-card-hover` | Card hover state |
| `--bg-input` | Input backgrounds |

### Text

| Token | Use |
|-------|-----|
| `--text-primary` | Headings, primary text |
| `--text-secondary` | Body, descriptions |
| `--text-muted` | Placeholders, disabled |
| `--text-accent` | Links, highlights |

### Semantic (Success / Error / Warning)

| Token | Use |
|-------|-----|
| `--success-500` | Success icons, badges |
| `--error-500` | Error states |
| `--warning-500` | Warning states |
| `--grade-success`, `--grade-warning`, `--grade-error` | Grade colors |

---

## Spacing

| Token | Value | Use |
|-------|-------|-----|
| `--spacing-xs` | 0.25rem (4px) | Tight spacing |
| `--spacing-sm` | 0.5rem (8px) | Small gaps |
| `--spacing-md` | 1rem (16px) | Default |
| `--spacing-lg` | 1.5rem (24px) | Section spacing |
| `--spacing-xl` | 2rem (32px) | Page padding |
| `--spacing-2xl` | 3rem (48px) | Large sections |

---

## Border Radius

| Token | Value | Use |
|-------|-------|-----|
| `--radius-sm` | 6px | Small elements |
| `--radius-md` | 10px | Buttons, inputs, cards |
| `--radius-lg` | 16px | Modals, large cards |
| `--radius-xl` | 24px | Hero sections |
| `--radius-full` | 9999px | Pills, avatars |

---

## Typography

| Token | Value | Use |
|-------|-------|-----|
| `--font-sans` | Inter, system-ui | Body, UI |
| `--font-mono` | JetBrains Mono, Fira Code | Code |

---

## Layout

| Token | Value | Use |
|-------|-------|-----|
| `--sidebar-width` | 280px | Open sidebar |
| `--sidebar-collapsed` | 80px | Collapsed sidebar |
| `--header-height` | 70px | Fixed header |
| `--content-max-width` | 1400px | Page content |
| `--bp-md` | 899px | Mobile breakpoint |
| `--bp-sm` | 599px | Small mobile |

---

## Shadows

| Token | Use |
|-------|-----|
| `--shadow-sm` | Subtle elevation |
| `--shadow-md` | Cards, dropdowns |
| `--shadow-lg` | Modals |
| `--shadow-glow` | Primary button hover |

---

## Transitions

| Token | Value | Use |
|-------|-------|-----|
| `--transition-fast` | 150ms ease | Hover, focus |
| `--transition-normal` | 250ms ease | Open/close |
| `--transition-slow` | 400ms ease | Page transitions |

---

## Focus

| Token | Use |
|-------|-----|
| `--focus-ring` | Focus outline (rgba) |
| `--primary` | Primary color, used in focus-visible |

---

## Usage Example

```css
.my-component {
  background: var(--bg-card);
  padding: var(--spacing-md);
  border-radius: var(--radius-md);
  color: var(--text-primary);
}
```

```jsx
<div style={{ background: 'var(--bg-card)', padding: 'var(--spacing-md)' }}>
  ...
</div>
```

---

## Light Theme

Light theme overrides are in `[data-theme="light"]` in `index.css`. Key tokens (`--bg-primary`, `--text-primary`, etc.) change for light mode.
