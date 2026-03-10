export const getApiDocumentation = async (req, res) => {
    try {
        const documentation = {
            version: '1.0.0',
            title: 'GradeBook API Documentation',
            description: 'Complete API reference for the GradeBook school management system',
            baseUrl: process.env.NODE_ENV === 'production' 
                ? process.env.API_URL || 'https://your-app.herokuapp.com'
                : 'http://localhost:5000',
            categories: [
                {
                    name: 'Authentication',
                    description: 'User authentication and authorization endpoints',
                    endpoints: [
                        {
                            method: 'POST',
                            path: '/api/auth/register',
                            description: 'Register a new user account',
                            auth: 'None',
                            body: {
                                email: 'string (required)',
                                password: 'string (required)',
                                firstName: 'string (required)',
                                lastName: 'string (required)',
                                role: 'string (required): admin, teacher, parent, student'
                            },
                            response: { success: true, token: 'JWT token', user: 'User object' }
                        },
                        {
                            method: 'POST',
                            path: '/api/auth/login',
                            description: 'Login with email and password',
                            auth: 'None',
                            body: { email: 'string', password: 'string' },
                            response: { success: true, token: 'JWT token', user: 'User object' }
                        },
                        {
                            method: 'GET',
                            path: '/api/auth/me',
                            description: 'Get current authenticated user',
                            auth: 'Bearer Token',
                            response: { success: true, data: { user: 'User object' } }
                        },
                        {
                            method: 'PUT',
                            path: '/api/auth/profile',
                            description: 'Update user profile',
                            auth: 'Bearer Token',
                            body: { firstName: 'string', lastName: 'string', email: 'string' },
                            response: { success: true, data: { user: 'Updated user' } }
                        },
                        {
                            method: 'POST',
                            path: '/api/auth/forgot-password',
                            description: 'Request password reset email',
                            auth: 'None',
                            body: { email: 'string' },
                            response: { success: true, message: 'Reset email sent' }
                        },
                        {
                            method: 'POST',
                            path: '/api/auth/reset-password/:token',
                            description: 'Reset password with token',
                            auth: 'None',
                            body: { password: 'string' },
                            response: { success: true, message: 'Password reset successful' }
                        }
                    ]
                },
                {
                    name: 'Schools',
                    description: 'School management endpoints',
                    endpoints: [
                        {
                            method: 'GET',
                            path: '/api/schools/me',
                            description: 'Get current user\'s school information',
                            auth: 'Bearer Token',
                            response: { success: true, data: { school: 'School object' } }
                        },
                        {
                            method: 'PUT',
                            path: '/api/schools/me',
                            description: 'Update school information',
                            auth: 'Bearer Token (Admin only)',
                            body: { name: 'string', address: 'string', phone: 'string' },
                            response: { success: true, data: { school: 'Updated school' } }
                        },
                        {
                            method: 'GET',
                            path: '/api/schools/me/academic-years',
                            description: 'Get all academic years for school',
                            auth: 'Bearer Token (Admin only)',
                            response: { success: true, data: { academicYears: ['2023-2024', '2024-2025'] } }
                        }
                    ]
                },
                {
                    name: 'Students',
                    description: 'Student management endpoints',
                    endpoints: [
                        {
                            method: 'GET',
                            path: '/api/students',
                            description: 'Get all students (with filters)',
                            auth: 'Bearer Token',
                            query: { class: 'classId', grade: 'number', search: 'string', page: 'number', limit: 'number' },
                            response: { success: true, data: { students: [], pagination: {} } }
                        },
                        {
                            method: 'POST',
                            path: '/api/students',
                            description: 'Create a new student',
                            auth: 'Bearer Token (Admin/Teacher)',
                            body: { firstName: 'string', lastName: 'string', email: 'string', dateOfBirth: 'date', class: 'classId' },
                            response: { success: true, data: { student: 'Student object' } }
                        },
                        {
                            method: 'GET',
                            path: '/api/students/:id',
                            description: 'Get student by ID',
                            auth: 'Bearer Token',
                            response: { success: true, data: { student: 'Student object' } }
                        },
                        {
                            method: 'PUT',
                            path: '/api/students/:id',
                            description: 'Update student information',
                            auth: 'Bearer Token (Admin/Teacher)',
                            body: { firstName: 'string', lastName: 'string', class: 'classId' },
                            response: { success: true, data: { student: 'Updated student' } }
                        },
                        {
                            method: 'DELETE',
                            path: '/api/students/:id',
                            description: 'Delete student',
                            auth: 'Bearer Token (Admin only)',
                            response: { success: true, message: 'Student deleted' }
                        }
                    ]
                },
                {
                    name: 'Teachers',
                    description: 'Teacher management endpoints',
                    endpoints: [
                        {
                            method: 'GET',
                            path: '/api/teachers',
                            description: 'Get all teachers',
                            auth: 'Bearer Token',
                            response: { success: true, data: { teachers: [] } }
                        },
                        {
                            method: 'GET',
                            path: '/api/teachers/my-classes',
                            description: 'Get current teacher\'s assigned classes',
                            auth: 'Bearer Token (Teacher)',
                            response: { success: true, data: { classes: [] } }
                        }
                    ]
                },
                {
                    name: 'Classes',
                    description: 'Class management endpoints',
                    endpoints: [
                        {
                            method: 'GET',
                            path: '/api/classes',
                            description: 'Get all classes',
                            auth: 'Bearer Token',
                            query: { academicYear: 'string', department: 'departmentId', isActive: 'boolean' },
                            response: { success: true, data: { classes: [] } }
                        },
                        {
                            method: 'POST',
                            path: '/api/classes',
                            description: 'Create a new class',
                            auth: 'Bearer Token (Admin)',
                            body: { name: 'string', grade: 'number', section: 'string', academicYear: 'string' },
                            response: { success: true, data: { class: 'Class object' } }
                        },
                        {
                            method: 'GET',
                            path: '/api/classes/:id',
                            description: 'Get class by ID with students',
                            auth: 'Bearer Token',
                            response: { success: true, data: { class: 'Class object with students' } }
                        },
                        {
                            method: 'PUT',
                            path: '/api/classes/:id',
                            description: 'Update class information',
                            auth: 'Bearer Token (Admin)',
                            body: { name: 'string', teacher: 'teacherId', isActive: 'boolean' },
                            response: { success: true, data: { class: 'Updated class' } }
                        }
                    ]
                },
                {
                    name: 'Subjects',
                    description: 'Subject management endpoints',
                    endpoints: [
                        {
                            method: 'GET',
                            path: '/api/subjects',
                            description: 'Get all subjects',
                            auth: 'Bearer Token',
                            response: { success: true, data: { subjects: [] } }
                        },
                        {
                            method: 'POST',
                            path: '/api/subjects',
                            description: 'Create a new subject',
                            auth: 'Bearer Token (Admin)',
                            body: { name: 'string', code: 'string', description: 'string' },
                            response: { success: true, data: { subject: 'Subject object' } }
                        }
                    ]
                },
                {
                    name: 'Attendance',
                    description: 'Attendance tracking endpoints',
                    endpoints: [
                        {
                            method: 'GET',
                            path: '/api/attendance',
                            description: 'Get attendance records',
                            auth: 'Bearer Token',
                            query: { class: 'classId', date: 'YYYY-MM-DD', student: 'studentId' },
                            response: { success: true, data: { attendance: [] } }
                        },
                        {
                            method: 'POST',
                            path: '/api/attendance',
                            description: 'Mark attendance for students',
                            auth: 'Bearer Token (Teacher/Admin)',
                            body: { class: 'classId', date: 'date', records: [{ student: 'studentId', status: 'present/absent/late' }] },
                            response: { success: true, data: { attendance: [] } }
                        },
                        {
                            method: 'GET',
                            path: '/api/attendance/stats',
                            description: 'Get attendance statistics',
                            auth: 'Bearer Token',
                            query: { class: 'classId', startDate: 'date', endDate: 'date' },
                            response: { success: true, data: { stats: {} } }
                        }
                    ]
                },
                {
                    name: 'Lesson Plans',
                    description: 'Lesson plan management and AI evaluation endpoints',
                    endpoints: [
                        {
                            method: 'GET',
                            path: '/api/lessons',
                            description: 'Get lesson plans (filtered)',
                            auth: 'Bearer Token',
                            query: { class: 'classId', subject: 'subjectId', startDate: 'date', endDate: 'date', page: 'number' },
                            response: { success: true, data: { lessons: [], pagination: {} } }
                        },
                        {
                            method: 'POST',
                            path: '/api/lessons',
                            description: 'Create a new lesson plan',
                            auth: 'Bearer Token (Teacher/Admin)',
                            body: { class: 'classId', subject: 'subjectId', date: 'date', title: 'string', learningObjectives: 'string', activities: 'string' },
                            response: { success: true, data: { lesson: 'Lesson plan object' } }
                        },
                        {
                            method: 'POST',
                            path: '/api/lessons/:id/submit',
                            description: 'Submit lesson plan for AI evaluation',
                            auth: 'Bearer Token (Teacher)',
                            response: { success: true, data: { lesson: 'Evaluated lesson', evaluation: {} } }
                        },
                        {
                            method: 'GET',
                            path: '/api/lessons/admin/review',
                            description: 'Get lesson plans for admin review',
                            auth: 'Bearer Token (Admin/Department Principal)',
                            query: { status: 'submitted/approved/needs_revision', teacher: 'teacherId', meetsRequirements: 'boolean' },
                            response: { success: true, data: { lessons: [], stats: {} } }
                        },
                        {
                            method: 'POST',
                            path: '/api/lessons/:id/review',
                            description: 'Manual admin review of lesson plan',
                            auth: 'Bearer Token (Admin/Department Principal)',
                            body: { comments: 'string', finalStatus: 'approved/needs_revision/rejected' },
                            response: { success: true, data: { lesson: 'Reviewed lesson' } }
                        },
                        {
                            method: 'GET',
                            path: '/api/lessons/stats',
                            description: 'Get lesson plan statistics',
                            auth: 'Bearer Token (Admin/Department Principal)',
                            response: { success: true, data: { statusBreakdown: {}, averageScores: {}, topTeachers: [] } }
                        }
                    ]
                },
                {
                    name: 'Lesson Plan Criteria',
                    description: 'Manage school-defined lesson plan evaluation criteria',
                    endpoints: [
                        {
                            method: 'GET',
                            path: '/api/lesson-plan-criteria',
                            description: 'Get all evaluation criteria',
                            auth: 'Bearer Token (Admin)',
                            response: { success: true, data: [] }
                        },
                        {
                            method: 'POST',
                            path: '/api/lesson-plan-criteria',
                            description: 'Create new evaluation criterion',
                            auth: 'Bearer Token (Admin)',
                            body: { name: 'string', description: 'string', weight: 'number (1-5)', minScore: 'number (0-100)', isRequired: 'boolean', evaluationPrompt: 'string' },
                            response: { success: true, data: 'Criterion object' }
                        },
                        {
                            method: 'POST',
                            path: '/api/lesson-plan-criteria/initialize-defaults',
                            description: 'Initialize 6 default criteria',
                            auth: 'Bearer Token (Admin)',
                            response: { success: true, message: 'Default criteria initialized', count: 6 }
                        },
                        {
                            method: 'PATCH',
                            path: '/api/lesson-plan-criteria/reorder',
                            description: 'Reorder criteria',
                            auth: 'Bearer Token (Admin)',
                            body: { criteriaIds: ['id1', 'id2', 'id3'] },
                            response: { success: true, message: 'Criteria reordered' }
                        },
                        {
                            method: 'PUT',
                            path: '/api/lesson-plan-criteria/:id',
                            description: 'Update criterion',
                            auth: 'Bearer Token (Admin)',
                            body: { name: 'string', weight: 'number', minScore: 'number' },
                            response: { success: true, data: 'Updated criterion' }
                        },
                        {
                            method: 'DELETE',
                            path: '/api/lesson-plan-criteria/:id',
                            description: 'Delete (deactivate) criterion',
                            auth: 'Bearer Token (Admin)',
                            response: { success: true, message: 'Criterion deactivated' }
                        }
                    ]
                },
                {
                    name: 'Departments',
                    description: 'Department management endpoints',
                    endpoints: [
                        {
                            method: 'GET',
                            path: '/api/departments',
                            description: 'Get all departments',
                            auth: 'Bearer Token',
                            response: { success: true, data: { departments: [] } }
                        },
                        {
                            method: 'POST',
                            path: '/api/departments',
                            description: 'Create department',
                            auth: 'Bearer Token (Admin)',
                            body: { name: 'string', type: 'academic/administrative', description: 'string' },
                            response: { success: true, data: { department: 'Department object' } }
                        },
                        {
                            method: 'PUT',
                            path: '/api/departments/:id',
                            description: 'Update department',
                            auth: 'Bearer Token (Admin)',
                            body: { name: 'string', description: 'string' },
                            response: { success: true, data: { department: 'Updated department' } }
                        },
                        {
                            method: 'DELETE',
                            path: '/api/departments/:id',
                            description: 'Delete department',
                            auth: 'Bearer Token (Admin)',
                            response: { success: true, message: 'Department deleted' }
                        }
                    ]
                },
                {
                    name: 'Notifications',
                    description: 'Notification and messaging endpoints',
                    endpoints: [
                        {
                            method: 'GET',
                            path: '/api/notifications',
                            description: 'Get user notifications',
                            auth: 'Bearer Token',
                            query: { page: 'number', limit: 'number', unreadOnly: 'boolean' },
                            response: { success: true, data: { notifications: [], pagination: {} } }
                        },
                        {
                            method: 'PATCH',
                            path: '/api/notifications/:id/read',
                            description: 'Mark notification as read',
                            auth: 'Bearer Token',
                            response: { success: true, data: { notification: 'Updated notification' } }
                        },
                        {
                            method: 'PATCH',
                            path: '/api/notifications/mark-all-read',
                            description: 'Mark all notifications as read',
                            auth: 'Bearer Token',
                            response: { success: true, message: 'All notifications marked as read' }
                        }
                    ]
                },
                {
                    name: 'Reports',
                    description: 'AI-powered reporting endpoints',
                    endpoints: [
                        {
                            method: 'POST',
                            path: '/api/reports/generate-advanced',
                            description: 'Generate AI-powered student report',
                            auth: 'Bearer Token (Teacher/Admin)',
                            body: { studentId: 'string', reportType: 'weekly/monthly/custom', requestedLanguages: ['en', 'ar'], language: 'legacy optional', recipients: {} },
                            response: { success: true, data: { report: 'Generated report', emailStatus: {} } }
                        },
                        {
                            method: 'GET',
                            path: '/api/reports/history',
                            description: 'Get report generation history',
                            auth: 'Bearer Token',
                            response: { success: true, data: { reports: [] } }
                        }
                    ]
                },
                {
                    name: 'Behavior',
                    description: 'Student behavior tracking endpoints',
                    endpoints: [
                        {
                            method: 'GET',
                            path: '/api/student-behavior',
                            description: 'Get behavior records',
                            auth: 'Bearer Token',
                            query: { student: 'studentId', class: 'classId', startDate: 'date', endDate: 'date' },
                            response: { success: true, data: { records: [] } }
                        },
                        {
                            method: 'POST',
                            path: '/api/student-behavior',
                            description: 'Create behavior record',
                            auth: 'Bearer Token (Teacher/Admin)',
                            body: { student: 'studentId', type: 'positive/negative', category: 'string', description: 'string', points: 'number' },
                            response: { success: true, data: { record: 'Behavior record' } }
                        }
                    ]
                },
                {
                    name: 'Timetable',
                    description: 'Class timetable and scheduling endpoints',
                    endpoints: [
                        {
                            method: 'GET',
                            path: '/api/timetable',
                            description: 'Get timetable assignments',
                            auth: 'Bearer Token',
                            query: { class: 'classId', teacher: 'teacherId', day: 'Monday-Friday' },
                            response: { success: true, data: { assignments: [] } }
                        },
                        {
                            method: 'POST',
                            path: '/api/timetable',
                            description: 'Create timetable assignment',
                            auth: 'Bearer Token (Admin)',
                            body: { class: 'classId', subject: 'subjectId', teacher: 'teacherId', day: 'string', period: 'number', room: 'string' },
                            response: { success: true, data: { assignment: 'Timetable assignment' } }
                        }
                    ]
                },
                {
                    name: 'Substitutions',
                    description: 'Teacher substitution management',
                    endpoints: [
                        {
                            method: 'GET',
                            path: '/api/substitutions',
                            description: 'Get substitution requests',
                            auth: 'Bearer Token',
                            query: { status: 'pending/approved/rejected', date: 'date' },
                            response: { success: true, data: { substitutions: [] } }
                        },
                        {
                            method: 'POST',
                            path: '/api/substitutions',
                            description: 'Create substitution request',
                            auth: 'Bearer Token (Teacher)',
                            body: { date: 'date', period: 'number', reason: 'string', class: 'classId' },
                            response: { success: true, data: { substitution: 'Substitution request' } }
                        },
                        {
                            method: 'PATCH',
                            path: '/api/substitutions/:id/assign',
                            description: 'Assign substitute teacher',
                            auth: 'Bearer Token (Admin)',
                            body: { substituteTeacher: 'teacherId' },
                            response: { success: true, data: { substitution: 'Updated substitution' } }
                        }
                    ]
                },
                {
                    name: 'Attendance Requests',
                    description: 'Student attendance request management',
                    endpoints: [
                        {
                            method: 'GET',
                            path: '/api/attendance-requests',
                            description: 'Get attendance requests',
                            auth: 'Bearer Token',
                            query: { status: 'pending/approved/rejected', student: 'studentId' },
                            response: { success: true, data: { requests: [] } }
                        },
                        {
                            method: 'POST',
                            path: '/api/attendance-requests',
                            description: 'Create attendance request',
                            auth: 'Bearer Token (Parent/Student)',
                            body: { student: 'studentId', date: 'date', reason: 'string', type: 'typeId' },
                            response: { success: true, data: { request: 'Attendance request' } }
                        },
                        {
                            method: 'PATCH',
                            path: '/api/attendance-requests/:id/review',
                            description: 'Review attendance request',
                            auth: 'Bearer Token (Admin/Teacher)',
                            body: { status: 'approved/rejected', comments: 'string' },
                            response: { success: true, data: { request: 'Updated request' } }
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
