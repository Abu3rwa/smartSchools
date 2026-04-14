// Load environment variables FIRST - before any other imports
import dotenv from "dotenv";
dotenv.config();
import cors from "cors";
import express from "express";
import helmet from "helmet";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import mongoSanitize from "express-mongo-sanitize";
import hpp from "hpp";
import compression from "compression";
import { createServer } from "http";
import connectDB from "./config/db.js";
import { validateEnvironment } from "./config/validateEnv.js";
import errorHandler, { notFound } from "./middleware/errorHandler.js";
import correlationId from "./middleware/correlationId.js";
import aiTokenBudgetGuard from "./middleware/aiTokenBudgetGuard.js";
import paginationMiddleware from "./middleware/pagination.js";
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
import importRoutes from "./routes/importRoutes.js";
import advancedReportRoutes from "./routes/advancedReportRoutes.js";
import { registerApiDocsRoute } from "./routes/apiDocsRoute.js";
import { behaviorTracker } from "./middleware/behaviorTracker.js";
import newsletterRoutes from "./routes/newsletterRoutes.js";
import newsletterTemplateRoutes from "./routes/newsletterTemplateRoutes.js";
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
import parentRoutes from "./routes/parentRoutes.js";
import assessmentRoutes from "./routes/assessmentRoutes.js";
import messageRoutes from "./routes/messageRoutes.js";
import deviceRoutes from "./routes/deviceRoutes.js";
import homeworkRoutes from "./routes/homeworkRoutes.js";
import assignmentRoutes from "./routes/assignmentRoutes.js";
import assignmentTypeRoutes from "./routes/assignmentTypeRoutes.js";
import gradingScaleRoutes from "./routes/gradingScaleRoutes.js";
import gradebookConfigRoutes from "./routes/gradebookConfigRoutes.js";
import gradebookColumnRoutes from "./routes/gradebookColumnRoutes.js";
import formulaRoutes from "./routes/formulaRoutes.js";
import reportCardRoutes from "./routes/reportCardRoutes.js";
import templateRoutes from "./routes/templateRoutes.js";
import analyticsRoutes from "./routes/analyticsRoutes.js";
import parentGradebookRoutes from "./routes/parentGradebookRoutes.js";
import calendarRoutes from "./routes/calendarRoutes.js";
import communicationEmailRoutes from "./routes/communicationEmailRoutes.js";
import curriculumMapRoutes from "./routes/curriculumMapRoutes.js";
import curriculumSettingsRoutes from "./routes/curriculumSettingsRoutes.js";
import academicExcellenceRoutes from "./routes/academicExcellenceRoutes.js";
import sbrRoutes from "./routes/sbrRoutes.js";
import reteachTaskRoutes from "./routes/reteachTaskRoutes.js";
import studentGroupingRoutes from "./routes/studentGroupingRoutes.js";
import googleDriveAuthRoutes from "./routes/googleDriveAuthRoutes.js";
import presentationRoutes from "./routes/presentationRoutes.js";
import worksheetRoutes from "./routes/worksheetRoutes.js";
import financeRoutes from "./routes/financeRoutes.js";
import hrRoutes from "./routes/hrRoutes.js";
import standardAssessmentFeatureRoutes from "./routes/standardAssessmentRoutes.js";
import { ensureCurrentWeekIssuesForAllClasses } from "./services/newsletterScheduler.js";
import { expireStaleSubstitutionRequests } from "./services/substitutionExpiryService.js";
import { runReviewSchedulerJob } from "./jobs/reviewSchedulerJob.js";
import { runSubscriptionLifecycleJob } from "./jobs/subscriptionLifecycleJob.js";
import { processDueScheduledCommunicationEmails } from "./services/communicationEmailSchedulerService.js";
import { processAttendanceRemindersForEnabledSchools } from "./controllers/attendanceReminderController.js";
import { runCurriculumImportJobCycle } from "./jobs/curriculumAiImportJobRunner.js";
import { runAcademicExcellenceNightlyJob } from "./jobs/academicExcellenceSyncJob.js";
import { initRealtimeGateway } from "./realtime/realtimeGateway.js";
import { validateTenantIsolation } from "./utils/validateTenantIsolation.js";
// Validate environment variables
validateEnvironment();
// Connect to database
connectDB();
const app = express();
app.set("trust proxy", 1); // Render single-proxy; update if adding Cloudflare
// CORS configuration — BE-007: origins from env var
const allowedOrigins = [
  process.env.CLIENT_URL,
  ...(process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean),
  // Fallback defaults kept for backward compatibility
  "http://localhost:5173",
]
  .map((origin) => (typeof origin === "string" ? origin.trim() : origin))
  .filter(Boolean);

const isAllowedFirebaseOrigin = (origin) => {
  if (!origin) return false;
  // Restrict to known Firebase project prefix instead of wildcard
  const projectPrefix = process.env.FIREBASE_PROJECT_ID || 'smile3-8c8c5';
  return (
    origin === `https://${projectPrefix}.web.app` ||
    origin === `https://${projectPrefix}.firebaseapp.com`
  );
};

const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  return allowedOrigins.includes(origin) || isAllowedFirebaseOrigin(origin);
};

app.use(
  cors({
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
      } else {
        logger.warn("cors_origin_blocked", {
          origin,
          allowedOrigins,
        });
        callback(new Error("Not allowed by CORS"));
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

// HTTPS enforcement in production behind a reverse proxy (Render/Heroku/etc.)
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    // Never redirect preflight OPTIONS requests — let CORS middleware handle them
    if (req.method === 'OPTIONS') return next();
    if (req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect(301, `https://${req.headers.host}${req.url}`);
    }
    next();
  });
}

// BE-030: Correlation ID for request tracing
app.use(correlationId);

// Security middleware — BE-005: explicit CSP directives
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", process.env.CLIENT_URL, "https://generativelanguage.googleapis.com"].filter(Boolean),
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      }
    },
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

// BE-034: Key generator for per-user rate limiting (falls back to IP for unauthenticated requests)
const userKeyGenerator = (req) => {
  if (req.user?._id) return `user_${req.user._id}`;
  return ipKeyGenerator(req.ip);
};

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 1000 : 10000,
  keyGenerator: userKeyGenerator,
  message: {
    success: false,
    message: "Too many requests, please try again later",
  },
});
const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: userKeyGenerator,
  message: {
    success: false,
    message: "Too many AI requests, please try again later",
  },
});

// Body parser — BE-032: reduced default limit
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// BE-021: Global pagination defaults for list endpoints
app.use("/api", paginationMiddleware);

// Ignore favicon requests
app.get("/favicon.ico", (req, res) => res.status(204).end());

// Health check routes
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Platform API is running",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
  });
});

// Readiness: MongoDB must be connected for the app to serve traffic
app.get("/api/health/ready", async (req, res) => {
  const mongoose = (await import("mongoose")).default;
  const state = mongoose.connection.readyState;
  const connected = state === 1;
  const checks = {
    mongodb: state === 1 ? "connected" : state === 2 ? "connecting" : "disconnected",
  };

  // BE-031: check external dependencies
  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    checks.aiService = process.env.GEMINI_API_KEY ? 'configured' : 'missing_key';
  } catch {
    checks.aiService = 'unavailable';
  }

  const allHealthy = connected && checks.aiService !== 'unavailable';
  res.status(allHealthy ? 200 : 503).json({ ready: allHealthy, checks });
});

// Apply rate limiters
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);
app.use("/api/public/register-school", authLimiter);
app.use("/api/ai", aiLimiter, aiTokenBudgetGuard);
if (isProduction) {
  app.use("/api", apiLimiter);
}

// AI test endpoint (with rate limiting)
const enableAiTestEndpoint =
  !isProduction || process.env.ENABLE_AI_TEST_ENDPOINT === "true";
if (enableAiTestEndpoint) {
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
}

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
app.use("/api/auth/google-drive", googleDriveAuthRoutes);
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
// BE-032: larger limit for import routes that handle CSV bulk data
app.use("/api/import", express.json({ limit: "5mb" }), importRoutes);
app.use("/api/newsletters", newsletterRoutes);
app.use("/api/newsletter-templates", newsletterTemplateRoutes);
app.use("/api/standards", standardRoutes);
app.use("/api/standard-assignments", standardAssignmentRoutes);
app.use("/api/standard-assessment", standardAssessmentFeatureRoutes);
app.use("/api/practice", practiceRoutes);
app.use("/api/revision", revisionRoutes);
app.use("/api/reading", readingRoutes);
app.use("/api/substitutions", substitutionRoutes);
app.use("/api/review", reviewRoutes);
app.use("/api/interventions", interventionRoutes);
app.use("/api/parent", parentRoutes);
app.use("/api/assessments", assessmentRoutes);
app.use("/api/reteach-tasks", reteachTaskRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/devices", deviceRoutes);
app.use("/api/homework", homeworkRoutes);
app.use("/api/assignments", assignmentRoutes);
app.use("/api/assignment-types", assignmentTypeRoutes);
app.use("/api/grading-scales", gradingScaleRoutes);
app.use("/api/gradebook-config", gradebookConfigRoutes);
app.use("/api/gradebook-columns", gradebookColumnRoutes);
app.use("/api/gradebook-formulas", formulaRoutes);
app.use("/api/report-cards", reportCardRoutes);
app.use("/api/gradebook-templates", templateRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/parent", parentGradebookRoutes);
app.use("/api/calendar", calendarRoutes);
app.use("/api/communication-email", communicationEmailRoutes);
app.use("/api/curriculum-maps", curriculumMapRoutes);
app.use("/api/curriculum-settings", curriculumSettingsRoutes);
app.use("/api/academic-excellence", academicExcellenceRoutes);
app.use("/api/student-grouping", studentGroupingRoutes);
app.use("/api/sbr", sbrRoutes);
app.use("/api/presentations", presentationRoutes);
app.use("/api/worksheets", worksheetRoutes);
app.use("/api/finance", financeRoutes);
app.use("/api/hr", hrRoutes);
app.use("/api/docs", apiDocsRoutes);

registerApiDocsRoute(app);

// Backend-only deployment: do not build or serve frontend assets from this process.
app.get("/", (req, res) => {
  res.send("API is running...");
});

// Handle 404 errors
app.use(notFound);

// Global error handler
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 5000;

const NEWSLETTER_ISSUE_SCHEDULER_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const REVIEW_SCHEDULER_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const SUBSCRIPTION_LIFECYCLE_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const COMMUNICATION_EMAIL_SCHEDULER_INTERVAL_MS = 60 * 1000; // 1 minute
const ATTENDANCE_REMINDER_SCHEDULER_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const CURRICULUM_AI_IMPORT_SCHEDULER_INTERVAL_MS = 15 * 1000; // 15 seconds
const ACADEMIC_EXCELLENCE_NIGHTLY_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

const httpServer = createServer(app);
initRealtimeGateway(httpServer);

// BE-040: Track all interval handles for graceful shutdown
const activeIntervals = [];

const server = httpServer.listen(PORT, () => {
  logger.success(`Server is running on port ${PORT}`);

  // BE-023: Validate all tenant-scoped models have isolation plugin
  validateTenantIsolation();

  let attendanceReminderJobRunning = false;
  const runAttendanceReminderScheduler = async () => {
    if (attendanceReminderJobRunning) {
      logger.warn("attendance_reminder_scheduler_skipped_overlap");
      return;
    }

    attendanceReminderJobRunning = true;
    try {
      const summary = await processAttendanceRemindersForEnabledSchools();
      if ((summary?.totals?.processed || 0) > 0 || (summary?.totals?.sent || 0) > 0 || (summary?.schoolsFailed || 0) > 0) {
        logger.info("attendance_reminder_scheduler_run", summary);
      }
    } catch (err) {
      logger.error("attendance_reminder_scheduler_error", err?.message || err);
    } finally {
      attendanceReminderJobRunning = false;
    }
  };

  setTimeout(runAttendanceReminderScheduler, 30 * 1000);
  activeIntervals.push(setInterval(runAttendanceReminderScheduler, ATTENDANCE_REMINDER_SCHEDULER_INTERVAL_MS));

  // Substitution expiry: mark stale SUBMITTED requests as EXPIRED
  if (process.env.RUN_SUBSTITUTION_EXPIRY_JOB !== "false") {
    const SUBSTITUTION_EXPIRY_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
    activeIntervals.push(setInterval(async () => {
      try {
        await expireStaleSubstitutionRequests();
      } catch (err) {
        logger.error("Substitution expiry job error:", err?.message || err);
      }
    }, SUBSTITUTION_EXPIRY_INTERVAL_MS));
  }

  // Optional scheduler: ensure weekly issues exist for all classes (idempotent).
  if (process.env.RUN_NEWSLETTER_ISSUE_SCHEDULER !== "false") {
    // Run once on startup, then periodically.
    ensureCurrentWeekIssuesForAllClasses(new Date()).catch((err) => {
      logger.error("Newsletter issue scheduler startup error:", err?.message || err);
    });
    activeIntervals.push(setInterval(async () => {
      try {
        await ensureCurrentWeekIssuesForAllClasses(new Date());
      } catch (err) {
        logger.error("Newsletter issue scheduler error:", err?.message || err);
      }
    }, NEWSLETTER_ISSUE_SCHEDULER_INTERVAL_MS));
  }

  if (process.env.RUN_REVIEW_SCHEDULER_JOB !== "false") {
    runReviewSchedulerJob().catch((err) => {
      logger.error("Review scheduler startup error:", err?.message || err);
    });

    activeIntervals.push(setInterval(async () => {
      try {
        await runReviewSchedulerJob();
      } catch (err) {
        logger.error("Review scheduler job error:", err?.message || err);
      }
      }, REVIEW_SCHEDULER_INTERVAL_MS));
  }

  if (process.env.RUN_SUBSCRIPTION_LIFECYCLE_JOB !== "false") {
    const runLifecycle = async () => {
      try {
        const summary = await runSubscriptionLifecycleJob();
        if ((summary?.statusTransitions || 0) > 0 || (summary?.notificationsCreated || 0) > 0 || (summary?.errors?.length || 0) > 0) {
          logger.info("subscription_lifecycle_job_run", summary);
        }
      } catch (err) {
        logger.error("Subscription lifecycle job error:", err?.message || err);
      }
    };

    setTimeout(runLifecycle, 60 * 1000);
    activeIntervals.push(setInterval(runLifecycle, SUBSCRIPTION_LIFECYCLE_INTERVAL_MS));
  }

  if (process.env.RUN_COMMUNICATION_EMAIL_SCHEDULER !== "false") {
    const runCommunicationEmailScheduler = async () => {
      try {
        const result = await processDueScheduledCommunicationEmails();
        if ((result?.claimed || 0) > 0) {
          logger.info("Communication email scheduler run", result);
        }
      } catch (err) {
        logger.error("Communication email scheduler error:", err?.message || err);
      }
    };
    setTimeout(runCommunicationEmailScheduler, 30 * 1000);
    activeIntervals.push(setInterval(runCommunicationEmailScheduler, COMMUNICATION_EMAIL_SCHEDULER_INTERVAL_MS));
  }

  if (process.env.RUN_CURRICULUM_AI_IMPORT_RUNNER !== "false") {
    const runCurriculumImportScheduler = async () => {
      try {
        await runCurriculumImportJobCycle();
      } catch (err) {
        logger.error("Curriculum AI import scheduler error:", err?.message || err);
      }
    };
    setTimeout(runCurriculumImportScheduler, 15 * 1000);
    activeIntervals.push(setInterval(runCurriculumImportScheduler, CURRICULUM_AI_IMPORT_SCHEDULER_INTERVAL_MS));
  }

  if (process.env.RUN_ACADEMIC_EXCELLENCE_NIGHTLY_JOB !== "false") {
    const runAcademicExcellenceScheduler = async () => {
      try {
        await runAcademicExcellenceNightlyJob();
      } catch (err) {
        logger.error("Academic Excellence nightly job error:", err?.message || err);
      }
    };
    // First run 2 minutes after startup, then every 24 hours
    setTimeout(runAcademicExcellenceScheduler, 2 * 60 * 1000);
    activeIntervals.push(setInterval(runAcademicExcellenceScheduler, ACADEMIC_EXCELLENCE_NIGHTLY_INTERVAL_MS));
  }
});

// Graceful shutdown handling
const gracefulShutdown = async (signal) => {
  logger.info(`${signal} received. Starting graceful shutdown...`);

  // BE-040: Clear all scheduled job intervals
  for (const handle of activeIntervals) {
    clearInterval(handle);
  }
  logger.info(`Cleared ${activeIntervals.length} scheduled job intervals`);

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
