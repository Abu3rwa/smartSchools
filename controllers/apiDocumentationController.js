export const getApiDocumentation = async (req, res) => {
    try {
        const documentation = {
            version: '2.0.0',
            title: 'School Management Platform API Reference',
            description: 'Comprehensive API documentation for the Grade Book and School Management System.',
            baseUrl: process.env.NODE_ENV === 'production' 
                ? process.env.API_URL || 'https://schoolworkso.onrender.com'
                : 'http://localhost:5000',
            categories: [
                {
                    name: 'Authentication & Profile',
                    description: 'User registration, login, session management, and profile updates.',
                    endpoints: [
                        {
                            method: 'POST',
                            path: '/api/auth/login',
                            description: 'Login with email and password to receive a JWT token.',
                            auth: 'None',
                            body: {
                                email: 'string (required)',
                                password: 'string (required)'
                            },
                            response: { success: true, data: { token: 'JWT', refreshToken: 'string', user: 'object' } }
                        },
                        {
                            method: 'GET',
                            path: '/api/auth/me',
                            description: 'Retrieve current authenticated user profile and permissions.',
                            auth: 'Bearer Token',
                            response: { success: true, data: { user: 'object' } }
                        },
                        {
                            method: 'PUT',
                            path: '/api/auth/profile',
                            description: 'Update user personal information (First Name, Last Name, Email).',
                            auth: 'Bearer Token',
                            body: { firstName: 'string', lastName: 'string', email: 'string' },
                            response: { success: true, data: { user: 'object' } }
                        },
                        {
                            method: 'POST',
                            path: '/api/auth/google/url',
                            description: 'Generate Google OAuth2 authorization URL for SSO.',
                            auth: 'None',
                            query: { schoolSlug: 'optional string' },
                            response: { success: true, authUrl: 'string' }
                        }
                    ]
                },
                {
                    name: 'Schools & Academic Context',
                    description: 'Global school settings, academic years, and tenant isolation.',
                    endpoints: [
                        {
                            method: 'GET',
                            path: '/api/schools/me',
                            description: 'Get current school profile, branding, and statistics.',
                            auth: 'Bearer Token (Admin/Staff)',
                            response: { success: true, data: { school: 'object', studentCount: 'number' } }
                        },
                        {
                            method: 'GET',
                            path: '/api/schools/me/academic-years',
                            description: 'List all academic years defined for the school.',
                            auth: 'Bearer Token',
                            response: { success: true, data: { academicYears: ['2024-2025', '...'] } }
                        },
                        {
                            method: 'POST',
                            path: '/api/schools/me/rollover',
                            description: 'Perform academic year rollover (promoting students, copying classes).',
                            auth: 'Bearer Token (Admin)',
                            body: { fromYear: 'string', toYear: 'string', copyClasses: 'boolean' },
                            response: { success: true, message: 'Rollover initiated' }
                        }
                    ]
                },
                {
                    name: 'Students & Guardians',
                    description: 'Student enrollment, profile management, and parent-student links.',
                    endpoints: [
                        {
                            method: 'GET',
                            path: '/api/students',
                            description: 'List students with advanced filtering and pagination.',
                            auth: 'Bearer Token',
                            query: { 
                                class: 'ObjectId', 
                                grade: 'number', 
                                status: 'active/inactive', 
                                search: 'name/email string',
                                page: 'number',
                                limit: 'number'
                            },
                            response: { success: true, data: { students: [], pagination: 'object' } }
                        },
                        {
                            method: 'POST',
                            path: '/api/students',
                            description: 'Enroll a new student.',
                            auth: 'Bearer Token (Admin/Registrar)',
                            body: { 
                                firstName: 'string', 
                                lastName: 'string', 
                                email: 'string', 
                                gender: 'male/female',
                                currentClass: 'ObjectId' 
                            },
                            response: { success: true, data: { student: 'object' } }
                        }
                    ]
                },
                {
                    name: 'Classes & Departments',
                    description: 'Academic departments and classroom/section management.',
                    endpoints: [
                        {
                            method: 'GET',
                            path: '/api/classes',
                            description: 'Get all classes, optionally filtered by academic year or department.',
                            auth: 'Bearer Token',
                            query: { academicYear: 'string', department: 'ObjectId', isActive: 'boolean' },
                            response: { success: true, data: { classes: [] } }
                        },
                        {
                            method: 'POST',
                            path: '/api/classes',
                            description: 'Create a new class section.',
                            auth: 'Bearer Token (Admin)',
                            body: { grade: 'number', section: 'string', academicYear: 'string', room: 'string' },
                            response: { success: true, data: { class: 'object' } }
                        },
                        {
                            method: 'POST',
                            path: '/api/classes/:id/subjects',
                            description: 'Assign a subject and teacher to a class.',
                            auth: 'Bearer Token (Admin)',
                            body: { subjectId: 'ObjectId', teacherId: 'ObjectId' },
                            response: { success: true, data: { class: 'object' } }
                        }
                    ]
                },
                {
                    name: 'Attendance',
                    description: 'Daily and period-based attendance tracking.',
                    endpoints: [
                        {
                            method: 'POST',
                            path: '/api/attendance',
                            description: 'Mark attendance for a class on a specific date.',
                            auth: 'Bearer Token (Teacher/Admin)',
                            body: { 
                                class: 'ObjectId', 
                                date: 'YYYY-MM-DD', 
                                records: [{ student: 'ObjectId', status: 'present/absent/late/excused', remarks: 'string' }]
                            },
                            response: { success: true, data: { attendance: [] } }
                        },
                        {
                            method: 'GET',
                            path: '/api/attendance/stats',
                            description: 'Retrieve attendance percentage and trends for a class or student.',
                            auth: 'Bearer Token',
                            query: { classId: 'ObjectId', studentId: 'ObjectId', range: 'week/month/term' },
                            response: { success: true, data: { stats: 'object' } }
                        }
                    ]
                },
                {
                    name: 'Assignments & Homework',
                    description: 'Creation, publishing, and grading of schoolwork.',
                    endpoints: [
                        {
                            method: 'GET',
                            path: '/api/assignments',
                            description: 'List all generic assignments (tests, quizzes, projects).',
                            auth: 'Bearer Token',
                            query: { class: 'ObjectId', subject: 'ObjectId' },
                            response: { success: true, data: { assignments: [] } }
                        },
                        {
                            method: 'POST',
                            path: '/api/assignments/:id/grades',
                            description: 'Submit grades for an entire class for a specific assignment.',
                            auth: 'Bearer Token (Teacher/Admin)',
                            body: { grades: [{ student: 'ObjectId', score: 'number', feedback: 'string' }] },
                            response: { success: true, message: 'Grades recorded' }
                        },
                        {
                            method: 'POST',
                            path: '/api/homework',
                            description: 'Create a homework task with optional attachments.',
                            auth: 'Bearer Token (Teacher)',
                            body: { title: 'string', subject: 'ObjectId', class: 'ObjectId', dueDate: 'date' },
                            response: { success: true, data: { homework: 'object' } }
                        }
                    ]
                },
                {
                    name: 'Lesson Planning (AI-Powered)',
                    description: 'Teacher lesson plans with AI evaluation against school standards.',
                    endpoints: [
                        {
                            method: 'POST',
                            path: '/api/lessons',
                            description: 'Draft or publish a lesson plan.',
                            auth: 'Bearer Token (Teacher)',
                            body: { title: 'string', objectives: 'string', activities: 'string', materials: 'string' },
                            response: { success: true, data: { lesson: 'object' } }
                        },
                        {
                            method: 'POST',
                            path: '/api/lessons/:id/submit',
                            description: 'Submit lesson plan for AI-driven scoring and feedback.',
                            auth: 'Bearer Token (Teacher)',
                            response: { success: true, data: { evaluation: 'object', score: 'number' } }
                        }
                    ]
                },
                {
                    name: 'Academic Excellence (AI Diagnostics)',
                    description: 'Advanced AI tools for student performance prediction and interventions.',
                    endpoints: [
                        {
                            method: 'GET',
                            path: '/api/academic-excellence/tasks/queue',
                            description: 'Get AI-generated diagnostic tasks for "At Risk" or "Excellence" students.',
                            auth: 'Bearer Token (Teacher/Admin)',
                            response: { success: true, data: { queue: [] } }
                        },
                        {
                            method: 'POST',
                            path: '/api/academic-excellence/ai-practice',
                            description: 'Create personalized AI practice assignments for specific students.',
                            auth: 'Bearer Token (Teacher)',
                            body: { studentIds: ['ObjectId'], topic: 'string', difficulty: 'string' },
                            response: { success: true, data: { assignment: 'object' } }
                        },
                        {
                            method: 'GET',
                            path: '/api/academic-excellence/settings',
                            description: 'Configure school-wide AI diagnostic thresholds.',
                            auth: 'Bearer Token (Admin)',
                            response: { success: true, data: { settings: 'object' } }
                        }
                    ]
                },
                {
                    name: 'Reports & Analytics',
                    description: 'Generation of gradebooks, report cards, and AI summaries.',
                    endpoints: [
                        {
                            method: 'POST',
                            path: '/api/reports/generate-advanced',
                            description: 'Generate a comprehensive AI student report in multiple languages.',
                            auth: 'Bearer Token (Teacher/Admin)',
                            body: { studentId: 'ObjectId', type: 'term/annual', languages: ['en', 'ar', 'fr'] },
                            response: { success: true, data: { reportUrl: 'string' } }
                        },
                        {
                            method: 'GET',
                            path: '/api/sbr/reports',
                            description: 'List generated Standards-Based Reports (SBR).',
                            auth: 'Bearer Token',
                            response: { success: true, data: { reports: [] } }
                        }
                    ]
                },
                {
                    name: 'Communication & Notifications',
                    description: 'Email broadcasts, real-time alerts, and system messages.',
                    endpoints: [
                        {
                            method: 'GET',
                            path: '/api/notifications',
                            description: 'Fetch user-specific notifications (unread first).',
                            auth: 'Bearer Token',
                            response: { success: true, data: { notifications: [] } }
                        },
                        {
                            method: 'POST',
                            path: '/api/communication-email/send',
                            description: 'Broadcast email to specific roles or classes.',
                            auth: 'Bearer Token (Admin)',
                            body: { subject: 'string', content: 'string', recipients: { roles: ['parent'], classes: [] } },
                            response: { success: true, message: 'Emails queued' }
                        }
                    ]
                }
            ]
        };

        res.json({
            success: true,
            data: documentation
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching API documentation',
            error: error.message
        });
    }
};
