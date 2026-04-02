const PLAN_SEQUENCE = ['starter', 'professional', 'enterprise'];

const PLAN_ALIASES = {
    starter: 'starter',
    growth: 'professional',
    professional: 'professional',
    enterprise: 'enterprise'
};

const SCHOOL_PLAN_ALIASES = {
    starter: 'starter',
    professional: 'growth',
    enterprise: 'enterprise'
};

export const FEATURES = {
    parentPortal: {
        key: 'parentPortal',
        label: 'Parent Portal',
        description: 'Allow parents to access student progress and messaging.',
        plans: ['professional', 'enterprise']
    },
    advancedAnalytics: {
        key: 'advancedAnalytics',
        label: 'Advanced Analytics',
        description: 'Access expanded reporting analytics and trend views.',
        plans: ['professional', 'enterprise']
    },
    customReports: {
        key: 'customReports',
        label: 'Custom Reports',
        description: 'Create and run advanced custom report workflows.',
        plans: ['professional', 'enterprise']
    },
    emailNotifications: {
        key: 'emailNotifications',
        label: 'Email Notifications',
        description: 'Send notification and update emails to users.',
        plans: ['starter', 'professional', 'enterprise']
    },
    apiAccess: {
        key: 'apiAccess',
        label: 'API Access',
        description: 'Use API endpoints and API documentation tools.',
        plans: ['professional', 'enterprise']
    },
    prioritySupport: {
        key: 'prioritySupport',
        label: 'Priority Support',
        description: 'Receive priority support response times.',
        plans: ['professional', 'enterprise']
    },
    customBranding: {
        key: 'customBranding',
        label: 'Custom Branding',
        description: 'Apply enterprise branding customization.',
        plans: ['enterprise']
    },
    dataExport: {
        key: 'dataExport',
        label: 'Data Export',
        description: 'Export data for reporting and archival workflows.',
        plans: ['professional', 'enterprise']
    },
    aiEmailDrafts: {
        key: 'aiEmailDrafts',
        label: 'AI Email Drafts',
        description: 'Generate AI-assisted email body drafts in the communication composer.',
        plans: ['professional', 'enterprise']
    },
    academicIntelligence: {
        key: 'academicIntelligence',
        label: 'Academic Intelligence',
        description: 'Enable AI-powered academic insights, learning traces, and intelligence-driven reports.',
        plans: ['professional', 'enterprise']
    },
    standardsPractice: {
        key: 'standardsPractice',
        label: 'Standards Practice',
        description: 'Enable standards-based practice sessions, mastery tracking, and standards gradebook views.',
        plans: ['professional', 'enterprise']
    },
    interventionTracking: {
        key: 'interventionTracking',
        label: 'Intervention Tracking',
        description: 'Track intervention plans, progress, and follow-up actions for students.',
        plans: ['professional', 'enterprise']
    },
    aiLessonPlanEvaluation: {
        key: 'aiLessonPlanEvaluation',
        label: 'AI Lesson Plan Evaluation',
        description: 'Use AI scoring and feedback workflows for lesson plan review and approvals.',
        plans: ['professional', 'enterprise']
    },
    readingAssistant: {
        key: 'readingAssistant',
        label: 'Reading Assistant',
        description: 'Enable reading support tools including simplified passages and comprehension workflows.',
        plans: ['professional', 'enterprise']
    },
    revisionPlanning: {
        key: 'revisionPlanning',
        label: 'Revision Planning',
        description: 'Generate and manage revision plans tied to performance and standards gaps.',
        plans: ['professional', 'enterprise']
    },
    newsletterCommunication: {
        key: 'newsletterCommunication',
        label: 'Newsletter Communication',
        description: 'Enable school newsletter creation and distribution workflows.',
        plans: ['professional', 'enterprise']
    },
    presentationBuilder: {
        key: 'presentationBuilder',
        label: 'AI Presentation Builder',
        description: 'Generate AI-powered classroom presentations from lesson plans and uploaded materials.',
        plans: ['professional', 'enterprise']
    },
    gradebookSpreadsheet: {
        key: 'gradebookSpreadsheet',
        label: 'Gradebook Spreadsheet View',
        description: 'Column-based spreadsheet gradebook with inline editing and formula support.',
        plans: ['starter', 'professional', 'enterprise']
    },
    gradebookFormulas: {
        key: 'gradebookFormulas',
        label: 'Gradebook Formulas',
        description: 'Weighted grade formulas for auto-calculating midterm, semester, and final grades.',
        plans: ['professional', 'enterprise']
    },
    gradebookTemplates: {
        key: 'gradebookTemplates',
        label: 'Gradebook Templates',
        description: 'Save and reuse gradebook column structures across subjects and semesters.',
        plans: ['professional', 'enterprise']
    },
    traditionalReportCards: {
        key: 'traditionalReportCards',
        label: 'Traditional Report Cards',
        description: 'Generate traditional percentage/letter-grade report cards with configurable templates.',
        plans: ['professional', 'enterprise']
    },
    gradeImportExport: {
        key: 'gradeImportExport',
        label: 'Grade Import/Export',
        description: 'Import grades from CSV and export gradebook to Excel.',
        plans: ['professional', 'enterprise']
    },
    gradeAnalytics: {
        key: 'gradeAnalytics',
        label: 'Grade Analytics',
        description: 'Visual analytics for student, class, and school-level grade insights.',
        plans: ['professional', 'enterprise']
    },
    parentGradebook: {
        key: 'parentGradebook',
        label: 'Parent Gradebook Portal',
        description: 'Read-only gradebook and progress dashboard for parents.',
        plans: ['starter', 'professional', 'enterprise']
    }
};

export const FEATURE_KEYS = Object.keys(FEATURES);

const buildFeaturesForPlan = (plan = 'starter') => {
    return FEATURE_KEYS.reduce((acc, featureKey) => {
        const feature = FEATURES[featureKey];
        acc[featureKey] = feature.plans.includes(plan);
        return acc;
    }, {});
};

export const DEFAULT_PLAN_CONFIGS = {
    starter: {
        key: 'starter',
        name: 'Starter',
        description: 'Essential tools for getting started.',
        billing: {
            amount: 29,
            currency: 'USD',
            interval: 'month'
        },
        limits: {
            maxStudents: 50,
            maxTeachers: 10,
            maxClasses: 20,
            maxStorage: 1000
        },
        features: buildFeaturesForPlan('starter')
    },
    professional: {
        key: 'professional',
        name: 'Professional',
        description: 'Advanced capabilities for growing schools.',
        billing: {
            amount: 79,
            currency: 'USD',
            interval: 'month'
        },
        limits: {
            maxStudents: 500,
            maxTeachers: 50,
            maxClasses: 100,
            maxStorage: 5000
        },
        features: buildFeaturesForPlan('professional')
    },
    enterprise: {
        key: 'enterprise',
        name: 'Enterprise',
        description: 'Full platform access for large organizations.',
        billing: {
            amount: 199,
            currency: 'USD',
            interval: 'month'
        },
        limits: {
            maxStudents: -1,
            maxTeachers: -1,
            maxClasses: -1,
            maxStorage: -1
        },
        features: buildFeaturesForPlan('enterprise')
    }
};

export const PLANS = Object.values(DEFAULT_PLAN_CONFIGS).reduce((acc, plan) => {
    acc[plan.key] = { key: plan.key, name: plan.name };
    return acc;
}, {});

export const isRecognizedPlan = (plan) => typeof plan === 'string' && plan.trim().length > 0;

export const normalizePlan = (plan = 'starter') => {
    const normalized = String(plan || 'starter').trim().toLowerCase();
    return PLAN_ALIASES[normalized] || normalized || 'starter';
};

export const toSchoolPlan = (plan = 'starter') => {
    const normalizedPlan = normalizePlan(plan);
    return SCHOOL_PLAN_ALIASES[normalizedPlan] || normalizedPlan || 'starter';
};

export const getPlanName = (plan = 'starter') => {
    const normalizedPlan = normalizePlan(plan);
    if (PLANS[normalizedPlan]?.name) return PLANS[normalizedPlan].name;
    return normalizedPlan.replace(/[_-]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
};

export const getFeaturesForPlan = (plan = 'starter') => {
    const normalizedPlan = normalizePlan(plan);
    return buildFeaturesForPlan(normalizedPlan);
};

export const getDefaultPlanConfig = (plan = 'starter') => {
    const normalizedPlan = normalizePlan(plan);
    const config = DEFAULT_PLAN_CONFIGS[normalizedPlan];
    if (!config) return null;
    return {
        ...config,
        limits: { ...config.limits },
        features: { ...config.features },
        billing: { ...config.billing }
    };
};

export const coerceFeatureFlags = (source = {}) => {
    const plainSource = typeof source?.toObject === 'function' ? source.toObject() : source;

    return FEATURE_KEYS.reduce((acc, featureKey) => {
        if (typeof plainSource?.[featureKey] === 'boolean') {
            acc[featureKey] = plainSource[featureKey];
        }
        return acc;
    }, {});
};

export const getFeatureDefinition = (featureKey) => FEATURES[featureKey] || null;

export const getRequiredPlanForFeature = (featureKey) => {
    const feature = getFeatureDefinition(featureKey);
    if (!feature) return null;

    const minimumPlan = PLAN_SEQUENCE.find((plan) => feature.plans.includes(plan));
    return minimumPlan || null;
};
