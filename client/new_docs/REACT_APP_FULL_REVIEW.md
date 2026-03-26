# React Client Application — Full Architecture Review

**Date:** March 26, 2026  
**Scope:** `server/client/src/` — React + Redux Toolkit + Vite + MUI  
**Purpose:** Code structure & modularization audit for scalability and maintainability

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Technology Stack](#2-technology-stack)
3. [Project Structure Overview](#3-project-structure-overview)
4. [Redux Toolkit Architecture](#4-redux-toolkit-architecture)
5. [Service & API Layer](#5-service--api-layer)
6. [Routing & Navigation](#6-routing--navigation)
7. [Component Architecture](#7-component-architecture)
8. [Custom Hooks Patterns](#8-custom-hooks-patterns)
9. [Internationalization (i18n)](#9-internationalization-i18n)
10. [Styling Strategy](#10-styling-strategy)
11. [Configuration & Constants](#11-configuration--constants)
12. [Dead Code & Debug Artifacts](#12-dead-code--debug-artifacts)
13. [Incomplete & Coming-Soon Features](#13-incomplete--coming-soon-features)
14. [Testing Status](#14-testing-status)
15. [Modularization Plan](#15-modularization-plan)
16. [Improvement Plan](#16-improvement-plan)
17. [New Features That Can Be Added](#17-new-features-that-can-be-added)
18. [Incomplete Features to Complete](#18-incomplete-features-to-complete)
19. [Miscellaneous Findings](#19-miscellaneous-findings)

---

## 1. Executive Summary

| Aspect | Rating | Notes |
|--------|--------|-------|
| **Overall Architecture** | 7/10 | Solid foundation, needs modularization for scale |
| **Redux Implementation** | 6.5/10 | Consistent patterns but several oversized slices |
| **Component Decomposition** | 6/10 | Good page-level separation; shared library weak |
| **Service Layer** | 5.5/10 | Inconsistent patterns, no error handling in services |
| **Routing & Auth** | 9/10 | Excellent multi-layer guard system |
| **i18n** | 7/10 | Functional en/ar, lazy-loaded namespaces |
| **Styling** | 6/10 | Mixed approaches (global CSS + MUI sx), no CSS modules |
| **Testing** | 0/10 | No test files detected anywhere |

The app is **production-functional** with 130+ lazy-loaded pages, 22 Redux slices, 23 services, and 68+ custom hooks. The core issues that limit scalability are:

- **3 oversized Redux slices** (practiceSlice, standardSlice, studentSlice) violating Single Responsibility
- **Inconsistent API response extraction** across the service layer
- **No shared form component library** — modals duplicate form patterns
- **Zero test coverage**
- **Global CSS without module scoping** — potential class name collisions at scale

---

## 2. Technology Stack

| Category | Package | Version |
|----------|---------|---------|
| **UI Framework** | React | 19.x |
| **State Management** | @reduxjs/toolkit | ^2.11.2 |
| **Redux Bindings** | react-redux | ^9.2.0 |
| **Routing** | react-router-dom | ^7.13.0 |
| **UI Library** | @mui/material | ^7.3.8 |
| **CSS-in-JS** | @emotion/react, @emotion/styled | ^11.14.x (underutilized) |
| **HTTP Client** | axios | ^1.13.3 |
| **i18n** | i18next + react-i18next | ^25.8 / ^16.5 |
| **Charts** | recharts | ^3.7.0 |
| **Date Utils** | date-fns | ^4.1.0 |
| **HTML Sanitize** | dompurify, isomorphic-dompurify | ^3.3.1 / ^2.30.0 |
| **Toasts** | react-hot-toast | ^2.6.0 |
| **Icons** | react-icons | ^5.5.0 |
| **Build Tool** | Vite | ^7.3.1 |
| **RTL Support** | stylis-plugin-rtl | ^2.1.1 |

---

## 3. Project Structure Overview

```
src/
├── api/                    # Direct API functions (4 files) — bypasses services
├── assets/                 # Static assets
├── components/             # Shared & feature components
│   ├── analytics/          # Chart components
│   ├── behavior/           # Auto-tracker
│   ├── calendar/           # Calendar widgets
│   ├── common/             # TablePagination
│   ├── grades/             # LessonPlanLinkSelector
│   ├── layout/             # MainLayout, Sidebar, Header, AdminLayout
│   ├── lessonPlan/         # Lesson plan modals & AI tools
│   ├── reports/            # AI report modal, selectors
│   ├── shared/             # EmptyState, ErrorBanner, LoadingSpinner, ImageUploader
│   ├── substitutions/      # Substitution table & status
│   ├── superAdmin/         # Super admin base CSS
│   └── ui/                 # Primitives (button, loaders, progress, skeleton)
├── config/                 # API config, landing page defaults
├── constants/              # Permissions, AI languages
├── contexts/               # AuthContext (DEPRECATED — dead code)
├── i18n/                   # i18next config, locales, RTL cache
├── lib/                    # Utility (clsx wrapper for shadcn compat)
├── pages/                  # 130+ pages organized by role/feature
│   ├── admin/              # School admin pages (10 submodules)
│   ├── teacher/            # Teacher pages (7 submodules)
│   ├── student/            # Student pages (6 submodules)
│   ├── parent/             # Parent pages (newsletters only)
│   ├── superAdmin/         # Platform admin pages
│   ├── auth/               # Login, register, password reset, OAuth
│   ├── assignments/        # Assignment management
│   ├── attendance/         # Attendance module
│   ├── behavior/           # Behavior tracking
│   ├── classes/            # Class management
│   ├── curriculum/         # Curriculum maps
│   ├── gradebook/          # Gradebook
│   ├── grades/             # Grade management
│   ├── interventions/      # Intervention queue
│   ├── lessonPlan/         # Lesson plans
│   ├── messages/           # Messaging system
│   ├── notifications/      # Notification center
│   ├── reports/            # Report templates, history, analytics
│   ├── revisionPlans/      # Revision planning
│   ├── sbr/                # Standards-based reporting
│   ├── schoolSettings/     # School configuration
│   ├── settings/           # User settings
│   ├── standards/          # Standards management
│   ├── students/           # Student management
│   ├── subjects/           # Subject management
│   ├── substitutions/      # Teacher substitution
│   └── teachers/           # Teacher management
├── services/               # API service layer (23 files)
├── store/                  # Redux store
│   ├── index.js            # Store configuration
│   └── slices/             # 22 Redux slices
├── utils/                  # csvImport, sbrScaleUtils, standardLabel
├── App.jsx                 # Root component with all route definitions
├── main.jsx                # Entry point (Provider, i18n, StrictMode)
└── theme.js                # MUI theme generator (light/dark, LTR/RTL)
```

### Structural Strengths
- Clear separation by feature domain inside `pages/`
- Each complex page has a predictable internal structure: `PageName.jsx`, `components/`, `hooks/`, `utils/`, `constants.js`
- Store slices separated from components

### Structural Weaknesses
- `api/` layer duplicates `services/` layer with better error handling — unclear which to use
- `contexts/` contains dead code (AuthContext deprecated, auth is Redux-based)
- `components/` mixes domain-specific folders (analytics, behavior, calendar) with true shared components (shared, ui, common)
- 5 orphaned page files sitting at `pages/` root level instead of in subfolders

---

## 4. Redux Toolkit Architecture

### 4.1 Store Configuration

- Configured in `store/index.js`
- Uses `configureStore` with combined reducers
- Academic year change triggers root-level state reset (via `rootReducer` wrapper)
- No middleware customization beyond defaults
- **Does NOT use RTK Query** — all API calls go through `createAsyncThunk` + service layer

### 4.2 Slice Inventory

| Slice | Thunks | Selectors | State Props | Assessment |
|-------|--------|-----------|-------------|------------|
| `authSlice` | 7 | 8 | 8 | ✅ Reasonable |
| `behaviorSlice` | 6 | 8 | 10 | ⚠️ Nested loading/error objects |
| `calendarSlice` | 5 | 6 | 7 | ✅ Good, has cache prevention |
| `classSlice` | 5 | 6 | 6 | ⚠️ Normalizes API response (backend inconsistency) |
| `dashboardSlice` | 4 | 5 | 5 | ✅ Good |
| `departmentSlice` | 4 | 4 | 4 | ✅ Clean, focused |
| `gradeSlice` | 8 | 10 | 12 | ⚠️ Stores derived data (averages) |
| `lessonSlice` | 9 | 10 | 14 | ⚠️ Per-ID loading maps, complex |
| `newsletterSlice` | 7 | 8 | 10 | ⚠️ Deeply nested by role |
| `notificationSlice` | 5 | 5 | 6 | ✅ Good |
| `practiceSlice` | 10 | 21 | 21+ | 🔴 **OVERSIZED** — mixes UI + domain |
| `readingSlice` | 6 | 7 | 7 | ✅ Good |
| `revisionSlice` | 5 | 5 | 5 | ✅ Good |
| `schoolFeaturesSlice` | 3 | 6 | 6 | ✅ Good |
| `schoolSlice` | 5 | 6 | 6 | ✅ Clean |
| `standardSlice` | 14 | 23 | 18+ | 🔴 **OVERSIZED** — 4 domains in one slice |
| `studentSlice` | 20 | 15 | 18+ | 🔴 **OVERSIZED** — CRUD + auth + media + promotion |
| `subjectSlice` | 4 | 4 | 4 | ✅ Simple and focused |
| `subscriptionSlice` | 3 | 4 | 4 | ✅ Good |
| `substitutionsSlice` | 8 | 10 | 12 | ⚠️ 8 nested objects with repeating patterns |
| `teacherSlice` | 7 | 8 | 8 | ⚠️ Cross-slice dispatch (teacher → class) |
| `uiSlice` | 2 | 8 | 8 | ⚠️ Mixes UI state with business logic (academic year) |

### 4.3 Critical Redux Issues

**Issue 1: `practiceSlice` — 21+ state properties**
- Manages question state, session state, results, history, and UI concerns in one slice
- 21 selectors is the 2nd highest in the codebase
- Recommendation: Split into `practiceDataSlice` + `practiceSessionSlice`

**Issue 2: `standardSlice` — 14 async thunks, 23 selectors**
- Manages 4 distinct domains: standards CRUD, assignments, progress tracking, and standards-based gradebook
- Largest selector count in the entire codebase
- Recommendation: Split into `standardsSlice`, `standardAssignmentsSlice`, `standardProgressSlice`, `sbGradebookSlice`

**Issue 3: `studentSlice` — 20 async thunks**
- Handles student CRUD, authentication, media upload, AND promotion workflow
- Contains `console.error` debug code
- Recommendation: Split into `studentSlice`, `studentAuthSlice`, `studentPromotionSlice`

**Issue 4: `uiSlice` — mixed concerns**
- Academic year selection is a business concern, not a UI concern
- Academic year changes trigger root-level cache invalidation (tight coupling)
- Recommendation: Extract `academicYearSlice` separately

### 4.4 Redux Patterns — Good

- ✅ Consistent use of `rejectWithValue` for error handling in thunks
- ✅ Academic year scoping via root reducer reset pattern
- ✅ Conditional thunk execution (calendar caching prevents redundant fetches)
- ✅ Comprehensive selector coverage — components never access `state.` directly
- ✅ localStorage integration for persistence (theme, language, sidebar state)

### 4.5 Redux Patterns — Problematic

- ❌ Multiple slices use nested `loading`/`error` objects per sub-entity (behavior, lesson, newsletter, substitutions) — makes state shape unpredictable
- ❌ No use of `createEntityAdapter` for normalized collections
- ❌ `gradeSlice` stores derived data (averages) instead of computing in selectors
- ❌ Cross-slice dispatches (teacherSlice dispatches classSlice actions) — creates coupling
- ❌ No RTK Query adoption — all API caching is manual

---

## 5. Service & API Layer

### 5.1 Three-Layer API Architecture

The app has **three separate layers** for API communication, which creates confusion:

```
Component → Custom Hook → Redux Thunk → Service → axios (config/api.js)
                                    ↘
                         API Layer (src/api/) → axios (config/api.js)
```

1. **`config/api.js`** — Centralized axios instance with interceptors (token, refresh, academic year header)
2. **`services/`** (23 files) — Thin wrappers calling axios, NO error handling
3. **`api/`** (4 files) — Direct API functions WITH error handling and response validation

### 5.2 Service Layer Issues

**Inconsistent response extraction across services:**

| Pattern | Used By | Returns |
|---------|---------|---------|
| `response.data` | assignmentService, classService, gradeService, teacherService, etc. | Raw axios response data |
| `response?.data?.data ?? {}` | curriculumService (via `toData()` helper) | Nested data extraction |
| `getNestedData()` with fallback | sbrService | Custom extraction logic |
| `return api.post(...)` (no extraction) | behaviorTrackingService | Returns full Promise\<AxiosResponse\> |
| Named exports | landingContentService, readingService, revisionService | Varies |

**Zero error handling in all 23 services** — errors propagate uncaught to Redux thunks, which handle them inconsistently.

### 5.3 Code Duplication in Services

| Duplicated Logic | Files |
|------------------|-------|
| File download / blob handling | `importTemplateService`, `curriculumService`, `sbrService`, `communicationEmailApi` |
| Content-Disposition filename parsing | `importTemplateService` (`getFilenameFromDisposition`), `communicationEmailApi` (`readFilenameFromDisposition`) |
| FormData construction for uploads | `curriculumService`, `communicationEmailApi`, `importTemplateService` |
| Pagination URL building | Multiple services build `URLSearchParams` independently |

### 5.4 Axios Config (`config/api.js`)

**Strengths:**
- ✅ Centralized token refresh with subscription pattern
- ✅ Auth token injection via request interceptor
- ✅ Academic year header propagation (`x-academic-year`)
- ✅ Behavior session ID header propagation

**Issues:**
- ⚠️ Token refresh creates a new `axios` instance inline instead of a dedicated refresh client
- ⚠️ 401 handling clears auth silently without dispatching a Redux logout action
- ⚠️ No request/response logging for debugging in development

---

## 6. Routing & Navigation

### 6.1 Route Architecture

**Three main route groups:**

1. **Public Routes** — `/login`, `/register-school`, `/forgot-password`, `/reset-password`, `/auth/callback`, `/substitutions/respond`
2. **Authenticated Routes** (`/portal/*`) — Protected by 3-layer guard system → `MainLayout`
3. **Super Admin Routes** (`/admin/*`) — Separate `AdminLayout` with super_admin role enforcement

### 6.2 Route Protection (Excellent)

Multi-layer guard system:

| Guard | Purpose |
|-------|---------|
| `ProtectedRoute` | Checks authentication, redirects to `/` |
| `PasswordChangeRoute` | Forces password change if `mustChangePassword = true` |
| `PortalRoute` | Prevents super_admin from accessing `/portal/*` |
| `RoleRoute` | Role + permission-based access control |
| `FeatureGate` | Feature flag gating with upgrade prompt fallback |

### 6.3 Lazy Loading

- ✅ **All 130+ pages use `React.lazy()`** with `<Suspense>` and `<RouteLoadingFallback>`
- ✅ Proper code splitting per route
- ✅ Consistent loading state across all lazy routes

### 6.4 Feature Gating (Well Implemented)

Feature-gated pages:
- `standardsPractice`, `customReports`, `advancedAnalytics`
- `academicIntelligence`, `revisionPlanning`, `readingAssistant`
- `interventionTracking`, `newsletterCommunication`, `apiAccess`

### 6.5 Routing Issues

- ⚠️ App.jsx contains ALL route definitions in a single file (~800+ lines of routes) — should be split by domain
- ⚠️ One commented-out route: `{/* <Route path="/" element={<LandingPage />} /> */}`

---

## 7. Component Architecture

### 7.1 Page Component Pattern (Good)

Most complex pages follow a consistent internal structure:

```
pages/teachers/TeachersPage/
├── TeachersPage.jsx          # Main component (rendering only)
├── TeachersPage.css           # Scoped styles
├── index.js                   # Barrel export
├── constants.js               # Page-specific constants
├── hooks/
│   └── useTeachersPageState.js  # Data & state logic
├── utils/
│   └── teacherPresentation.js   # Formatting & display helpers
└── components/
    ├── TeachersTable.jsx
    ├── TeachersHeader.jsx
    ├── TeachersFilters.jsx
    └── TeachersFormModal.jsx
```

This pattern keeps pages modular and testable.

### 7.2 Shared Component Library (Weak)

**Current shared components:**

| Directory | Components | Purpose |
|-----------|------------|---------|
| `components/ui/` | button, InlineSpinner, PageLoader, ProgressBar, SkeletonCard | Primitives |
| `components/shared/` | EmptyState, ErrorBanner, ImageUploader, LoadingSpinner | Cross-cutting |
| `components/common/` | TablePagination | Data display |

**Missing shared components that would reduce duplication:**
- Form field wrappers (label + input + error + helper text)
- Confirmation dialog
- Data table with sorting/filtering
- Modal shell (compound component: Header + Body + Footer)
- Search/filter bar
- Status badge/chip
- Date range picker

### 7.3 God Components

**`Sidebar.jsx` (~300+ lines):**
- Computes permissions, fetches message counts, fetches substitution counts
- Contains multiple `useEffect` hooks for data fetching side effects
- Has long inline JSX with many conditional renders
- Needs decomposition into `SidebarHeader`, `SidebarNav`, `useSidebarPermissions`, `useSidebarNotifications`

**`LessonPlanFormModal.jsx` (~120+ lines):**
- Accepts 11 props
- Contains internal state for PDF extraction and progress
- Should use `useReducer` for complex form state

### 7.4 Prop Drilling in Modals

Several modal components accept 10-15+ props:
- `CalendarEventFormDialog` — 15+ props
- `LessonPlanFormModal` — 11 props
- These should adopt `useReducer` + context pattern or compound component approach

### 7.5 Top-Level Component Quality

| Component | Rating | Notes |
|-----------|--------|-------|
| `FeatureGate.jsx` | ✅ Excellent | Clean, ~25 lines, Redux-driven |
| `SubscriptionExpiredBanner.jsx` | ✅ Good | Dismissible, role-aware |
| `SubscriptionExpiredWall.jsx` | ✅ Good | Full-page blocking |
| `UpgradePrompt.jsx` | ✅ Good | Two render modes |

---

## 8. Custom Hooks Patterns

### 8.1 Hook Inventory

**68+ custom hooks** found across the codebase, primarily in `pages/*/hooks/` directories.

**Pattern:** Each complex page has a dedicated state hook that:
1. Uses `useDispatch` and `useSelector` for Redux communication
2. Manages local loading/error states
3. Dispatches async thunks for data fetching
4. Returns a clean API for the page component

**Example:**
```javascript
// useSchoolAdminDashboardData.js
export function useSchoolAdminDashboardData() {
  const dispatch = useDispatch();
  const user = useSelector(selectUser);
  const stats = useSelector(selectDashboardStats);
  useEffect(() => {
    dispatch(fetchClasses());
    dispatch(fetchStudents());
  }, []);
  return { user, stats, loading, error, retry };
}
```

### 8.2 Hook Patterns — Good
- ✅ Clean separation of data logic from rendering
- ✅ Hooks use Redux selectors, never access `state.` directly
- ✅ `use` prefix naming convention followed consistently

### 8.3 Hook Patterns — Could Improve
- ⚠️ No base `usePaginatedData()` hook — pagination logic repeated across hooks
- ⚠️ No base `useFormState()` hook — form state management varies per modal
- ⚠️ Some hooks contain business logic (validation, transformation) that could live in utils
- ⚠️ No shared `useDebounce()`, `useThrottle()`, `useLocalStorage()` hooks

---

## 9. Internationalization (i18n)

### 9.1 Setup

- **Languages supported:** English (en), Arabic (ar)
- **Framework:** i18next with react-i18next
- **Loading:** Lazy via `import.meta.glob()` (Vite dynamic imports)
- **RTL:** Supported via `stylis-plugin-rtl` + separate Emotion cache
- **Detection:** `i18next-browser-languagedetector`

### 9.2 Namespace Architecture

Each feature has its own i18n namespace:
- `auth`, `dashboard`, `teachers`, `students`, `grades`, `attendance`, `behavior`, `calendar`, `schedule`, `substitutions`, `messages`, `emailComposer`, `reports`, `interventions`, `standards`, `lessonPlan`, `reading`, `revision`, `curriculum`, `sbr`, `superAdmin`, `superAdminSettings`, etc.

Lazy-loaded via `useFeatureNamespaces.js`.

### 9.3 i18n Issues
- ⚠️ `normalizeLanguage()` silently falls back to 'en' for unsupported languages — no logging
- ⚠️ Some hardcoded English strings remain in `config/landingPageDefaults.js` (not i18n-aware)
- ⚠️ Namespace load failure vs language fallback are not distinguished

---

## 10. Styling Strategy

### 10.1 Current Approach

The app uses a **mixed styling strategy** with no single convention:

| Approach | Usage |
|----------|-------|
| Global `.css` files | All page-level styles (`.css`, NOT `.module.css`) |
| MUI `sx` prop | Component-level inline styles |
| MUI Theme (`theme.js`) | Dark/light mode, RTL font switching, color palette |
| CSS Variables | `--spacing-md`, `--border-color`, `--bg-card`, etc. |
| BEM naming | `.upgrade-prompt__header`, `.nav-item--active` |
| `@emotion/styled` | **Installed but NOT actively used** |

### 10.2 Styling Issues

1. **No CSS Modules** — All CSS files are global scope. At 130+ pages, class name collisions are a real risk
2. **Unused dependency** — `@emotion/styled` is installed but components use global CSS + MUI sx
3. **No consolidated strategy** — Developers must guess whether to use `.css`, `sx`, or Emotion for new components
4. **RTL-aware** — Good use of logical properties (`inset-inline-*`), but not universally applied

---

## 11. Configuration & Constants

### 11.1 `config/api.js`
- Centralized axios instance with token refresh, academic year header, behavior session ID
- See Section 5.4 for detailed analysis

### 11.2 `config/landingPageDefaults.js` (~300 lines)
- Hardcoded English marketing content (not i18n-aware)
- Static pricing, school count placeholders
- Should be served from backend or use i18n

### 11.3 `constants/permissions.js` (~350 lines)
- Comprehensive permission definitions with descriptions
- No type safety — all string keys
- No validation against backend schema

### 11.4 `constants/aiLanguages.js`
- ✅ Good validation logic with Set-based language checking
- ✅ Handles bilingual cases

---

## 12. Dead Code & Debug Artifacts

### 12.1 Dead Code

| Item | Location | Issue |
|------|----------|-------|
| `AuthContext.jsx` | `src/contexts/AuthContext.jsx` | **Deprecated** — auth is fully Redux-based. Safe to delete |
| `ParentDashboardPage.jsx` | `src/pages/ParentDashboardPage.jsx` | Not imported in App.jsx |
| `SchoolLoginPage.jsx` | `src/pages/SchoolLoginPage.jsx` | Not imported, not routed |
| `StudentGradesPage.jsx` | `src/pages/StudentGradesPage.jsx` | Duplicate of `student/academics/StudentGradesPage/` |
| `StudentAttendancePage.jsx` | `src/pages/StudentAttendancePage.jsx` | Duplicate of `student/attendance/StudentAttendancePage/` |
| `ReadingMyAssignmentsPage.jsx` | `src/pages/ReadingMyAssignmentsPage.jsx` | Duplicate of `student/reading/` |
| `AdminBehaviorAnalyticsPage.jsx` | `src/pages/admin/AdminBehaviorAnalyticsPage.jsx` | Just re-exports superAdmin version |
| Commented route | `src/App.jsx` | `{/* <Route path="/" element={<LandingPage />} /> */}` |

### 12.2 Debug Console Artifacts (27 instances)

`console.error` calls left in production code across:
- `store/slices/studentSlice.js`
- `pages/gradebook/GradebookPage/hooks/useGradebookActions.js` (2 instances)
- `pages/superAdmin/SuperAdminUsersPage/SuperAdminUsersPage.jsx`
- `pages/superAdmin/SuperAdminDashboardPage/SuperAdminDashboardPage.jsx`
- `pages/superAdmin/SuperAdminSchoolDetailsPage/SuperAdminSchoolDetailsPage.jsx`
- `pages/behavior/BehaviorManagementPage/hooks/useBehaviorManagementData.js` (2 instances)
- `pages/teacher/academicExcellence/hooks/useTeacherAcademicExcellence.js`
- `pages/lessonPlan/LessonPlanPage/utils/lessonPlanPersistence.js` (2 console.warn)
- `pages/reports/ReportTemplates/hooks/useReportTemplates.js`
- `pages/reports/ReportHistory/hooks/useReportHistory.js`
- `pages/reports/ReportAnalytics/hooks/useReportAnalytics.js`
- `pages/docs/ApiDocsPage/hooks/useApiDocsData.js`
- `pages/students/StudentDetailPage/StudentDetailPage.jsx` (2 instances)
- `pages/students/StudentDetailPage/hooks/useStudentAcademicInsights.js`
- `pages/admin/schedule/AdminSchedulePage/AdminSchedulePage.jsx`
- `pages/admin/dashboard/hooks/useSchoolAdminDashboardData.js` (2 instances)
- `pages/standards/StandardAssignPage/hooks/useStandardAssignPageData.js` (2 instances)
- `components/reports/AIReportModal.jsx` (2 instances)
- `components/LessonPlanCriteria.jsx`

---

## 13. Incomplete & Coming-Soon Features

### 13.1 Features Flagged as "Coming Soon"

| Feature | Location | Current State |
|---------|----------|---------------|
| Performance Analytics | `dashboard.json`: `"comingSoon": "Performance analytics coming soon"` | Placeholder text in dashboard |
| Calendar View for Schedule | `schedule.json`: `"calendarComingSoon": "Calendar view coming soon..."` | Placeholder in schedule page |
| Billing/Stripe Integration | `superAdminSettings.json`: `"comingSoon": "Billing, Stripe integration..."` | Placeholder in super admin settings |

### 13.2 Features Behind Feature Flags (Partially Implemented)

| Feature | Flag | Current State |
|---------|------|---------------|
| Intervention Queue | `interventionTracking` | Page exists but shows disabled message when flag is off |
| Attendance Reminders | Config-driven | Exists with disabled/enabled states, hint text for disabled |
| AI Email Drafting | Admin config toggle | Can be disabled per school |

### 13.3 Parent Role — Minimal Implementation

The parent role has very limited functionality:
- Only `pages/parent/newsletters/` exists
- `ParentDashboardPage.jsx` exists at root but is **not routed** (orphaned dead code)
- No parent-specific gradebook view, attendance view, or communication tools

### 13.4 Missing Error Boundary

`main.jsx` has no `<ErrorBoundary>` component — any unhandled error in the React tree will crash the entire app with a white screen.

---

## 14. Testing Status

**No test files detected anywhere in the client codebase.**

- No `.test.js`, `.test.jsx`, `.spec.js`, or `.spec.jsx` files
- No `__tests__/` directories
- No testing library in `package.json` (no @testing-library/react, no jest, no vitest)
- No test configuration files

This is the single highest-risk gap in the codebase.

---

## 15. Modularization Plan

### Phase 1: Redux Slice Decomposition (Critical)

| Current Slice | Split Into | Rationale |
|---------------|-----------|-----------|
| `practiceSlice` (21 state props) | `practiceDataSlice` + `practiceSessionSlice` | Separate domain data from UI/session state |
| `standardSlice` (14 thunks, 23 selectors) | `standardsSlice` + `standardAssignmentsSlice` + `standardProgressSlice` + `sbGradebookSlice` | 4 distinct domains mixed into one |
| `studentSlice` (20 thunks) | `studentSlice` + `studentAuthSlice` + `studentPromotionSlice` | CRUD, auth, and promotion workflows are independent |
| `uiSlice` | `uiSlice` + `academicYearSlice` | Academic year is business logic, not UI |

### Phase 2: Service Layer Unification

1. **Standardize response extraction** — Create a single `extractResponseData(response)` utility used by all services
2. **Add base service error wrapper** — Catch and normalize errors at the service level
3. **Merge or separate api/ and services/** — Choose ONE pattern: either services with error handling, or keep api/ layer, not both
4. **Extract shared utilities:**
   - `downloadFile()` — blob download + Content-Disposition parsing
   - `buildFormData()` — multipart upload construction
   - `buildPaginationParams()` — pagination URL building

### Phase 3: Component Library Extraction

1. **Decompose Sidebar.jsx** into `SidebarHeader`, `SidebarNav`, `useSidebarPermissions`, `useSidebarNotifications`
2. **Create shared form components:**
   - `FormField` (label + input + error + helper text)
   - `FormSection` (group related fields)
   - `ConfirmDialog` (reusable confirmation modal)
   - `ModalShell` (compound component: Header + Body + Footer)
3. **Consolidate loading/error/empty patterns** into a `DataStateWrapper` component

### Phase 4: Route Splitting

1. **Split App.jsx routes** into domain-based route files:
   - `routes/adminRoutes.jsx`
   - `routes/teacherRoutes.jsx`
   - `routes/studentRoutes.jsx`
   - `routes/parentRoutes.jsx`
   - `routes/superAdminRoutes.jsx`
   - `routes/publicRoutes.jsx`
2. App.jsx imports and composes these route modules

### Phase 5: Shared Hook Library

Create reusable base hooks in `src/hooks/`:
- `usePaginatedData(fetchFn, params)` — generic paginated data fetching
- `useFormState(initialData, validationSchema)` — form state management with useReducer
- `useDebounce(value, delay)` — debounced values
- `useLocalStorage(key, initialValue)` — localStorage-synced state

---

## 16. Improvement Plan

### Priority 1 — High Impact / Low Risk

| # | Improvement | Impact | Effort |
|---|-------------|--------|--------|
| 1 | Remove dead code (orphaned pages, AuthContext, console.* calls) | Clean codebase, reduced confusion | Small |
| 2 | Add `<ErrorBoundary>` to `main.jsx` | Prevents app-wide white screen crashes | Small |
| 3 | Standardize service response extraction pattern | Eliminates bugs from inconsistent data access | Medium |
| 4 | Add structured logging utility to replace `console.error` | Better debugging in production | Small |

### Priority 2 — Scalability

| # | Improvement | Impact | Effort |
|---|-------------|--------|--------|
| 5 | Split oversized Redux slices (practice, standard, student) | Testability, maintainability | Medium |
| 6 | Adopt CSS Modules (rename `.css` → `.module.css`) | Prevents class name collisions | Medium |
| 7 | Split App.jsx route definitions into domain modules | Reduce file size, improve navigation | Medium |
| 8 | Create shared form component library | Reduce modal prop drilling | Medium |

### Priority 3 — Quality

| # | Improvement | Impact | Effort |
|---|-------------|--------|--------|
| 9 | Add Vitest + @testing-library/react for unit tests | Confidence in refactoring, regression prevention | Large |
| 10 | Consolidate api/ and services/ layers into one pattern | Remove architectural confusion | Medium |
| 11 | Remove or adopt @emotion/styled (currently installed, unused) | Smaller bundle, clear styling strategy | Small |
| 12 | Document styling convention decision (MUI sx vs CSS modules) | Consistent new development | Small |

### Priority 4 — Performance

| # | Improvement | Impact | Effort |
|---|-------------|--------|--------|
| 13 | Add `React.memo` to expensive components (Sidebar, charts, data tables) | Reduce unnecessary re-renders | Medium |
| 14 | Evaluate RTK Query adoption for API caching | Eliminate manual cache management | Large |
| 15 | Implement `createEntityAdapter` for collection-heavy slices | Normalized state, O(1) lookups | Medium |

---

## 17. New Features That Can Be Added

Based on the current architecture and domain, these features are natural extensions:

### 17.1 Platform & Infrastructure

| Feature | Description | Leverages |
|---------|-------------|-----------|
| **Global Error Boundary with Recovery** | Catch rendering errors, show recovery UI, log to backend | React ErrorBoundary, existing error patterns |
| **Offline Mode / Service Worker** | Cache critical data, queue mutations for sync | Existing service layer, Vite PWA plugin |
| **Real-time Notifications (WebSocket)** | Push notifications for messages, grades, attendance | Existing `messagesRealtimeService.js` pattern |
| **App-wide Search** | Global search bar across students, teachers, classes, standards | Existing directory data in Redux |
| **Audit Trail / Activity Log** | Track admin actions (grade changes, attendance edits) | Existing permission system |

### 17.2 Academic & Curriculum

| Feature | Description | Leverages |
|---------|-------------|-----------|
| **Parent Dashboard (Full)** | Grades view, attendance, communication, payments | Orphaned `ParentDashboardPage.jsx` as starting point |
| **Student Self-Assessment / Reflection** | Student journals tied to standards | Existing standards infrastructure |
| **Peer Assessment** | Students review each other's work | Existing assignment and grading system |
| **Curriculum Progress Heatmap** | Visual map of standard mastery across classes | Existing standards + grades data |
| **AI Study Plan Generator** | Auto-generate revision plans from weak areas | Existing revision system + AI integration |
| **Assignment Plagiarism Detection** | Compare student submissions | Existing assignment service |

### 17.3 Communication & Community

| Feature | Description | Leverages |
|---------|-------------|-----------|
| **In-App Chat** | Real-time teacher-parent, teacher-student messaging | Existing `messagesRealtimeService` WebSocket |
| **Event RSVP System** | Parents confirm attendance at school events | Existing calendar system |
| **Digital Permission Slips** | Parents approve trips/activities digitally | Existing notification + parent role |
| **School-Wide Announcements Board** | Push + persistent announcements | Existing newsletter system |

### 17.4 Analytics & Reporting

| Feature | Description | Leverages |
|---------|-------------|-----------|
| **Teacher Performance Dashboard** | Lesson plan completion, grade submission rates | Existing lesson/grade slices |
| **Comparative Analytics** | Class A vs Class B performance | Existing grade + standard data |
| **Predictive At-Risk Detection** | ML-based early warning for struggling students | Existing behavior + grade + attendance data |
| **Custom Report Builder** | Drag-and-drop report creation | Existing report templates/history system |
| **Export to PDF / Print** | Print-ready report cards, progress reports | Existing SBR + grade data |

### 17.5 Administration

| Feature | Description | Leverages |
|---------|-------------|-----------|
| **Bulk Operations** | Bulk student enrollment, grade entry, attendance marking | Existing import templates |
| **Role-Based Dashboard Widgets** | Customizable dashboard per user role | Existing role system + dashboard slice |
| **Academic Calendar Integration** | Sync with Google Calendar, Outlook | Existing calendar system |
| **Multi-School Management** | Super admin manages multiple schools from one view | Existing super admin infrastructure |
| **Billing & Subscription Management** | Stripe integration (already flagged as "coming soon") | Existing subscription slice |

---

## 18. Incomplete Features to Complete

### 18.1 Must Complete

| Feature | Current State | What's Needed |
|---------|---------------|---------------|
| **Parent Dashboard** | Orphaned `ParentDashboardPage.jsx` exists, not routed; parent role only has newsletter access | Route it, build parent-specific views (grades, attendance, communication) |
| **Performance Analytics** | Dashboard shows "coming soon" placeholder | Build analytics components, connect to existing grade/attendance data |
| **Schedule Calendar View** | Shows "Calendar view coming soon..." in schedule page | Implement calendar rendering for teacher/admin schedules |
| **Billing / Stripe Integration** | Super admin settings shows "coming soon" | Complete Stripe integration, subscription management UI |

### 18.2 Should Complete

| Feature | Current State | What's Needed |
|---------|---------------|---------------|
| **Intervention Queue** | Page exists but feature-flagged; shows disabled message | Complete intervention workflow, assignment, tracking |
| **Error Boundary** | `main.jsx` has no error boundary | Add `<ErrorBoundary>` with recovery UI and error reporting |
| **API Docs Page** | `ApiDocsPage` route and hook exist | Verify it's fully functional, add interactive API testing |
| **Landing Page** | Route commented out in App.jsx, `landingPageDefaults.js` exists with 300+ lines of content | Decide: serve from app or separate site. Clean up if not used |

### 18.3 Clean Up

| Item | Action |
|------|--------|
| Delete `src/contexts/AuthContext.jsx` and `contexts/` directory | Dead code — auth is Redux-based |
| Delete orphaned root-level page files (5 files) | Dead code duplicates |
| Delete `AdminBehaviorAnalyticsPage.jsx` redirect | Unnecessary indirection |
| Remove 27 `console.error`/`console.warn` calls | Replace with structured logging or remove |
| Remove or adopt `@emotion/styled` dependency | Currently installed but unused |

---

## 19. Miscellaneous Findings

### 19.1 Security Observations
- ✅ HTML sanitization via `dompurify` / `isomorphic-dompurify`
- ✅ Token stored in localStorage (standard SPA pattern)
- ✅ Token refresh mechanism with subscription pattern
- ⚠️ Academic year header (`x-academic-year`) read from localStorage without validation

### 19.2 Bundle Size Considerations
- `@emotion/styled` imported but unused — adds to bundle
- All 130+ pages are lazy-loaded — good for initial load
- `recharts` is a large dependency (~500KB) — consider lazy-loading chart components

### 19.3 Developer Experience
- ✅ Vite for fast HMR
- ✅ ESLint configured
- ⚠️ No Prettier configuration detected
- ⚠️ No Storybook for component documentation
- ⚠️ No TypeScript — all JavaScript with `jsconfig.json`

### 19.4 Naming Conventions (Consistent)

| Type | Convention | Example |
|------|-----------|---------|
| Pages | PascalCase | `TeachersPage.jsx` |
| Components | PascalCase | `TeachersTable.jsx` |
| Hooks | camelCase with `use` prefix | `useTeachersPageState.js` |
| Utils | camelCase | `teacherPresentation.js` |
| Constants | camelCase file, SCREAMING_SNAKE values | `permissions.js` → `MANAGE_TEACHERS` |
| CSS | `ComponentName.css` | `TeachersPage.css` |
| Services | camelCase with `Service` suffix | `teacherService.js` |
| Slices | camelCase with `Slice` suffix | `teacherSlice.js` |

---

*End of Review*
