/**
 * Permission constants for frontend
 */

export const PERMISSIONS = {
    // Attendance
    MANAGE_ATTENDANCE_REMINDERS: 'manage_attendance_reminders',
    VIEW_ATTENDANCE_REPORTS: 'view_attendance_reports',

    // School Settings
    MANAGE_SCHOOL_SETTINGS: 'manage_school_settings',
    
    // Lesson Plans
    REVIEW_LESSON_PLANS: 'review_lesson_plans',
    EDIT_LESSON_PLANS: 'edit_lesson_plans',
    
    // Substitutions
    MANAGE_SUBSTITUTIONS: 'manage_substitutions',
    
    // Events
    MANAGE_EVENTS: 'manage_events',
    
    // Reports
    VIEW_ALL_REPORTS: 'view_all_reports',
    EDIT_REPORTS: 'edit_reports',
    
    // Behavior
    MANAGE_BEHAVIOR: 'manage_behavior',
    VIEW_BEHAVIOR: 'view_behavior',
    
    // Transportation
    MANAGE_TRANSPORTATION: 'manage_transportation',
    VIEW_TRANSPORTATION: 'view_transportation',
    
    // Cafeteria
    MANAGE_CAFETERIA: 'manage_cafeteria',
    VIEW_CAFETERIA: 'view_cafeteria',
    
    // Library
    MANAGE_LIBRARY: 'manage_library',
    VIEW_LIBRARY: 'view_library',
    
    // IT Support
    PROVIDE_IT_SUPPORT: 'provide_it_support',
    
    // Counseling
    ACCESS_COUNSELING_RECORDS: 'access_counseling_records',
    EDIT_COUNSELING_RECORDS: 'edit_counseling_records',
    
    // Health
    ACCESS_HEALTH_RECORDS: 'access_health_records',
    EDIT_HEALTH_RECORDS: 'edit_health_records',
    
    // Users & Admin
    MANAGE_USERS: 'manage_users',
    MANAGE_DEPARTMENTS: 'manage_departments',
    
    // Grades
    VIEW_GRADES: 'view_grades',
    EDIT_GRADES: 'edit_grades',
    
    // Notifications
    SEND_NOTIFICATIONS: 'send_notifications'
};

export const PERMISSION_DEFINITIONS = {
    [PERMISSIONS.MANAGE_ATTENDANCE_REMINDERS]: {
        label: 'Manage Attendance Reminders',
        description: 'Create, edit, and send attendance reminders',
        category: 'attendance'
    },
    [PERMISSIONS.VIEW_ATTENDANCE_REPORTS]: {
        label: 'View Attendance Reports',
        description: 'View attendance reports and statistics',
        category: 'attendance'
    },
    [PERMISSIONS.MANAGE_SCHOOL_SETTINGS]: {
        label: 'Manage School Settings',
        description: 'Configure school-wide settings including lesson plan criteria',
        category: 'admin'
    },
    [PERMISSIONS.REVIEW_LESSON_PLANS]: {
        label: 'Review Lesson Plans',
        description: 'View and review lesson plans from other teachers',
        category: 'academic'
    },
    [PERMISSIONS.EDIT_LESSON_PLANS]: {
        label: 'Edit Lesson Plans',
        description: 'Create and edit lesson plans',
        category: 'academic'
    },
    [PERMISSIONS.MANAGE_SUBSTITUTIONS]: {
        label: 'Manage Substitutions',
        description: 'Manage teacher absences and substitute assignments',
        category: 'operations'
    },
    [PERMISSIONS.MANAGE_EVENTS]: {
        label: 'Manage Events',
        description: 'Create and manage school events',
        category: 'operations'
    },
    [PERMISSIONS.VIEW_ALL_REPORTS]: {
        label: 'View All Reports',
        description: 'View all school reports and analytics',
        category: 'reports'
    },
    [PERMISSIONS.EDIT_REPORTS]: {
        label: 'Edit Reports',
        description: 'Create and edit reports',
        category: 'reports'
    },
    [PERMISSIONS.MANAGE_BEHAVIOR]: {
        label: 'Manage Behavior Records',
        description: 'Manage student behavior tracking and discipline',
        category: 'student_services'
    },
    [PERMISSIONS.VIEW_BEHAVIOR]: {
        label: 'View Behavior Records',
        description: 'View student behavior records',
        category: 'student_services'
    },
    [PERMISSIONS.MANAGE_TRANSPORTATION]: {
        label: 'Manage Transportation',
        description: 'Manage bus routes and transportation',
        category: 'operations'
    },
    [PERMISSIONS.VIEW_TRANSPORTATION]: {
        label: 'View Transportation',
        description: 'View transportation schedules',
        category: 'operations'
    },
    [PERMISSIONS.MANAGE_CAFETERIA]: {
        label: 'Manage Cafeteria',
        description: 'Manage meal planning and cafeteria operations',
        category: 'operations'
    },
    [PERMISSIONS.VIEW_CAFETERIA]: {
        label: 'View Cafeteria',
        description: 'View cafeteria information',
        category: 'operations'
    },
    [PERMISSIONS.MANAGE_LIBRARY]: {
        label: 'Manage Library',
        description: 'Manage library resources and checkouts',
        category: 'operations'
    },
    [PERMISSIONS.VIEW_LIBRARY]: {
        label: 'View Library',
        description: 'View library resources',
        category: 'operations'
    },
    [PERMISSIONS.PROVIDE_IT_SUPPORT]: {
        label: 'Provide IT Support',
        description: 'Access system for technical support',
        category: 'operations'
    },
    [PERMISSIONS.ACCESS_COUNSELING_RECORDS]: {
        label: 'Access Counseling Records',
        description: 'View student counseling records',
        category: 'student_services'
    },
    [PERMISSIONS.EDIT_COUNSELING_RECORDS]: {
        label: 'Edit Counseling Records',
        description: 'Create and edit counseling records',
        category: 'student_services'
    },
    [PERMISSIONS.ACCESS_HEALTH_RECORDS]: {
        label: 'Access Health Records',
        description: 'View student health records',
        category: 'student_services'
    },
    [PERMISSIONS.EDIT_HEALTH_RECORDS]: {
        label: 'Edit Health Records',
        description: 'Create and edit health records',
        category: 'student_services'
    },
    [PERMISSIONS.MANAGE_USERS]: {
        label: 'Manage Users',
        description: 'Manage user accounts and roles',
        category: 'admin'
    },
    [PERMISSIONS.MANAGE_DEPARTMENTS]: {
        label: 'Manage Departments',
        description: 'Create and manage departments',
        category: 'admin'
    },
    [PERMISSIONS.VIEW_GRADES]: {
        label: 'View Grades',
        description: 'View student grades',
        category: 'academic'
    },
    [PERMISSIONS.EDIT_GRADES]: {
        label: 'Edit Grades',
        description: 'Create and edit student grades',
        category: 'academic'
    },
    [PERMISSIONS.SEND_NOTIFICATIONS]: {
        label: 'Send Notifications',
        description: 'Send notifications to users',
        category: 'operations'
    }
};

export const PERMISSION_CATEGORIES = {
    attendance: { label: 'Attendance', order: 1 },
    academic: { label: 'Academic', order: 2 },
    operations: { label: 'Operations', order: 3 },
    reports: { label: 'Reports', order: 4 },
    student_services: { label: 'Student Services', order: 5 },
    admin: { label: 'Administration', order: 6 }
};

// Group permissions by category
export const getPermissionsByCategory = () => {
    const grouped = {};
    
    Object.entries(PERMISSION_DEFINITIONS).forEach(([key, def]) => {
        if (!grouped[def.category]) {
            grouped[def.category] = [];
        }
        grouped[def.category].push({ key, ...def });
    });
    
    return grouped;
};

export default {
    PERMISSIONS,
    PERMISSION_DEFINITIONS,
    PERMISSION_CATEGORIES,
    getPermissionsByCategory
};
