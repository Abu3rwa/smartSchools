/**
 * Permission constants and role-to-permission mappings
 */

// All available permissions
export const PERMISSIONS = {
    // Attendance
    MANAGE_ATTENDANCE_REMINDERS: 'manage_attendance_reminders',
    VIEW_ATTENDANCE_REPORTS: 'view_attendance_reports',
    
    // School Settings
    MANAGE_SCHOOL_SETTINGS: 'manage_school_settings',
    
    // Lesson Plans
    REVIEW_LESSON_PLANS: 'review_lesson_plans',
    EDIT_LESSON_PLANS: 'edit_lesson_plans',
    REVIEW_STANDARDS_QUESTIONS: 'review_standards_questions',
    
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
    MANAGE_GRADE_SCALING: 'manage_grade_scaling',
    MANAGE_ASSIGNMENT_CONFIG: 'manage_assignment_config',
    CREATE_ASSIGNMENTS: 'create_assignments',
    PUBLISH_ASSIGNMENTS: 'publish_assignments',
    GRADE_ASSIGNMENTS: 'grade_assignments',
    CREATE_HOMEWORK: 'create_homework',
    PUBLISH_HOMEWORK: 'publish_homework',
    GRADE_HOMEWORK: 'grade_homework',
    VIEW_HOMEWORK_SUBMISSIONS: 'view_homework_submissions',
    
    // Notifications
    SEND_NOTIFICATIONS: 'send_notifications',

    // Communication (email composer)
    SEND_COMMUNICATION_EMAILS: 'send_communication_emails',
    MESSAGE_OWN_STUDENTS: 'message_own_students',
    MESSAGE_OWN_STUDENT_PARENTS: 'message_own_student_parents',
    MESSAGE_DEPARTMENT_STUDENTS: 'message_department_students',
    MESSAGE_DEPARTMENT_PARENTS: 'message_department_parents',
    MESSAGE_DEPARTMENT_TEACHERS: 'message_department_teachers',
    MESSAGE_DEPARTMENT_EVERYONE: 'message_department_everyone',
    MESSAGE_SCHOOL_STUDENTS: 'message_school_students',
    MESSAGE_SCHOOL_PARENTS: 'message_school_parents',
    MESSAGE_SCHOOL_TEACHERS: 'message_school_teachers',
    MESSAGE_SCHOOL_EVERYONE: 'message_school_everyone',
    MESSAGE_ASSIGNED_SUBORDINATES: 'message_assigned_subordinates',
    DELEGATED_COMMUNICATION_SCOPE: 'delegated_communication_scope'
};

// Permission definitions with metadata
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
        category: 'administration'
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
    [PERMISSIONS.REVIEW_STANDARDS_QUESTIONS]: {
        label: 'Review Standards Questions',
        description: 'Review and approve pre-generated standards assessment question pools',
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
    [PERMISSIONS.MANAGE_GRADE_SCALING]: {
        label: 'Manage Grade Scaling',
        description: 'Create, update, and manage grading scales and defaults',
        category: 'academic'
    },
    [PERMISSIONS.MANAGE_ASSIGNMENT_CONFIG]: {
        label: 'Manage Assignment Config',
        description: 'Create and maintain assignment types and defaults',
        category: 'academic'
    },
    [PERMISSIONS.CREATE_ASSIGNMENTS]: {
        label: 'Create Assignments',
        description: 'Create and update assignments',
        category: 'academic'
    },
    [PERMISSIONS.PUBLISH_ASSIGNMENTS]: {
        label: 'Publish Assignments',
        description: 'Publish assignments to students and parents',
        category: 'academic'
    },
    [PERMISSIONS.GRADE_ASSIGNMENTS]: {
        label: 'Grade Assignments',
        description: 'Enter and update assignment-linked grades',
        category: 'academic'
    },
    [PERMISSIONS.CREATE_HOMEWORK]: {
        label: 'Create Homework',
        description: 'Create and update homework assignments',
        category: 'academic'
    },
    [PERMISSIONS.PUBLISH_HOMEWORK]: {
        label: 'Publish Homework',
        description: 'Publish homework assignments to students and parents',
        category: 'academic'
    },
    [PERMISSIONS.GRADE_HOMEWORK]: {
        label: 'Grade Homework',
        description: 'Enter homework grades linked to submissions',
        category: 'academic'
    },
    [PERMISSIONS.VIEW_HOMEWORK_SUBMISSIONS]: {
        label: 'View Homework Submissions',
        description: 'View student homework submission status',
        category: 'academic'
    },
    [PERMISSIONS.SEND_NOTIFICATIONS]: {
        label: 'Send Notifications',
        description: 'Send notifications to users',
        category: 'operations'
    },
    [PERMISSIONS.SEND_COMMUNICATION_EMAILS]: {
        label: 'Send Communication Emails',
        description: 'Access the school email composer and send scoped communication emails',
        category: 'operations'
    },
    [PERMISSIONS.MESSAGE_OWN_STUDENTS]: {
        label: 'Message Own Students',
        description: 'Send emails to students in your assigned classes/subjects',
        category: 'operations'
    },
    [PERMISSIONS.MESSAGE_OWN_STUDENT_PARENTS]: {
        label: 'Message Own Student Parents',
        description: 'Send emails to parents/guardians of students in your assigned classes/subjects',
        category: 'operations'
    },
    [PERMISSIONS.MESSAGE_DEPARTMENT_STUDENTS]: {
        label: 'Message Department Students',
        description: 'Send emails to students within assigned department scope',
        category: 'operations'
    },
    [PERMISSIONS.MESSAGE_DEPARTMENT_PARENTS]: {
        label: 'Message Department Parents',
        description: 'Send emails to parents/guardians within assigned department scope',
        category: 'operations'
    },
    [PERMISSIONS.MESSAGE_DEPARTMENT_TEACHERS]: {
        label: 'Message Department Teachers',
        description: 'Send emails to teachers within assigned department scope',
        category: 'operations'
    },
    [PERMISSIONS.MESSAGE_DEPARTMENT_EVERYONE]: {
        label: 'Message Department Everyone',
        description: 'Send emails to everyone (students, parents, teachers) within assigned department scope',
        category: 'operations'
    },
    [PERMISSIONS.MESSAGE_SCHOOL_STUDENTS]: {
        label: 'Message School Students',
        description: 'Send emails to all students in the school',
        category: 'operations'
    },
    [PERMISSIONS.MESSAGE_SCHOOL_PARENTS]: {
        label: 'Message School Parents',
        description: 'Send emails to all parents/guardians in the school',
        category: 'operations'
    },
    [PERMISSIONS.MESSAGE_SCHOOL_TEACHERS]: {
        label: 'Message School Teachers',
        description: 'Send emails to all teachers in the school',
        category: 'operations'
    },
    [PERMISSIONS.MESSAGE_SCHOOL_EVERYONE]: {
        label: 'Message School Everyone',
        description: 'Send emails to everyone in the school',
        category: 'operations'
    },
    [PERMISSIONS.MESSAGE_ASSIGNED_SUBORDINATES]: {
        label: 'Message Assigned Subordinates',
        description: 'Send emails to assigned subordinate staff within delegated scope',
        category: 'operations'
    },
    [PERMISSIONS.DELEGATED_COMMUNICATION_SCOPE]: {
        label: 'Delegated Communication Scope',
        description: 'Use delegated communication scope metadata for recipient access',
        category: 'operations'
    }
};

// Legacy role to permissions mapping (for backward compatibility and migration)
export const ROLE_TO_PERMISSIONS = {
    super_admin: [], // Super admin has all permissions by default
    admin: [], // Admin has all permissions by default
    
    // Legacy staff roles mapped to permissions
    attendance_manager: [
        PERMISSIONS.MANAGE_ATTENDANCE_REMINDERS,
        PERMISSIONS.VIEW_ATTENDANCE_REPORTS
    ],
    lesson_plan_reviewer: [
        PERMISSIONS.REVIEW_LESSON_PLANS
    ],
    report_viewer: [
        PERMISSIONS.VIEW_ALL_REPORTS
    ],
    event_coordinator: [
        PERMISSIONS.MANAGE_EVENTS
    ],
    behavior_manager: [
        PERMISSIONS.MANAGE_BEHAVIOR,
        PERMISSIONS.VIEW_BEHAVIOR
    ],
    transportation_coordinator: [
        PERMISSIONS.MANAGE_TRANSPORTATION,
        PERMISSIONS.VIEW_TRANSPORTATION
    ],
    cafeteria_manager: [
        PERMISSIONS.MANAGE_CAFETERIA,
        PERMISSIONS.VIEW_CAFETERIA
    ],
    library_manager: [
        PERMISSIONS.MANAGE_LIBRARY,
        PERMISSIONS.VIEW_LIBRARY
    ],
    it_support: [
        PERMISSIONS.PROVIDE_IT_SUPPORT
    ],
    counselor: [
        PERMISSIONS.ACCESS_COUNSELING_RECORDS,
        PERMISSIONS.EDIT_COUNSELING_RECORDS
    ],
    nurse: [
        PERMISSIONS.ACCESS_HEALTH_RECORDS,
        PERMISSIONS.EDIT_HEALTH_RECORDS
    ],
    
    // Base roles
    teacher: [
        PERMISSIONS.EDIT_LESSON_PLANS,
        PERMISSIONS.VIEW_GRADES,
        PERMISSIONS.EDIT_GRADES,
        PERMISSIONS.CREATE_ASSIGNMENTS,
        PERMISSIONS.PUBLISH_ASSIGNMENTS,
        PERMISSIONS.GRADE_ASSIGNMENTS,
        PERMISSIONS.CREATE_HOMEWORK,
        PERMISSIONS.PUBLISH_HOMEWORK,
        PERMISSIONS.GRADE_HOMEWORK,
        PERMISSIONS.VIEW_HOMEWORK_SUBMISSIONS,
        PERMISSIONS.SEND_COMMUNICATION_EMAILS,
        PERMISSIONS.MESSAGE_OWN_STUDENTS,
        PERMISSIONS.MESSAGE_OWN_STUDENT_PARENTS
    ],
    department_principal: [
        PERMISSIONS.MANAGE_SUBSTITUTIONS,
        PERMISSIONS.REVIEW_LESSON_PLANS,
        PERMISSIONS.REVIEW_STANDARDS_QUESTIONS,
        PERMISSIONS.VIEW_ALL_REPORTS,
        PERMISSIONS.VIEW_HOMEWORK_SUBMISSIONS,
        PERMISSIONS.SEND_COMMUNICATION_EMAILS,
        PERMISSIONS.MESSAGE_DEPARTMENT_STUDENTS,
        PERMISSIONS.MESSAGE_DEPARTMENT_PARENTS,
        PERMISSIONS.MESSAGE_DEPARTMENT_TEACHERS,
        PERMISSIONS.MESSAGE_DEPARTMENT_EVERYONE
    ],
    staff: [],
    parent: [],
    student: []
};

// Permission categories for UI grouping
export const PERMISSION_CATEGORIES = {
    attendance: 'Attendance',
    academic: 'Academic',
    operations: 'Operations',
    reports: 'Reports',
    student_services: 'Student Services',
    admin: 'Administration'
};

/**
 * Check if a user has a specific permission
 * @param {Object} user - User object with role and permissions
 * @param {string} permission - Permission to check
 * @returns {boolean}
 */
export function hasPermission(user, permission) {
    if (!user) return false;
    
    // Super admin and admin have all permissions
    if (user.role === 'super_admin' || user.role === 'admin') {
        return true;
    }
    
    // Check if user has the permission explicitly
    if (user.permissions && user.permissions.includes(permission)) {
        // Check if permission has expired
        if (user.permissionScopes && user.permissionScopes.get(permission)) {
            const scope = user.permissionScopes.get(permission);
            if (scope.expiresAt && new Date() > new Date(scope.expiresAt)) {
                return false; // Permission expired
            }
        }
        return true;
    }
    
    // Check legacy role-based permissions (backward compatibility)
    const rolePermissions = ROLE_TO_PERMISSIONS[user.role];
    if (rolePermissions && rolePermissions.includes(permission)) {
        return true;
    }
    
    return false;
}

/**
 * Check if a user has any of the specified permissions
 * @param {Object} user - User object
 * @param {string[]} permissions - Array of permissions to check
 * @returns {boolean}
 */
export function hasAnyPermission(user, permissions) {
    return permissions.some(permission => hasPermission(user, permission));
}

/**
 * Check if a user has all of the specified permissions
 * @param {Object} user - User object
 * @param {string[]} permissions - Array of permissions to check
 * @returns {boolean}
 */
export function hasAllPermissions(user, permissions) {
    return permissions.every(permission => hasPermission(user, permission));
}

/**
 * Get all permissions for a user (including role-based and explicit)
 * @param {Object} user - User object
 * @returns {string[]}
 */
export function getUserPermissions(user) {
    if (!user) return [];
    
    // Super admin and admin have all permissions
    if (user.role === 'super_admin' || user.role === 'admin') {
        return Object.values(PERMISSIONS);
    }
    
    const permissions = new Set();
    
    // Add explicit permissions
    if (user.permissions) {
        user.permissions.forEach(p => {
            // Check if not expired
            if (user.permissionScopes && user.permissionScopes.get(p)) {
                const scope = user.permissionScopes.get(p);
                if (scope.expiresAt && new Date() > new Date(scope.expiresAt)) {
                    return; // Skip expired permission
                }
            }
            permissions.add(p);
        });
    }
    
    // Add role-based permissions (backward compatibility)
    const rolePermissions = ROLE_TO_PERMISSIONS[user.role];
    if (rolePermissions) {
        rolePermissions.forEach(p => permissions.add(p));
    }
    
    return Array.from(permissions);
}

export default {
    PERMISSIONS,
    PERMISSION_DEFINITIONS,
    ROLE_TO_PERMISSIONS,
    PERMISSION_CATEGORIES,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    getUserPermissions
};
