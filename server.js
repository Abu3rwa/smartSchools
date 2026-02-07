// Load environment variables FIRST - before any other imports
import dotenv from 'dotenv';
dotenv.config();
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';
import hpp from 'hpp';
import connectDB from './config/db.js';
import errorHandler, { notFound } from './middleware/errorHandler.js';
import { connectAi } from './utils/connectAi.js';

import {
    authRoutes,
    studentRoutes,
    teacherRoutes,
    classRoutes,
    subjectRoutes,
    gradeRoutes,
    notificationRoutes,
    gmailAuthRoutes,
    reportRoutes
} from './routes/index.js';
import emailRoutes from './routes/emailRoutes.js';
import schoolRoutes from './routes/schoolRoutes.js';
import publicRoutes from './routes/publicRoutes.js';
import landingRoutes from './routes/landingRoutes.js';
import userRoutes from './routes/userRoutes.js';
import subscriptionRoutes from './routes/subscriptionRoutes.js';
import behaviorRoutes from './routes/behaviorRoutes.js';
import scheduleRoutes from './routes/scheduleRoutes.js';
import scheduleRoutesEnhanced from './routes/scheduleRoutesEnhanced.js';
import attendanceRoutes from './routes/attendanceRoutes.js';
import schoolCalendarRoutes from './routes/schoolCalendarRoutes.js';
import timetableRoutes from './routes/timetableRoutes.js';
import roomRoutes from './routes/roomRoutes.js';
import advancedReportRoutes from './routes/advancedReportRoutes.js';
import { behaviorTracker } from './middleware/behaviorTracker.js';

// Connect to database
connectDB();
const app = express();

app.get('/api/ai/test', async (req, res) => {
    const prompt = req.query.prompt || 'Test prompt';
    const result = await connectAi(prompt);
    res.json(result);
});
// CORS configuration
app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Security middleware
app.use(helmet({
    contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
    crossOriginEmbedderPolicy: false
}));
app.use(mongoSanitize());
app.use(hpp());

// Rate limiting
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { success: false, message: 'Too many attempts, please try again later' }
});
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    message: { success: false, message: 'Too many requests, please try again later' }
});

// Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Ignore favicon requests
app.get('/favicon.ico', (req, res) => res.status(204).end());

// Health check route
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        message: 'GradeBook API is running',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// Apply rate limiters
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/public/register-school', authLimiter);
app.use('/api', apiLimiter);

// Behavior tracking middleware (applies to all API routes)
app.use('/api', behaviorTracker);

// Public routes (no auth required)
app.use('/api/public', publicRoutes);
app.use('/api/landing', landingRoutes);

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/schools', schoolRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/teachers', teacherRoutes);
app.use('/api/classes', classRoutes);
app.use('/api/subjects', subjectRoutes);
app.use('/api/grades', gradeRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/auth/gmail', gmailAuthRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/reports', advancedReportRoutes);
app.use('/api/users', userRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/behavior', behaviorRoutes);
app.use('/api/schedules', scheduleRoutes);
app.use('/api/schedules-enhanced', scheduleRoutesEnhanced);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/school-calendar', schoolCalendarRoutes);
app.use('/api/timetable', timetableRoutes);
app.use('/api/rooms', roomRoutes);

// API documentation route (development only)
if (process.env.NODE_ENV !== 'production') {
    app.get('/api', (req, res) => {
        res.json({
            success: true,
            message: 'GradeBook API v1.0',
            endpoints: {
                auth: {
                    'POST /api/auth/register': 'Register a new user',
                    'POST /api/auth/login': 'Login user',
                    'GET /api/auth/me': 'Get current user',
                    'PUT /api/auth/profile': 'Update profile',
                    'PUT /api/auth/password': 'Change password'
                },
                students: {
                    'GET /api/students': 'Get all students',
                    'POST /api/students': 'Create student',
                    'GET /api/students/:id': 'Get student by ID',
                    'PUT /api/students/:id': 'Update student',
                    'DELETE /api/students/:id': 'Delete student',
                    'GET /api/students/class/:classId': 'Get students by class'
                },
                teachers: {
                    'GET /api/teachers': 'Get all teachers',
                    'POST /api/teachers': 'Create teacher',
                    'GET /api/teachers/:id': 'Get teacher by ID',
                    'PUT /api/teachers/:id': 'Update teacher',
                    'POST /api/teachers/:id/assign-class': 'Assign class to teacher',
                    'GET /api/teachers/my-classes': 'Get teacher\'s assigned classes'
                },
                classes: {
                    'GET /api/classes': 'Get all classes',
                    'POST /api/classes': 'Create class',
                    'GET /api/classes/:id': 'Get class by ID',
                    'POST /api/classes/:id/subjects': 'Add subject to class',
                    'GET /api/classes/:id/stats': 'Get class statistics'
                },
                subjects: {
                    'GET /api/subjects': 'Get all subjects',
                    'POST /api/subjects': 'Create subject',
                    'GET /api/subjects/grade/:grade': 'Get subjects by grade'
                },
                grades: {
                    'POST /api/grades/daily': 'Add daily grade',
                    'POST /api/grades/bulk': 'Bulk add grades',
                    'POST /api/grades/exam': 'Add exam grade',
                    'GET /api/grades/student/:studentId': 'Get student grades',
                    'GET /api/grades/report/:studentId': 'Get student grade report',
                    'GET /api/grades/average/monthly/:studentId': 'Get monthly average',
                    'GET /api/grades/average/semester/:studentId': 'Get semester average',
                    'GET /api/grades/average/overall/:studentId': 'Get overall average'
                },
                notifications: {
                    'POST /api/notifications/grade-update': 'Send grade update notification',
                    'POST /api/notifications/daily-report/:studentId': 'Send daily report',
                    'POST /api/notifications/monthly-report/:studentId': 'Send monthly report',
                    'POST /api/notifications/class/:classId': 'Send class notifications',
                    'GET /api/notifications': 'Get notification history'
                }
            }
        });
    });
}

// Serve static assets in production
import path from 'path';
import { fileURLToPath } from 'url';
 
if (process.env.NODE_ENV === 'production') {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    app.use(express.static(path.join(__dirname, 'client/dist')));

    app.get('*', (req, res) => {
        res.sendFile(path.resolve(__dirname, 'client', 'dist', 'index.html'));
    });
} else {
    app.get('/', (req, res) => {
        res.send('API is running...');
    });
}

// Handle 404 errors
app.use(notFound);

// Global error handler
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log("Server is running");
});

export default app;
