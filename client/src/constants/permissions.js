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
    VIEW_CURRICULUM_MAPS: 'view_curriculum_maps',
    EDIT_CURRICULUM_MAPS: 'edit_curriculum_maps',
    REVIEW_CURRICULUM_MAPS: 'review_curriculum_maps',
    PUBLISH_CURRICULUM_MAPS: 'publish_curriculum_maps',
    CREATE_CURRICULUM_MAP: 'create_curriculum_map',
    EDIT_OWN_CURRICULUM_MAP: 'edit_own_curriculum_map',
    EDIT_ANY_CURRICULUM_MAP: 'edit_any_curriculum_map',
    REVIEW_CURRICULUM_MAP: 'review_curriculum_map',
    APPROVE_CURRICULUM_MAP: 'approve_curriculum_map',
    REJECT_CURRICULUM_MAP: 'reject_curriculum_map',
    EXPORT_CURRICULUM_MAP: 'export_curriculum_map',
    PRINT_CURRICULUM_MAP: 'print_curriculum_map',
    CONFIGURE_CURRICULUM_MAP_TEMPLATES: 'configure_curriculum_map_templates',
    
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
    [PERMISSIONS.VIEW_CURRICULUM_MAPS]: {
        label: 'View Curriculum Maps',
        description: 'View published curriculum maps and related coverage details',
        category: 'academic'
    },
    [PERMISSIONS.EDIT_CURRICULUM_MAPS]: {
        label: 'Edit Curriculum Maps',
        description: 'Create and update curriculum maps',
        category: 'academic'
    },
    [PERMISSIONS.REVIEW_CURRICULUM_MAPS]: {
        label: 'Review Curriculum Maps',
        description: 'Review submitted curriculum maps',
        category: 'academic'
    },
    [PERMISSIONS.PUBLISH_CURRICULUM_MAPS]: {
        label: 'Publish Curriculum Maps',
        description: 'Publish approved curriculum map versions',
        category: 'academic'
    },
    [PERMISSIONS.CREATE_CURRICULUM_MAP]: {
        label: 'Create Curriculum Map',
        description: 'Create curriculum maps',
        category: 'academic'
    },
    [PERMISSIONS.EDIT_OWN_CURRICULUM_MAP]: {
        label: 'Edit Own Curriculum Map',
        description: 'Edit curriculum maps created by the user',
        category: 'academic'
    },
    [PERMISSIONS.EDIT_ANY_CURRICULUM_MAP]: {
        label: 'Edit Any Curriculum Map',
        description: 'Edit curriculum maps created by any teacher',
        category: 'academic'
    },
    [PERMISSIONS.REVIEW_CURRICULUM_MAP]: {
        label: 'Review Curriculum Map',
        description: 'Review submitted curriculum maps',
        category: 'academic'
    },
    [PERMISSIONS.APPROVE_CURRICULUM_MAP]: {
        label: 'Approve Curriculum Map',
        description: 'Approve curriculum maps during review workflow',
        category: 'academic'
    },
    [PERMISSIONS.REJECT_CURRICULUM_MAP]: {
        label: 'Reject Curriculum Map',
        description: 'Reject curriculum maps during review workflow',
        category: 'academic'
    },
    [PERMISSIONS.EXPORT_CURRICULUM_MAP]: {
        label: 'Export Curriculum Map',
        description: 'Export curriculum maps to CSV or PDF',
        category: 'academic'
    },
    [PERMISSIONS.PRINT_CURRICULUM_MAP]: {
        label: 'Print Curriculum Map',
        description: 'Print curriculum maps using document-friendly layout',
        category: 'academic'
    },
    [PERMISSIONS.CONFIGURE_CURRICULUM_MAP_TEMPLATES]: {
        label: 'Configure Curriculum Templates',
        description: 'Configure school curriculum templates and workflow settings',
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
    [PERMISSIONS.SEND_NOTIFICATIONS]: {
        label: 'Send Notifications',
        description: 'Send notifications to users',
        category: 'operations'
    },
    [PERMISSIONS.SEND_COMMUNICATION_EMAILS]: {
        label: 'Send Communication Emails',
        description: 'Access the scoped email composer for school communication',
        category: 'operations'
    },
    [PERMISSIONS.MESSAGE_OWN_STUDENTS]: {
        label: 'Message Own Students',
        description: 'Send emails to students in your assigned classes/subjects',
        category: 'operations'
    },
    [PERMISSIONS.MESSAGE_OWN_STUDENT_PARENTS]: {
        label: 'Message Own Student Parents',
        description: 'Send emails to parents of students in your assigned classes/subjects',
        category: 'operations'
    },
    [PERMISSIONS.MESSAGE_DEPARTMENT_STUDENTS]: {
        label: 'Message Department Students',
        description: 'Send emails to students in assigned department scope',
        category: 'operations'
    },
    [PERMISSIONS.MESSAGE_DEPARTMENT_PARENTS]: {
        label: 'Message Department Parents',
        description: 'Send emails to parents in assigned department scope',
        category: 'operations'
    },
    [PERMISSIONS.MESSAGE_DEPARTMENT_TEACHERS]: {
        label: 'Message Department Teachers',
        description: 'Send emails to teachers in assigned department scope',
        category: 'operations'
    },
    [PERMISSIONS.MESSAGE_DEPARTMENT_EVERYONE]: {
        label: 'Message Department Everyone',
        description: 'Send emails to everyone in assigned department scope',
        category: 'operations'
    },
    [PERMISSIONS.MESSAGE_SCHOOL_STUDENTS]: {
        label: 'Message School Students',
        description: 'Send emails to all students in the school',
        category: 'operations'
    },
    [PERMISSIONS.MESSAGE_SCHOOL_PARENTS]: {
        label: 'Message School Parents',
        description: 'Send emails to all parents in the school',
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
        description: 'Send emails to assigned subordinate staff',
        category: 'operations'
    },
    [PERMISSIONS.DELEGATED_COMMUNICATION_SCOPE]: {
        label: 'Delegated Communication Scope',
        description: 'Use delegated communication scope metadata',
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
