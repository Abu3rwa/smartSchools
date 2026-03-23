/**
 * Registers the `/api` documentation route in non-production environments.
 *
 * Keeping this in a separate module makes `server.js` easier to scan and keeps
 * the docs payload in one place.
 *
 * @param {import("express").Express} app
 */
export function registerApiDocsRoute(app) {
  if (process.env.NODE_ENV === "production") return;

  app.get("/api", (req, res) => {
    res.json({
      success: true,
      message: "School Platform API v2.0",
      categories: {
        auth: {
          "POST /api/auth/login": "Login user and get JWT",
          "GET /api/auth/me": "Get current authenticated user",
          "PUT /api/auth/profile": "Update profile",
          "POST /api/auth/google/url": "Get Google SSO URL",
        },
        students: {
          "GET /api/students": "List students (filtered)",
          "POST /api/students": "Create student",
          "GET /api/students/:id": "Get student by ID",
          "PUT /api/students/:id": "Update student",
        },
        classes_and_depts: {
          "GET /api/classes": "Get all classes",
          "POST /api/classes": "Create class",
          "GET /api/departments": "Get all departments",
          "POST /api/classes/:id/subjects": "Assign subject to class",
        },
        academics: {
          "GET /api/subjects": "Get all subjects",
          "POST /api/assignments": "Create assignment",
          "POST /api/homework": "Create homework",
          "POST /api/grades/bulk": "Bulk add grades",
        },
        ai_and_diagnostics: {
          "POST /api/lessons/:id/submit": "AI lesson plan evaluation",
          "GET /api/academic-excellence/tasks/queue": "AI diagnostic task queue",
          "POST /api/academic-excellence/ai-practice": "Generate AI student practice",
        },
        attendance: {
          "POST /api/attendance": "Mark daily attendance",
          "GET /api/attendance/stats": "Get attendance statistics",
          "GET /api/attendance-requests": "Get student leave requests",
        },
        reports: {
          "POST /api/reports/generate-advanced": "Generate AI student report",
          "GET /api/sbr/reports": "Get standards-based reports",
        },
        communication: {
          "GET /api/notifications": "Get notification history",
          "POST /api/communication-email/send": "Broadcast class/role email",
        },
      },
    });
  });
}

