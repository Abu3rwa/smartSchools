import { hasPermission } from '../../config/permissions.js';
import { PERMISSIONS } from '../../config/permissions.js';

const hasAny = (user, permissions = []) => permissions.some((permission) => hasPermission(user, permission));

export const canManageCurriculumMap = (user) => (
    ['admin', 'department_principal'].includes(user?.role)
    || hasAny(user, [
        PERMISSIONS.EDIT_CURRICULUM_MAPS,
        PERMISSIONS.REVIEW_CURRICULUM_MAPS,
        PERMISSIONS.PUBLISH_CURRICULUM_MAPS,
        PERMISSIONS.EDIT_ANY_CURRICULUM_MAP,
        PERMISSIONS.CONFIGURE_CURRICULUM_MAP_TEMPLATES
    ])
);

export const canCreateCurriculumMap = (user) => (
    ['admin', 'department_principal', 'teacher'].includes(user?.role)
    || hasAny(user, [PERMISSIONS.CREATE_CURRICULUM_MAP, PERMISSIONS.EDIT_CURRICULUM_MAPS])
);

export const canEditCurriculumMap = (user) => (
    ['admin', 'department_principal', 'teacher'].includes(user?.role)
    || hasAny(user, [PERMISSIONS.EDIT_CURRICULUM_MAPS, PERMISSIONS.EDIT_OWN_CURRICULUM_MAP, PERMISSIONS.EDIT_ANY_CURRICULUM_MAP])
);

export const canEditAnyCurriculumMap = (user) => (
    ['admin', 'department_principal'].includes(user?.role)
    || hasAny(user, [PERMISSIONS.EDIT_ANY_CURRICULUM_MAP, PERMISSIONS.EDIT_CURRICULUM_MAPS])
);

export const canReviewCurriculumMap = (user) => (
    ['admin', 'department_principal'].includes(user?.role)
    || hasAny(user, [
        PERMISSIONS.REVIEW_CURRICULUM_MAPS,
        PERMISSIONS.REVIEW_CURRICULUM_MAP,
        PERMISSIONS.APPROVE_CURRICULUM_MAP,
        PERMISSIONS.REJECT_CURRICULUM_MAP
    ])
);

export const canApproveCurriculumMap = (user) => (
    ['admin', 'department_principal'].includes(user?.role)
    || hasAny(user, [PERMISSIONS.APPROVE_CURRICULUM_MAP, PERMISSIONS.REVIEW_CURRICULUM_MAPS])
);

export const canRejectCurriculumMap = (user) => (
    ['admin', 'department_principal'].includes(user?.role)
    || hasAny(user, [PERMISSIONS.REJECT_CURRICULUM_MAP, PERMISSIONS.REVIEW_CURRICULUM_MAPS])
);

export const canPublishCurriculumMap = (user) => (
    ['admin', 'department_principal'].includes(user?.role)
    || hasAny(user, [PERMISSIONS.PUBLISH_CURRICULUM_MAPS])
);

export const canExportCurriculumMap = (user) => (
    canViewCurriculumMap(user)
    || hasAny(user, [PERMISSIONS.EXPORT_CURRICULUM_MAP])
);

export const canPrintCurriculumMap = (user) => (
    canViewCurriculumMap(user)
    || hasAny(user, [PERMISSIONS.PRINT_CURRICULUM_MAP])
);

export const canConfigureCurriculumTemplates = (user) => (
    ['admin', 'department_principal'].includes(user?.role)
    || hasAny(user, [PERMISSIONS.CONFIGURE_CURRICULUM_MAP_TEMPLATES, PERMISSIONS.MANAGE_SCHOOL_SETTINGS])
);

export const canViewCurriculumMap = (user) => (
    ['admin', 'department_principal', 'teacher'].includes(user?.role)
    || hasAny(user, [
        PERMISSIONS.VIEW_CURRICULUM_MAPS,
        PERMISSIONS.EDIT_CURRICULUM_MAPS,
        PERMISSIONS.REVIEW_CURRICULUM_MAPS,
        PERMISSIONS.PUBLISH_CURRICULUM_MAPS,
        PERMISSIONS.EXPORT_CURRICULUM_MAP,
        PERMISSIONS.PRINT_CURRICULUM_MAP
    ])
);
