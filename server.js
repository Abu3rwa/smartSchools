// Load environment variables FIRST - before any other imports
import dotenv from "dotenv";
dotenv.config();
import cors from "cors";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import mongoSanitize from "express-mongo-sanitize";
import hpp from "hpp";
import connectDB from "./config/db.js";
import errorHandler, { notFound } from "./middleware/errorHandler.js";
import { connectAi } from "./utils/connectAi.js";

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
import { processAttendanceReminders } from "./controllers/attendanceTakingReminderController.js";
import newsletterRoutes from "./routes/newsletterRoutes.js";
import revisionRoutes from "./routes/revisionRoutes.js";
import readingRoutes from "./routes/readingRoutes.js";
import { ensureCurrentWeekIssuesForAllClasses } from "./services/newsletterScheduler.js";

// Connect to database
connectDB();
const app = express();

app.get("/api/ai/test", async (req, res) => {
  const prompt = req.query.prompt || "Test prompt";
  const result = await connectAi(prompt);
  res.json(result);
});
// CORS configuration
app.use(
  cors({
    origin:
      process.env.CLIENT_URL ||
      "http://localhost:5173" ||
      "https://aqueous-fortress-98392-f4793139e201.herokuapp.com",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

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

// Rate limiting
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: {
    success: false,
    message: "Too many attempts, please try again later",
  },
});
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: {
    success: false,
    message: "Too many requests, please try again later",
  },
});

// Body parser
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Ignore favicon requests
app.get("/favicon.ico", (req, res) => res.status(204).end());

// Health check route
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "GradeBook API is running",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
  });
});

// Apply rate limiters
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);
app.use("/api/public/register-school", authLimiter);
app.use("/api", apiLimiter);

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
app.use("/api/schedules", scheduleRoutes);
app.use("/api/schedules-enhanced", scheduleRoutesEnhanced);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/attendance-taking-reminders", attendanceTakingReminderRoutes);
app.use("/api/lessons", lessonPlanRoutes);
app.use("/api/school-calendar", schoolCalendarRoutes);
app.use("/api/timetable", timetableRoutes);
app.use("/api/rooms", roomRoutes);
app.use("/api/newsletters", newsletterRoutes);
app.use("/api/standards", standardRoutes);
app.use("/api/standard-assignments", standardAssignmentRoutes);
app.use("/api/practice", practiceRoutes);
app.use("/api/revision", revisionRoutes);
app.use("/api/reading", readingRoutes);

registerApiDocsRoute(app);

// Serve static assets in production
import path from "path";
import { fileURLToPath } from "url";

if (process.env.NODE_ENV === "production") {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

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

app.listen(PORT, () => {
  console.log("Server is running");
  if (process.env.RUN_ATTENDANCE_REMINDER_JOB !== "false") {
    setInterval(async () => {
      try {
        await processAttendanceReminders();
      } catch (err) {
        console.error("Attendance reminder job error:", err?.message || err);
      }
    }, REMINDER_JOB_INTERVAL_MS);
  }

  // Optional scheduler: ensure weekly issues exist for all classes (idempotent).
  if (process.env.RUN_NEWSLETTER_ISSUE_SCHEDULER !== "false") {
    // Run once on startup, then periodically.
    ensureCurrentWeekIssuesForAllClasses(new Date()).catch((err) => {
      console.error("Newsletter issue scheduler startup error:", err?.message || err);
    });
    setInterval(async () => {
      try {
        await ensureCurrentWeekIssuesForAllClasses(new Date());
      } catch (err) {
        console.error("Newsletter issue scheduler error:", err?.message || err);
      }
    }, NEWSLETTER_ISSUE_SCHEDULER_INTERVAL_MS);
  }
});

export default app;
