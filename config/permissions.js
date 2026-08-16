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
    MANAGE_SBR_SCALES: 'sbr:manage_scales',
    GENERATE_SBR_REPORTS: 'sbr:generate_reports',
    VIEW_SBR_REPORTS: 'sbr:view_reports',
    
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
    MANAGE_GRADEBOOK_CONFIG: 'manage_gradebook_config',
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
    DELEGATED_COMMUNICATION_SCOPE: 'delegated_communication_scope',

    // Academic Excellence
    VIEW_ACADEMIC_EXCELLENCE_STUDENT: 'view_academic_excellence_student',
    VIEW_ACADEMIC_EXCELLENCE_CLASS: 'view_academic_excellence_class',
    VIEW_ACADEMIC_EXCELLENCE_SCHOOL: 'view_academic_excellence_school',
    VIEW_ACADEMIC_EXCELLENCE_DEPARTMENT: 'view_academic_excellence_department',
    ASSIGN_ACADEMIC_EXCELLENCE_TASKS: 'assign_academic_excellence_tasks',
    REVIEW_ACADEMIC_EXCELLENCE_TASKS: 'review_academic_excellence_tasks',
    BULK_ASSIGN_ACADEMIC_EXCELLENCE_TASKS: 'bulk_assign_academic_excellence_tasks',
    DISABLE_ACADEMIC_EXCELLENCE_FOR_STUDENT: 'disable_academic_excellence_for_student',
    DISABLE_ACADEMIC_EXCELLENCE_FOR_CLASS: 'disable_academic_excellence_for_class',
    EXCLUDE_ACADEMIC_EXCELLENCE_LESSON: 'exclude_academic_excellence_lesson',
    MANAGE_ACADEMIC_EXCELLENCE_EXCLUSIONS: 'manage_academic_excellence_exclusions',
    MANAGE_ACADEMIC_EXCELLENCE_NOTIFICATIONS: 'manage_academic_excellence_notifications',
    OVERRIDE_ACADEMIC_EXCELLENCE_NOTIFICATIONS: 'override_academic_excellence_notifications',
    MANAGE_ACADEMIC_EXCELLENCE_SETTINGS: 'manage_academic_excellence_settings',
    VIEW_ACADEMIC_EXCELLENCE_SETTINGS: 'view_academic_excellence_settings',
    VIEW_ACADEMIC_EXCELLENCE_SCHOOL_ANALYTICS: 'view_academic_excellence_school_analytics',
    VIEW_ACADEMIC_EXCELLENCE_CLASS_ANALYTICS: 'view_academic_excellence_class_analytics',
    EXPORT_ACADEMIC_EXCELLENCE_REPORTS: 'export_academic_excellence_reports',
    VIEW_ACADEMIC_EXCELLENCE_AT_RISK_REPORT: 'view_academic_excellence_at_risk_report',

    // Newsletter Templates
    MANAGE_NEWSLETTER_TEMPLATES: 'manage_newsletter_templates',
    MANAGE_NEWSLETTER_SETTINGS: 'manage_newsletter_settings',

    // Presentations
    MANAGE_PRESENTATIONS: 'manage_presentations',
    MANAGE_PRESENTATION_TEMPLATES: 'manage_presentation_templates',

    // Standards Assessment
    VIEW_ASSESSMENT_POOL: 'view_assessment_pool',
    CREATE_ASSESSMENT_FROM_POOL: 'create_assessment_from_pool',
    SEND_ASSESSMENT_PROGRESS: 'send_assessment_progress',
    GENERATE_ASSESSMENT_NARRATIVE: 'generate_assessment_narrative',
    APPROVE_ASSESSMENT_NARRATIVE: 'approve_assessment_narrative',
    SEND_ASSESSMENT_NARRATIVE: 'send_assessment_narrative',
    OVERRIDE_ASSESSMENT_NARRATIVE: 'override_assessment_narrative',
    EDIT_LIVE_ASSESSMENT: 'edit_live_assessment',
    PUBLISH_ASSESSMENT_REVISION: 'publish_assessment_revision',
    MANAGE_ASSESSMENT_POOL_SETTINGS: 'manage_assessment_pool_settings',
    MANAGE_ASSESSMENT_SEND_SETTINGS: 'manage_assessment_send_settings',
    MANAGE_ASSESSMENT_NARRATIVE_SETTINGS: 'manage_assessment_narrative_settings',
    MANAGE_ASSESSMENT_EDIT_SETTINGS: 'manage_assessment_edit_settings',
    MANAGE_ASSESSMENT_COMMS_SETTINGS: 'manage_assessment_comms_settings',
    VIEW_ASSESSMENT_AUDIT_LOGS: 'view_assessment_audit_logs',
    EXPORT_ASSESSMENT_AUDIT_LOGS: 'export_assessment_audit_logs',

    // Finance & Fee Management
    MANAGE_FEE_STRUCTURES: 'manage_fee_structures',
    VIEW_FEE_STRUCTURES: 'view_fee_structures',
    CREATE_INVOICES: 'create_invoices',
    VIEW_INVOICES: 'view_invoices',
    CANCEL_INVOICES: 'cancel_invoices',
    RECORD_PAYMENTS: 'record_payments',
    VOID_PAYMENTS: 'void_payments',
    MANAGE_PAYMENT_PLANS: 'manage_payment_plans',
    MANAGE_DISCOUNTS: 'manage_discounts',
    VIEW_FINANCE_REPORTS: 'view_finance_reports',
    EXPORT_FINANCE_DATA: 'export_finance_data',
    VIEW_STUDENT_FINANCE: 'view_student_finance',

    // HR & Staff Management
    VIEW_STAFF_PROFILES: 'view_staff_profiles',
    MANAGE_STAFF_PROFILES: 'manage_staff_profiles',
    VIEW_CONTRACTS: 'view_contracts',
    MANAGE_CONTRACTS: 'manage_contracts',
    MANAGE_LEAVE_TYPES: 'manage_leave_types',
    APPROVE_LEAVE: 'approve_leave',
    VIEW_LEAVE_CALENDAR: 'view_leave_calendar',
    REQUEST_LEAVE: 'request_leave',
    MANAGE_CERTIFICATIONS: 'manage_certifications',
    VIEW_CERTIFICATIONS: 'view_certifications',
    LOG_PROFESSIONAL_DEVELOPMENT: 'log_professional_development',
    VIEW_PD_REPORTS: 'view_pd_reports',
    MANAGE_PERFORMANCE_REVIEWS: 'manage_performance_reviews',
    VIEW_OWN_HR_PROFILE: 'view_own_hr_profile',
    MANAGE_HR_SETTINGS: 'manage_hr_settings',

    // PLP – Character Development
    PLP_MANAGE_CONFIG: 'plp_manage_config',
    PLP_MANAGE_RECORDS: 'plp_manage_records',
    PLP_VIEW_SCOPED: 'plp_view_scoped',
    PLP_MANAGE_SUPERVISOR_ASSIGNMENTS: 'plp_manage_supervisor_assignments',
    PLP_FINALIZE_AWARDS: 'plp_finalize_awards',
    PLP_VIEW_AUDIT: 'plp_view_audit',
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
    [PERMISSIONS.MANAGE_SBR_SCALES]: {
        label: 'Manage SBR Scales',
        description: 'Create, update, delete, and set default standards-based report scales',
        category: 'reports'
    },
    [PERMISSIONS.GENERATE_SBR_REPORTS]: {
        label: 'Generate SBR Reports',
        description: 'Generate and publish standards-based report cards',
        category: 'reports'
    },
    [PERMISSIONS.VIEW_SBR_REPORTS]: {
        label: 'View SBR Reports',
        description: 'View and download standards-based report cards',
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
    [PERMISSIONS.MANAGE_GRADEBOOK_CONFIG]: {
        label: 'Manage Gradebook Config',
        description: 'Configure semester structure, grade categories, and grading policies',
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
    },
    [PERMISSIONS.VIEW_ACADEMIC_EXCELLENCE_STUDENT]: {
        label: 'View Academic Excellence Student',
        description: 'View student-level Academic Excellence insights',
        category: 'academic'
    },
    [PERMISSIONS.VIEW_ACADEMIC_EXCELLENCE_CLASS]: {
        label: 'View Academic Excellence Class',
        description: 'View class-level Academic Excellence insights',
        category: 'academic'
    },
    [PERMISSIONS.VIEW_ACADEMIC_EXCELLENCE_SCHOOL]: {
        label: 'View Academic Excellence School',
        description: 'View school-wide Academic Excellence insights',
        category: 'reports'
    },
    [PERMISSIONS.VIEW_ACADEMIC_EXCELLENCE_DEPARTMENT]: {
        label: 'View Academic Excellence Department',
        description: 'View department-level Academic Excellence insights',
        category: 'reports'
    },
    [PERMISSIONS.ASSIGN_ACADEMIC_EXCELLENCE_TASKS]: {
        label: 'Assign AE Tasks',
        description: 'Assign Academic Excellence tasks to students',
        category: 'academic'
    },
    [PERMISSIONS.REVIEW_ACADEMIC_EXCELLENCE_TASKS]: {
        label: 'Review AE Tasks',
        description: 'Review completed Academic Excellence tasks',
        category: 'academic'
    },
    [PERMISSIONS.BULK_ASSIGN_ACADEMIC_EXCELLENCE_TASKS]: {
        label: 'Bulk Assign AE Tasks',
        description: 'Bulk assign Academic Excellence tasks by class or group',
        category: 'academic'
    },
    [PERMISSIONS.DISABLE_ACADEMIC_EXCELLENCE_FOR_STUDENT]: {
        label: 'Disable AE For Student',
        description: 'Disable Academic Excellence tracking for a student',
        category: 'academic'
    },
    [PERMISSIONS.DISABLE_ACADEMIC_EXCELLENCE_FOR_CLASS]: {
        label: 'Disable AE For Class',
        description: 'Disable Academic Excellence tracking for a class',
        category: 'academic'
    },
    [PERMISSIONS.EXCLUDE_ACADEMIC_EXCELLENCE_LESSON]: {
        label: 'Exclude AE Lesson',
        description: 'Exclude lessons or objectives from Academic Excellence',
        category: 'academic'
    },
    [PERMISSIONS.MANAGE_ACADEMIC_EXCELLENCE_EXCLUSIONS]: {
        label: 'Manage AE Exclusions',
        description: 'Manage Academic Excellence exclusions and rules',
        category: 'admin'
    },
    [PERMISSIONS.MANAGE_ACADEMIC_EXCELLENCE_NOTIFICATIONS]: {
        label: 'Manage AE Notifications',
        description: 'Manage Academic Excellence notification preferences',
        category: 'operations'
    },
    [PERMISSIONS.OVERRIDE_ACADEMIC_EXCELLENCE_NOTIFICATIONS]: {
        label: 'Override AE Notifications',
        description: 'Override Academic Excellence notification settings school-wide',
        category: 'admin'
    },
    [PERMISSIONS.MANAGE_ACADEMIC_EXCELLENCE_SETTINGS]: {
        label: 'Manage AE Settings',
        description: 'Manage Academic Excellence settings and thresholds',
        category: 'admin'
    },
    [PERMISSIONS.VIEW_ACADEMIC_EXCELLENCE_SETTINGS]: {
        label: 'View AE Settings',
        description: 'View Academic Excellence settings',
        category: 'academic'
    },
    [PERMISSIONS.VIEW_ACADEMIC_EXCELLENCE_SCHOOL_ANALYTICS]: {
        label: 'View AE School Analytics',
        description: 'View school-level Academic Excellence analytics',
        category: 'reports'
    },
    [PERMISSIONS.VIEW_ACADEMIC_EXCELLENCE_CLASS_ANALYTICS]: {
        label: 'View AE Class Analytics',
        description: 'View class-level Academic Excellence analytics',
        category: 'reports'
    },
    [PERMISSIONS.EXPORT_ACADEMIC_EXCELLENCE_REPORTS]: {
        label: 'Export AE Reports',
        description: 'Export Academic Excellence reports',
        category: 'reports'
    },
    [PERMISSIONS.VIEW_ACADEMIC_EXCELLENCE_AT_RISK_REPORT]: {
        label: 'View AE At Risk Report',
        description: 'View at-risk student Academic Excellence reports',
        category: 'reports'
    },
    [PERMISSIONS.MANAGE_NEWSLETTER_TEMPLATES]: {
        label: 'Manage Newsletter Templates',
        description: 'Create, edit, delete and configure newsletter email templates',
        category: 'communication'
    },
    [PERMISSIONS.MANAGE_NEWSLETTER_SETTINGS]: {
        label: 'Manage Newsletter Settings',
        description: 'Configure newsletter frequency and AI word limits',
        category: 'communication'
    },
    [PERMISSIONS.MANAGE_PRESENTATIONS]: {
        label: 'Manage Presentations',
        description: 'Create, edit, and manage AI classroom presentations',
        category: 'content'
    },
    [PERMISSIONS.MANAGE_PRESENTATION_TEMPLATES]: {
        label: 'Manage Presentation Templates',
        description: 'Create and manage presentation template structures',
        category: 'content'
    },

    // Standards Assessment
    [PERMISSIONS.VIEW_ASSESSMENT_POOL]: {
        label: 'View Assessment Pool',
        description: 'Browse and search the pre-generated question pool library',
        category: 'standards_assessment'
    },
    [PERMISSIONS.CREATE_ASSESSMENT_FROM_POOL]: {
        label: 'Create Assessment From Pool',
        description: 'Select pool questions and create a new assessment draft',
        category: 'standards_assessment'
    },
    [PERMISSIONS.SEND_ASSESSMENT_PROGRESS]: {
        label: 'Send Assessment Progress',
        description: 'Send finished/unfinished progress tables to students and/or parents',
        category: 'standards_assessment'
    },
    [PERMISSIONS.GENERATE_ASSESSMENT_NARRATIVE]: {
        label: 'Generate Assessment Narrative',
        description: 'Generate AI narrative reports from student evidence and mastery data',
        category: 'standards_assessment'
    },
    [PERMISSIONS.APPROVE_ASSESSMENT_NARRATIVE]: {
        label: 'Approve Assessment Narrative',
        description: 'Review, edit, and approve AI-generated narratives before sending',
        category: 'standards_assessment'
    },
    [PERMISSIONS.SEND_ASSESSMENT_NARRATIVE]: {
        label: 'Send Assessment Narrative',
        description: 'Send approved narrative reports to students and/or parents',
        category: 'standards_assessment'
    },
    [PERMISSIONS.OVERRIDE_ASSESSMENT_NARRATIVE]: {
        label: 'Override Assessment Narrative',
        description: 'Edit/approve a narrative draft created by another teacher (HOD override)',
        category: 'standards_assessment'
    },
    [PERMISSIONS.EDIT_LIVE_ASSESSMENT]: {
        label: 'Edit Live Assessment',
        description: 'Edit assessment content (questions, options, answers) after students have started',
        category: 'standards_assessment'
    },
    [PERMISSIONS.PUBLISH_ASSESSMENT_REVISION]: {
        label: 'Publish Assessment Revision',
        description: 'Publish a new content revision on a live assessment',
        category: 'standards_assessment'
    },
    [PERMISSIONS.MANAGE_ASSESSMENT_POOL_SETTINGS]: {
        label: 'Manage Assessment Pool Settings',
        description: 'Configure pool library restrictions (visibility scope, browsing rules, limits)',
        category: 'standards_assessment'
    },
    [PERMISSIONS.MANAGE_ASSESSMENT_SEND_SETTINGS]: {
        label: 'Manage Assessment Send Settings',
        description: 'Configure progress table send restrictions (frequency caps, channels, privacy)',
        category: 'standards_assessment'
    },
    [PERMISSIONS.MANAGE_ASSESSMENT_NARRATIVE_SETTINGS]: {
        label: 'Manage Assessment Narrative Settings',
        description: 'Configure narrative generation restrictions (tone, length, filters, banned phrases)',
        category: 'standards_assessment'
    },
    [PERMISSIONS.MANAGE_ASSESSMENT_EDIT_SETTINGS]: {
        label: 'Manage Assessment Edit Settings',
        description: 'Configure live edit restrictions (revision policies, lock windows, notifications)',
        category: 'standards_assessment'
    },
    [PERMISSIONS.MANAGE_ASSESSMENT_COMMS_SETTINGS]: {
        label: 'Manage Assessment Comms Settings',
        description: 'Configure communication preferences (email branding, quiet hours, channels)',
        category: 'standards_assessment'
    },
    [PERMISSIONS.VIEW_ASSESSMENT_AUDIT_LOGS]: {
        label: 'View Assessment Audit Logs',
        description: 'View send/edit audit logs for standards assessments',
        category: 'standards_assessment'
    },
    [PERMISSIONS.EXPORT_ASSESSMENT_AUDIT_LOGS]: {
        label: 'Export Assessment Audit Logs',
        description: 'Export assessment audit logs as CSV/PDF for compliance reporting',
        category: 'standards_assessment'
    },

    // Finance & Fee Management
    [PERMISSIONS.MANAGE_FEE_STRUCTURES]: {
        label: 'Manage Fee Structures',
        description: 'Create, edit, and delete fee structures and categories',
        category: 'finance'
    },
    [PERMISSIONS.VIEW_FEE_STRUCTURES]: {
        label: 'View Fee Structures',
        description: 'View fee structure definitions',
        category: 'finance'
    },
    [PERMISSIONS.CREATE_INVOICES]: {
        label: 'Create Invoices',
        description: 'Generate and issue invoices (single or bulk)',
        category: 'finance'
    },
    [PERMISSIONS.VIEW_INVOICES]: {
        label: 'View Invoices',
        description: 'View invoices across students',
        category: 'finance'
    },
    [PERMISSIONS.CANCEL_INVOICES]: {
        label: 'Cancel Invoices',
        description: 'Cancel issued invoices',
        category: 'finance'
    },
    [PERMISSIONS.RECORD_PAYMENTS]: {
        label: 'Record Payments',
        description: 'Record incoming payments against invoices',
        category: 'finance'
    },
    [PERMISSIONS.VOID_PAYMENTS]: {
        label: 'Void Payments',
        description: 'Reverse or void a recorded payment',
        category: 'finance'
    },
    [PERMISSIONS.MANAGE_PAYMENT_PLANS]: {
        label: 'Manage Payment Plans',
        description: 'Create and modify installment plans',
        category: 'finance'
    },
    [PERMISSIONS.MANAGE_DISCOUNTS]: {
        label: 'Manage Discounts',
        description: 'Create and assign discount and scholarship rules',
        category: 'finance'
    },
    [PERMISSIONS.VIEW_FINANCE_REPORTS]: {
        label: 'View Finance Reports',
        description: 'Access revenue, outstanding, and collection reports',
        category: 'finance'
    },
    [PERMISSIONS.EXPORT_FINANCE_DATA]: {
        label: 'Export Finance Data',
        description: 'Export financial data to CSV/PDF',
        category: 'finance'
    },
    [PERMISSIONS.VIEW_STUDENT_FINANCE]: {
        label: 'View Student Finance',
        description: 'View a specific student balance and statement',
        category: 'finance'
    },
    // HR & Staff Management
    [PERMISSIONS.VIEW_STAFF_PROFILES]: {
        label: 'View Staff Profiles',
        description: 'View staff directory and individual profiles',
        category: 'hr'
    },
    [PERMISSIONS.MANAGE_STAFF_PROFILES]: {
        label: 'Manage Staff Profiles',
        description: 'Create, edit, and deactivate staff records',
        category: 'hr'
    },
    [PERMISSIONS.VIEW_CONTRACTS]: {
        label: 'View Contracts',
        description: 'View employment contracts and terms',
        category: 'hr'
    },
    [PERMISSIONS.MANAGE_CONTRACTS]: {
        label: 'Manage Contracts',
        description: 'Create, edit, and terminate contracts',
        category: 'hr'
    },
    [PERMISSIONS.MANAGE_LEAVE_TYPES]: {
        label: 'Manage Leave Types',
        description: 'Configure leave type policies and allocations',
        category: 'hr'
    },
    [PERMISSIONS.APPROVE_LEAVE]: {
        label: 'Approve Leave',
        description: 'Approve or reject staff leave requests',
        category: 'hr'
    },
    [PERMISSIONS.VIEW_LEAVE_CALENDAR]: {
        label: 'View Leave Calendar',
        description: 'View who is out on which days',
        category: 'hr'
    },
    [PERMISSIONS.REQUEST_LEAVE]: {
        label: 'Request Leave',
        description: 'Submit leave requests',
        category: 'hr'
    },
    [PERMISSIONS.MANAGE_CERTIFICATIONS]: {
        label: 'Manage Certifications',
        description: 'Add, edit, and verify staff certifications',
        category: 'hr'
    },
    [PERMISSIONS.VIEW_CERTIFICATIONS]: {
        label: 'View Certifications',
        description: 'View certification status and expiry alerts',
        category: 'hr'
    },
    [PERMISSIONS.LOG_PROFESSIONAL_DEVELOPMENT]: {
        label: 'Log Professional Development',
        description: 'Log PD activities, workshops, and training',
        category: 'hr'
    },
    [PERMISSIONS.VIEW_PD_REPORTS]: {
        label: 'View PD Reports',
        description: 'View school-wide professional development reports',
        category: 'hr'
    },
    [PERMISSIONS.MANAGE_PERFORMANCE_REVIEWS]: {
        label: 'Manage Performance Reviews',
        description: 'Create and manage staff performance reviews',
        category: 'hr'
    },
    [PERMISSIONS.VIEW_OWN_HR_PROFILE]: {
        label: 'View Own HR Profile',
        description: 'View own staff profile, leave, certs, and reviews',
        category: 'hr'
    },
    [PERMISSIONS.MANAGE_HR_SETTINGS]: {
        label: 'Manage HR Settings',
        description: 'Configure HR module policies and settings',
        category: 'hr'
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
        PERMISSIONS.VIEW_CURRICULUM_MAPS,
        PERMISSIONS.CREATE_CURRICULUM_MAP,
        PERMISSIONS.EDIT_OWN_CURRICULUM_MAP,
        PERMISSIONS.EXPORT_CURRICULUM_MAP,
        PERMISSIONS.PRINT_CURRICULUM_MAP,
        PERMISSIONS.VIEW_GRADES,
        PERMISSIONS.EDIT_GRADES,
        PERMISSIONS.CREATE_ASSIGNMENTS,
        PERMISSIONS.PUBLISH_ASSIGNMENTS,
        PERMISSIONS.GRADE_ASSIGNMENTS,
        PERMISSIONS.GENERATE_SBR_REPORTS,
        PERMISSIONS.VIEW_SBR_REPORTS,
        PERMISSIONS.CREATE_HOMEWORK,
        PERMISSIONS.PUBLISH_HOMEWORK,
        PERMISSIONS.GRADE_HOMEWORK,
        PERMISSIONS.VIEW_HOMEWORK_SUBMISSIONS,
        PERMISSIONS.SEND_COMMUNICATION_EMAILS,
        PERMISSIONS.MESSAGE_OWN_STUDENTS,
        PERMISSIONS.MESSAGE_OWN_STUDENT_PARENTS,
        PERMISSIONS.VIEW_ACADEMIC_EXCELLENCE_STUDENT,
        PERMISSIONS.VIEW_ACADEMIC_EXCELLENCE_CLASS,
        PERMISSIONS.ASSIGN_ACADEMIC_EXCELLENCE_TASKS,
        PERMISSIONS.REVIEW_ACADEMIC_EXCELLENCE_TASKS,
        PERMISSIONS.BULK_ASSIGN_ACADEMIC_EXCELLENCE_TASKS,
        PERMISSIONS.DISABLE_ACADEMIC_EXCELLENCE_FOR_STUDENT,
        PERMISSIONS.DISABLE_ACADEMIC_EXCELLENCE_FOR_CLASS,
        PERMISSIONS.EXCLUDE_ACADEMIC_EXCELLENCE_LESSON,
        PERMISSIONS.MANAGE_ACADEMIC_EXCELLENCE_NOTIFICATIONS,
        PERMISSIONS.VIEW_ACADEMIC_EXCELLENCE_SETTINGS,
        PERMISSIONS.VIEW_ACADEMIC_EXCELLENCE_CLASS_ANALYTICS,
        PERMISSIONS.EXPORT_ACADEMIC_EXCELLENCE_REPORTS,
        PERMISSIONS.VIEW_ACADEMIC_EXCELLENCE_AT_RISK_REPORT,
        PERMISSIONS.MANAGE_PRESENTATIONS,
        PERMISSIONS.VIEW_ASSESSMENT_POOL,
        PERMISSIONS.CREATE_ASSESSMENT_FROM_POOL,
        PERMISSIONS.SEND_ASSESSMENT_PROGRESS,
        PERMISSIONS.GENERATE_ASSESSMENT_NARRATIVE,
        PERMISSIONS.APPROVE_ASSESSMENT_NARRATIVE,
        PERMISSIONS.SEND_ASSESSMENT_NARRATIVE,
        PERMISSIONS.EDIT_LIVE_ASSESSMENT,
        PERMISSIONS.PUBLISH_ASSESSMENT_REVISION,
        PERMISSIONS.VIEW_STUDENT_FINANCE,
        PERMISSIONS.VIEW_OWN_HR_PROFILE,
        PERMISSIONS.REQUEST_LEAVE,
        PERMISSIONS.VIEW_LEAVE_CALENDAR,
        PERMISSIONS.LOG_PROFESSIONAL_DEVELOPMENT
    ],
    department_principal: [
        PERMISSIONS.MANAGE_SUBSTITUTIONS,
        PERMISSIONS.REVIEW_LESSON_PLANS,
        PERMISSIONS.REVIEW_STANDARDS_QUESTIONS,
        PERMISSIONS.VIEW_CURRICULUM_MAPS,
        PERMISSIONS.EDIT_CURRICULUM_MAPS,
        PERMISSIONS.REVIEW_CURRICULUM_MAPS,
        PERMISSIONS.PUBLISH_CURRICULUM_MAPS,
        PERMISSIONS.CREATE_CURRICULUM_MAP,
        PERMISSIONS.EDIT_ANY_CURRICULUM_MAP,
        PERMISSIONS.REVIEW_CURRICULUM_MAP,
        PERMISSIONS.APPROVE_CURRICULUM_MAP,
        PERMISSIONS.REJECT_CURRICULUM_MAP,
        PERMISSIONS.EXPORT_CURRICULUM_MAP,
        PERMISSIONS.PRINT_CURRICULUM_MAP,
        PERMISSIONS.CONFIGURE_CURRICULUM_MAP_TEMPLATES,
        PERMISSIONS.VIEW_ALL_REPORTS,
        PERMISSIONS.GENERATE_SBR_REPORTS,
        PERMISSIONS.VIEW_SBR_REPORTS,
        PERMISSIONS.VIEW_HOMEWORK_SUBMISSIONS,
        PERMISSIONS.SEND_COMMUNICATION_EMAILS,
        PERMISSIONS.MESSAGE_DEPARTMENT_STUDENTS,
        PERMISSIONS.MESSAGE_DEPARTMENT_PARENTS,
        PERMISSIONS.MESSAGE_DEPARTMENT_TEACHERS,
        PERMISSIONS.MESSAGE_DEPARTMENT_EVERYONE,
        PERMISSIONS.VIEW_ACADEMIC_EXCELLENCE_STUDENT,
        PERMISSIONS.VIEW_ACADEMIC_EXCELLENCE_CLASS,
        PERMISSIONS.VIEW_ACADEMIC_EXCELLENCE_DEPARTMENT,
        PERMISSIONS.ASSIGN_ACADEMIC_EXCELLENCE_TASKS,
        PERMISSIONS.REVIEW_ACADEMIC_EXCELLENCE_TASKS,
        PERMISSIONS.BULK_ASSIGN_ACADEMIC_EXCELLENCE_TASKS,
        PERMISSIONS.DISABLE_ACADEMIC_EXCELLENCE_FOR_STUDENT,
        PERMISSIONS.DISABLE_ACADEMIC_EXCELLENCE_FOR_CLASS,
        PERMISSIONS.EXCLUDE_ACADEMIC_EXCELLENCE_LESSON,
        PERMISSIONS.MANAGE_ACADEMIC_EXCELLENCE_EXCLUSIONS,
        PERMISSIONS.MANAGE_ACADEMIC_EXCELLENCE_NOTIFICATIONS,
        PERMISSIONS.OVERRIDE_ACADEMIC_EXCELLENCE_NOTIFICATIONS,
        PERMISSIONS.MANAGE_ACADEMIC_EXCELLENCE_SETTINGS,
        PERMISSIONS.VIEW_ACADEMIC_EXCELLENCE_SETTINGS,
        PERMISSIONS.VIEW_ACADEMIC_EXCELLENCE_CLASS_ANALYTICS,
        PERMISSIONS.EXPORT_ACADEMIC_EXCELLENCE_REPORTS,
        PERMISSIONS.VIEW_ACADEMIC_EXCELLENCE_AT_RISK_REPORT,
        PERMISSIONS.MANAGE_PRESENTATIONS,
        PERMISSIONS.VIEW_ASSESSMENT_POOL,
        PERMISSIONS.CREATE_ASSESSMENT_FROM_POOL,
        PERMISSIONS.SEND_ASSESSMENT_PROGRESS,
        PERMISSIONS.GENERATE_ASSESSMENT_NARRATIVE,
        PERMISSIONS.APPROVE_ASSESSMENT_NARRATIVE,
        PERMISSIONS.SEND_ASSESSMENT_NARRATIVE,
        PERMISSIONS.EDIT_LIVE_ASSESSMENT,
        PERMISSIONS.PUBLISH_ASSESSMENT_REVISION,
        PERMISSIONS.OVERRIDE_ASSESSMENT_NARRATIVE,
        PERMISSIONS.MANAGE_ASSESSMENT_POOL_SETTINGS,
        PERMISSIONS.MANAGE_ASSESSMENT_SEND_SETTINGS,
        PERMISSIONS.MANAGE_ASSESSMENT_NARRATIVE_SETTINGS,
        PERMISSIONS.MANAGE_ASSESSMENT_EDIT_SETTINGS,
        PERMISSIONS.MANAGE_ASSESSMENT_COMMS_SETTINGS,
        PERMISSIONS.VIEW_ASSESSMENT_AUDIT_LOGS,
        PERMISSIONS.VIEW_FEE_STRUCTURES,
        PERMISSIONS.VIEW_INVOICES,
        PERMISSIONS.VIEW_FINANCE_REPORTS,
        PERMISSIONS.VIEW_STUDENT_FINANCE,
        PERMISSIONS.VIEW_STAFF_PROFILES,
        PERMISSIONS.VIEW_CERTIFICATIONS,
        PERMISSIONS.APPROVE_LEAVE,
        PERMISSIONS.VIEW_LEAVE_CALENDAR,
        PERMISSIONS.VIEW_PD_REPORTS,
        PERMISSIONS.MANAGE_PERFORMANCE_REVIEWS
    ],
    staff: [
        PERMISSIONS.VIEW_OWN_HR_PROFILE,
        PERMISSIONS.REQUEST_LEAVE,
        PERMISSIONS.VIEW_LEAVE_CALENDAR,
        PERMISSIONS.LOG_PROFESSIONAL_DEVELOPMENT
    ],
    parent: [
        PERMISSIONS.VIEW_SBR_REPORTS
    ],
    student: [
        PERMISSIONS.VIEW_ACADEMIC_EXCELLENCE_STUDENT
    ]
};

// Permission categories for UI grouping
export const PERMISSION_CATEGORIES = {
    attendance: 'Attendance',
    academic: 'Academic',
    operations: 'Operations',
    reports: 'Reports',
    student_services: 'Student Services',
    admin: 'Administration',
    standards_assessment: 'Standards Assessment',
    communication: 'Communication',
    content: 'Content',
    finance: 'Finance',
    hr: 'HR & Staff'
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

