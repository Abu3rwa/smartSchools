const DEFAULT_REASON_CODES = [
    'ACADEMIC_PROGRESS',
    'ATTENDANCE_CONCERN',
    'BEHAVIOR_CONCERN',
    'CLEARANCE_PENDING',
    'PARENT_REQUEST',
    'ADMIN_OVERRIDE',
    'TRANSFER_IN',
    'TRANSFER_OUT'
];

const DEFAULT_SETTINGS = {
    enabled: true,
    promotionPolicy: {
        minimumAcademicThreshold: 50,
        attendanceMinimumPercent: 75,
        requiredClearanceChecks: {
            fees: false,
            library: false,
            devices: false
        },
        autoEligibilityTagsEnabled: false
    },
    approvalWorkflow: {
        enabled: true,
        depth: 1,
        roles: ['class_teacher', 'principal']
    },
    sectionAssignmentStrategy: 'manual',
    calendar: {
        newAdmissionsLockWindow: {
            startDate: null,
            endDate: null
        },
        returningAdmissionsLockWindow: {
            startDate: null,
            endDate: null
        }
    },
    permissions: {
        allowAdmissionsOfficerPlacementOverride: true,
        allowFinanceGate: false
    },
    reasonCodes: DEFAULT_REASON_CODES
};

const STRATEGIES = new Set(['manual', 'capacity_based', 'ai_assisted']);

const toNumberInRange = (value, fallback, min, max) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    if (parsed < min) return min;
    if (parsed > max) return max;
    return parsed;
};

const toBoolean = (value, fallback) => {
    if (typeof value === 'boolean') return value;
    return fallback;
};

const normalizeDateOrNull = (value) => {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const normalizeLockWindow = (window = {}) => {
    const startDate = normalizeDateOrNull(window.startDate);
    const endDate = normalizeDateOrNull(window.endDate);

    if (startDate && endDate && startDate > endDate) {
        return { startDate: null, endDate: null };
    }

    return { startDate, endDate };
};

const normalizeReasonCodes = (value) => {
    if (!Array.isArray(value)) return [...DEFAULT_REASON_CODES];
    const unique = Array.from(new Set(
        value
            .map((item) => String(item || '').trim().toUpperCase())
            .filter(Boolean)
    ));
    return unique.length > 0 ? unique : [...DEFAULT_REASON_CODES];
};

export const createDefaultAdmissionsPromotionSettings = () => ({
    ...DEFAULT_SETTINGS,
    promotionPolicy: {
        ...DEFAULT_SETTINGS.promotionPolicy,
        requiredClearanceChecks: {
            ...DEFAULT_SETTINGS.promotionPolicy.requiredClearanceChecks
        }
    },
    approvalWorkflow: {
        ...DEFAULT_SETTINGS.approvalWorkflow,
        roles: [...DEFAULT_SETTINGS.approvalWorkflow.roles]
    },
    calendar: {
        newAdmissionsLockWindow: {
            ...DEFAULT_SETTINGS.calendar.newAdmissionsLockWindow
        },
        returningAdmissionsLockWindow: {
            ...DEFAULT_SETTINGS.calendar.returningAdmissionsLockWindow
        }
    },
    permissions: {
        ...DEFAULT_SETTINGS.permissions
    },
    reasonCodes: [...DEFAULT_SETTINGS.reasonCodes]
});

export const normalizeAdmissionsPromotionSettings = (settings = {}) => {
    const defaults = createDefaultAdmissionsPromotionSettings();
    const workflowRoles = Array.isArray(settings?.approvalWorkflow?.roles)
        ? settings.approvalWorkflow.roles
            .map((role) => String(role || '').trim().toLowerCase())
            .filter(Boolean)
        : defaults.approvalWorkflow.roles;

    return {
        enabled: toBoolean(settings.enabled, defaults.enabled),
        promotionPolicy: {
            minimumAcademicThreshold: toNumberInRange(
                settings?.promotionPolicy?.minimumAcademicThreshold,
                defaults.promotionPolicy.minimumAcademicThreshold,
                0,
                100
            ),
            attendanceMinimumPercent: toNumberInRange(
                settings?.promotionPolicy?.attendanceMinimumPercent,
                defaults.promotionPolicy.attendanceMinimumPercent,
                0,
                100
            ),
            requiredClearanceChecks: {
                fees: toBoolean(
                    settings?.promotionPolicy?.requiredClearanceChecks?.fees,
                    defaults.promotionPolicy.requiredClearanceChecks.fees
                ),
                library: toBoolean(
                    settings?.promotionPolicy?.requiredClearanceChecks?.library,
                    defaults.promotionPolicy.requiredClearanceChecks.library
                ),
                devices: toBoolean(
                    settings?.promotionPolicy?.requiredClearanceChecks?.devices,
                    defaults.promotionPolicy.requiredClearanceChecks.devices
                )
            },
            autoEligibilityTagsEnabled: toBoolean(
                settings?.promotionPolicy?.autoEligibilityTagsEnabled,
                defaults.promotionPolicy.autoEligibilityTagsEnabled
            )
        },
        approvalWorkflow: {
            enabled: toBoolean(settings?.approvalWorkflow?.enabled, defaults.approvalWorkflow.enabled),
            depth: toNumberInRange(settings?.approvalWorkflow?.depth, defaults.approvalWorkflow.depth, 1, 5),
            roles: workflowRoles.length > 0 ? workflowRoles : defaults.approvalWorkflow.roles
        },
        sectionAssignmentStrategy: STRATEGIES.has(settings?.sectionAssignmentStrategy)
            ? settings.sectionAssignmentStrategy
            : defaults.sectionAssignmentStrategy,
        calendar: {
            newAdmissionsLockWindow: normalizeLockWindow(settings?.calendar?.newAdmissionsLockWindow),
            returningAdmissionsLockWindow: normalizeLockWindow(settings?.calendar?.returningAdmissionsLockWindow)
        },
        permissions: {
            allowAdmissionsOfficerPlacementOverride: toBoolean(
                settings?.permissions?.allowAdmissionsOfficerPlacementOverride,
                defaults.permissions.allowAdmissionsOfficerPlacementOverride
            ),
            allowFinanceGate: toBoolean(
                settings?.permissions?.allowFinanceGate,
                defaults.permissions.allowFinanceGate
            )
        },
        reasonCodes: normalizeReasonCodes(settings?.reasonCodes)
    };
};

export const validateAdmissionsPromotionSettingsPayload = (payload) => {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return { valid: false, message: 'Payload must be an object' };
    }

    const tryWindow = (window, label) => {
        if (!window || typeof window !== 'object' || Array.isArray(window)) return null;
        const start = window.startDate ? new Date(window.startDate) : null;
        const end = window.endDate ? new Date(window.endDate) : null;
        if (start && Number.isNaN(start.getTime())) return `${label}.startDate is invalid`;
        if (end && Number.isNaN(end.getTime())) return `${label}.endDate is invalid`;
        if (start && end && start > end) return `${label}.startDate must be before or equal to endDate`;
        return null;
    };

    const windowErrorA = tryWindow(payload?.calendar?.newAdmissionsLockWindow, 'calendar.newAdmissionsLockWindow');
    if (windowErrorA) return { valid: false, message: windowErrorA };

    const windowErrorB = tryWindow(payload?.calendar?.returningAdmissionsLockWindow, 'calendar.returningAdmissionsLockWindow');
    if (windowErrorB) return { valid: false, message: windowErrorB };

    if (payload?.sectionAssignmentStrategy && !STRATEGIES.has(payload.sectionAssignmentStrategy)) {
        return { valid: false, message: 'sectionAssignmentStrategy must be manual, capacity_based, or ai_assisted' };
    }

    return { valid: true };
};
