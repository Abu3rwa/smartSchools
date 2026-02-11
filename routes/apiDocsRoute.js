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
      message: "GradeBook API v1.0",
      endpoints: {
        auth: {
          "POST /api/auth/register": "Register a new user",
          "POST /api/auth/login": "Login user",
          "GET /api/auth/me": "Get current user",
          "PUT /api/auth/profile": "Update profile",
          "PUT /api/auth/password": "Change password",
        },
        students: {
          "GET /api/students": "Get all students",
          "POST /api/students": "Create student",
          "GET /api/students/:id": "Get student by ID",
          "PUT /api/students/:id": "Update student",
          "DELETE /api/students/:id": "Delete student",
          "GET /api/students/class/:classId": "Get students by class",
        },
        teachers: {
          "GET /api/teachers": "Get all teachers",
          "POST /api/teachers": "Create teacher",
          "GET /api/teachers/:id": "Get teacher by ID",
          "PUT /api/teachers/:id": "Update teacher",
          "POST /api/teachers/:id/assign-class": "Assign class to teacher",
          "GET /api/teachers/my-classes": "Get teacher's assigned classes",
        },
        classes: {
          "GET /api/classes": "Get all classes",
          "POST /api/classes": "Create class",
          "GET /api/classes/:id": "Get class by ID",
          "POST /api/classes/:id/subjects": "Add subject to class",
          "GET /api/classes/:id/stats": "Get class statistics",
        },
        subjects: {
          "GET /api/subjects": "Get all subjects",
          "POST /api/subjects": "Create subject",
          "GET /api/subjects/grade/:grade": "Get subjects by grade",
        },
        grades: {
          "POST /api/grades/daily": "Add daily grade",
          "POST /api/grades/bulk": "Bulk add grades",
          "POST /api/grades/exam": "Add exam grade",
          "GET /api/grades/student/:studentId": "Get student grades",
          "GET /api/grades/report/:studentId": "Get student grade report",
          "GET /api/grades/average/monthly/:studentId": "Get monthly average",
          "GET /api/grades/average/semester/:studentId": "Get semester average",
          "GET /api/grades/average/overall/:studentId": "Get overall average",
        },
        notifications: {
          "POST /api/notifications/grade-update":
            "Send grade update notification",
          "POST /api/notifications/daily-report/:studentId": "Send daily report",
          "POST /api/notifications/monthly-report/:studentId":
            "Send monthly report",
          "POST /api/notifications/class/:classId": "Send class notifications",
          "GET /api/notifications": "Get notification history",
        },
      },
    });
  });
}

