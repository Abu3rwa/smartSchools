// Load environment variables FIRST - before any other imports
import dotenv from "dotenv";
dotenv.config();
import cors from "cors";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import mongoSanitize from "express-mongo-sanitize";
import hpp from "hpp";
import compression from "compression";
import path from "path";
import { fileURLToPath } from "url";
import connectDB from "./config/db.js";
import { validateEnvironment } from "./config/validateEnv.js";
import errorHandler, { notFound } from "./middleware/errorHandler.js";
import { connectAi } from "./utils/connectAi.js";
import logger from "./utils/logger.js";

import {
  authRoutes,
  studentRoutes,
  teacherRoutes,
  classRoutes,
  subjectRoutes,
  gradeRoutes,
  notificationRoutes,
  gmailAuthRoutes,
  reportRoutes,
  standardRoutes,
  standardAssignmentRoutes,
  practiceRoutes,
} from "./routes/index.js";
import emailRoutes from "./routes/emailRoutes.js";
import schoolRoutes from "./routes/schoolRoutes.js";
import publicRoutes from "./routes/publicRoutes.js";
import landingRoutes from "./routes/landingRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import subscriptionRoutes from "./routes/subscriptionRoutes.js";
import behaviorRoutes from "./routes/behaviorRoutes.js";
import studentBehaviorRoutes from "./routes/studentBehaviorRoutes.js";
import scheduleRoutes from "./routes/scheduleRoutes.js";
import scheduleRoutesEnhanced from "./routes/scheduleRoutesEnhanced.js";
import attendanceRoutes from "./routes/attendanceRoutes.js";
import attendanceTakingReminderRoutes from "./routes/attendanceTakingReminderRoutes.js";
import lessonPlanRoutes from "./routes/lessonPlanRoutes.js";
import schoolCalendarRoutes from "./routes/schoolCalendarRoutes.js";
import timetableRoutes from "./routes/timetableRoutes.js";
import roomRoutes from "./routes/roomRoutes.js";
import advancedReportRoutes from "./routes/advancedReportRoutes.js";
import { registerApiDocsRoute } from "./routes/apiDocsRoute.js";
import { behaviorTracker } from "./middleware/behaviorTracker.js";
import { processAttendanceReminders } from "./controllers/attendanceReminderController.js";
import newsletterRoutes from "./routes/newsletterRoutes.js";
import revisionRoutes from "./routes/revisionRoutes.js";
import readingRoutes from "./routes/readingRoutes.js";
import departmentRoutes from "./routes/departmentRoutes.js";
import attendanceRequestTypeRoutes from "./routes/attendanceRequestTypeRoutes.js";
import attendanceRequestRoutes from "./routes/attendanceRequestRoutes.js";
import substitutionRoutes from "./routes/substitutionRoutes.js";
import lessonPlanCriteriaRoutes from "./routes/lessonPlanCriteriaRoutes.js";
import apiDocsRoutes from "./routes/apiDocsRoutes.js";
import reviewRoutes from "./routes/reviewRoutes.js";
import interventionRoutes from "./routes/interventionRoutes.js";
import { ensureCurrentWeekIssuesForAllClasses } from "./services/newsletterScheduler.js";
import { expireStaleSubstitutionRequests } from "./services/substitutionExpiryService.js";
import { runReviewSchedulerJob } from "./jobs/reviewSchedulerJob.js";

// Validate environment variables
validateEnvironment();

// Connect to database
connectDB();
const app = express();
// CORS configuration
const allowedOrigins = [
  process.env.CLIENT_URL,
  "http://localhost:5173",
  "https://aqueous-fortress-98392-f4793139e201.herokuapp.com"
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Session-Id",
      "x-session-id",
      "X-Academic-Year",
      "x-academic-year",
    ],
  }),
);

// HTTPS enforcement in production (Heroku)
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect(301, `https://${req.headers.host}${req.url}`);
    }
    next();
  });
}

// Security middleware
app.use(
  helmet({
    contentSecurityPolicy:
      process.env.NODE_ENV === "production" ? undefined : false,
    crossOriginEmbedderPolicy: false,
  }),
);
app.use(mongoSanitize());
app.use(hpp());

// Compression middleware for gzip responses
app.use(compression());

// Rate limiting
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: {
    success: false,
    message: "Too many attempts, please try again later",
  },
});

const isProduction = process.env.NODE_ENV === "production";

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 1000 : 10000,
  message: {
    success: false,
    message: "Too many requests, please try again later",
  },
});
const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    message: "Too many AI requests, please try again later",
  },
});

// Body parser
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Ignore favicon requests
app.get("/favicon.ico", (req, res) => res.status(204).end());

// Health check routes
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "GradeBook API is running",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
  });
});

// Readiness: MongoDB must be connected for the app to serve traffic
app.get("/api/health/ready", async (req, res) => {
  const mongoose = (await import("mongoose")).default;
  const state = mongoose.connection.readyState;
  const connected = state === 1;
  const checks = { mongodb: state === 1 ? "connected" : state === 2 ? "connecting" : "disconnected" };
  res.status(connected ? 200 : 503).json({ ready: connected, checks });
});

// Apply rate limiters
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);
app.use("/api/public/register-school", authLimiter);
app.use("/api/ai", aiLimiter);
if (isProduction) {
  app.use("/api", apiLimiter);
}

// AI test endpoint (with rate limiting)
app.get("/api/ai/test", async (req, res) => {
  try {
    const prompt = req.query.prompt || "Test prompt";
    const result = await connectAi(prompt);
    res.json(result);
  } catch (error) {
    logger.error("AI test endpoint error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Behavior tracking middleware (applies to all API routes)
app.use("/api", behaviorTracker);

// Public routes (no auth required)
app.use("/api/public", publicRoutes);
app.use("/api/landing", landingRoutes);

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/schools", schoolRoutes);
app.use("/api/students", studentRoutes);
app.use("/api/teachers", teacherRoutes);
app.use("/api/classes", classRoutes);
app.use("/api/departments", departmentRoutes);
app.use("/api/attendance-request-types", attendanceRequestTypeRoutes);
app.use("/api/attendance-requests", attendanceRequestRoutes);
app.use("/api/subjects", subjectRoutes);
app.use("/api/grades", gradeRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/auth/gmail", gmailAuthRoutes);
app.use("/api/email", emailRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/reports", advancedReportRoutes);
app.use("/api/users", userRoutes);
app.use("/api/subscriptions", subscriptionRoutes);
app.use("/api/behavior", behaviorRoutes);
app.use("/api/student-behavior", studentBehaviorRoutes);
app.use("/api/schedules", scheduleRoutes);
app.use("/api/schedules-enhanced", scheduleRoutesEnhanced);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/attendance-taking-reminders", attendanceTakingReminderRoutes);
app.use("/api/lessons", lessonPlanRoutes);
app.use("/api/lesson-plan-criteria", lessonPlanCriteriaRoutes);
app.use("/api/school-calendar", schoolCalendarRoutes);
app.use("/api/timetable", timetableRoutes);
app.use("/api/rooms", roomRoutes);
app.use("/api/newsletters", newsletterRoutes);
app.use("/api/standards", standardRoutes);
app.use("/api/standard-assignments", standardAssignmentRoutes);
app.use("/api/practice", practiceRoutes);
app.use("/api/revision", revisionRoutes);
app.use("/api/reading", readingRoutes);
app.use("/api/substitutions", substitutionRoutes);
app.use("/api/review", reviewRoutes);
app.use("/api/interventions", interventionRoutes);
app.use("/api/docs", apiDocsRoutes);

registerApiDocsRoute(app);

// Serve uploaded files (attendance request attachments)
const __dirnameServer = path.dirname(fileURLToPath(import.meta.url));
app.use("/uploads", express.static(path.join(__dirnameServer, "uploads")));

// Serve static assets in production

if (process.env.NODE_ENV === "production") {
  const __dirname = __dirnameServer;

  app.use(express.static(path.join(__dirname, "client/dist")));

  app.get("*", (req, res) => {
    res.sendFile(path.resolve(__dirname, "client", "dist", "index.html"));
  });
} else {
  app.get("/", (req, res) => {
    res.send("API is running...");
  });
}

// Handle 404 errors
app.use(notFound);

// Global error handler
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 5000;

const REMINDER_JOB_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const NEWSLETTER_ISSUE_SCHEDULER_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const REVIEW_SCHEDULER_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

const server = app.listen(PORT, () => {
  logger.info(`Server is running on port ${PORT}`);
  if (process.env.RUN_ATTENDANCE_REMINDER_JOB !== "false") {
    // Run once on startup (after 1 min), then every 15 min
    logger.info("Attendance reminder job scheduled (every 15 min). Run once on startup in 1 min.");
    const runReminderJob = async () => {
      try {
        const result = await processAttendanceReminders();
        const { processed, sent, skipped, failed } = result?.results ?? {};
        if (processed > 0 || sent > 0 || failed > 0) {
          logger.info("Attendance reminder job", {
            processed: processed ?? 0,
            sent: sent ?? 0,
            skipped: skipped ?? 0,
            failed: failed ?? 0,
          });
        }
      } catch (err) {
        logger.error("Attendance reminder job error:", err?.message || err);
      }
    };
    setTimeout(runReminderJob, 60 * 1000);
    setInterval(runReminderJob, REMINDER_JOB_INTERVAL_MS);
  }

  // Substitution expiry: mark stale SUBMITTED requests as EXPIRED
  if (process.env.RUN_SUBSTITUTION_EXPIRY_JOB !== "false") {
    const SUBSTITUTION_EXPIRY_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
    setInterval(async () => {
      try {
        await expireStaleSubstitutionRequests();
      } catch (err) {
        logger.error("Substitution expiry job error:", err?.message || err);
      }
    }, SUBSTITUTION_EXPIRY_INTERVAL_MS);
  }

  // Optional scheduler: ensure weekly issues exist for all classes (idempotent).
  if (process.env.RUN_NEWSLETTER_ISSUE_SCHEDULER !== "false") {
    // Run once on startup, then periodically.
    ensureCurrentWeekIssuesForAllClasses(new Date()).catch((err) => {
      logger.error("Newsletter issue scheduler startup error:", err?.message || err);
    });
    setInterval(async () => {
      try {
        await ensureCurrentWeekIssuesForAllClasses(new Date());
      } catch (err) {
        logger.error("Newsletter issue scheduler error:", err?.message || err);
      }
    }, NEWSLETTER_ISSUE_SCHEDULER_INTERVAL_MS);
  }

  if (process.env.RUN_REVIEW_SCHEDULER_JOB !== "false") {
    runReviewSchedulerJob().catch((err) => {
      logger.error("Review scheduler startup error:", err?.message || err);
    });

    setInterval(async () => {
      try {
        await runReviewSchedulerJob();
      } catch (err) {
        logger.error("Review scheduler job error:", err?.message || err);
      }
    }, REVIEW_SCHEDULER_INTERVAL_MS);
  }
});

// Graceful shutdown handling
const gracefulShutdown = async (signal) => {
  logger.info(`${signal} received. Starting graceful shutdown...`);
  
  try {
    // Stop accepting new requests
    if (server) {
      await new Promise((resolve) => {
        server.close(() => {
          logger.info('HTTP server closed');
          resolve();
        });
      });
    }

    // Close database connection
    const mongoose = (await import('mongoose')).default;
    await mongoose.connection.close();
    logger.info('MongoDB connection closed');

    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during graceful shutdown:', error);
    process.exit(1);
  }
};

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('UNHANDLED_REJECTION');
});

export default app;
