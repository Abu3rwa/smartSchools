# GradeBook Client (React + Vite)

## Frontend conventions

- **Theme:** Use CSS variables from `src/index.css` (`:root` and `[data-theme="light"]`). Prefer `var(--text-primary)`, `var(--bg-card)`, `var(--border-color)`, `var(--spacing-*)`, `var(--radius-*)` instead of hardcoded colors or sizes.
- **Responsive:** Breakpoints are defined as `--bp-md: 899px`, `--bp-sm: 599px`, `--bp-xs: 380px` (use in media queries). Main layout is responsive (sidebar becomes drawer below 900px). Use `.show-mobile` / `.hide-mobile` for conditional visibility; tables should live in `.table-container` for horizontal scroll on small screens.
- **Modularization:** Reuse `EmptyState`, `LoadingSpinner`, `ErrorBanner` from `components/shared/`. Use global `.card`, `.card-header`, `.btn`, `.badge` classes where possible. Page-specific CSS should be scoped under a single root class (e.g. `.my-attendance-requests-page`).
- **Layout:** Content is rendered inside `MainLayout` → `main.page-content`. Use `PageContainer` when you need consistent max-width; page-level wrappers can set `max-width` and `margin: 0 auto` with `padding: var(--spacing-lg)`.

---

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
