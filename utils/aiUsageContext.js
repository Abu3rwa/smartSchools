import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Request-scoped identity for metered AI. `protect` opens this alongside the
 * tenant context, so any AI call made while handling a request knows who ran it
 * and which feature paid for it without every caller passing those details.
 */
const store = new AsyncLocalStorage();

// Longest paths first: `/api/standards` must not swallow `/api/standard-assessment`.
const FEATURES = [
    ['/api/academic-excellence', 'academic_excellence'],
    ['/api/communication-email', 'communication_email'],
    ['/api/standard-assessment', 'standards_practice'],
    ['/api/student-grouping', 'student_grouping'],
    ['/api/map-test-prep', 'map_test_prep'],
    ['/api/social-studies', 'social_studies'],
    ['/api/worksheets', 'worksheet_checker'],
    ['/api/newsletters', 'newsletter'],
    ['/api/writing', 'writing_assistant'],
    ['/api/reading', 'reading_assistant'],
    ['/api/standards', 'standards_practice'],
    ['/api/analytics', 'class_analytics'],
    ['/api/lessons', 'lesson_plans'],
    ['/api/reports', 'advanced_reporting']
];

/** Human-readable feature label for a request path, e.g. `/api/reading/x` → `reading_assistant`. */
export const featureFromPath = (path = '') => {
    const clean = String(path).split('?')[0];
    const known = FEATURES.find(([prefix]) => clean === prefix || clean.startsWith(`${prefix}/`));
    if (known) return known[1];
    const segment = clean.match(/^\/api\/([a-z0-9-]+)/i)?.[1];
    return segment ? segment.replace(/-/g, '_') : 'general';
};

export const getAiUsageContext = () => store.getStore() || null;

export const runInAiUsageContext = (context, next) => store.run(context, next);
