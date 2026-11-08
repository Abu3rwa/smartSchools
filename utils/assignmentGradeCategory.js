export const gradeTypeCategoryFromAssignmentKey = (key = "") => {
  const normalized = String(key || "")
    .trim()
    .toLowerCase();
  switch (normalized) {
    case "homework":
      return { gradeType: "homework", category: "homework" };
    case "classwork":
      return { gradeType: "classwork", category: "classwork" };
    case "quiz":
    case "google_form":
      return { gradeType: "quiz", category: "quiz" };
    case "project":
      return { gradeType: "project", category: "project" };
    case "participation":
      return { gradeType: "participation", category: "participation" };
    case "test":
      return { gradeType: "monthly_test", category: "test" };
    case "exam":
      return { gradeType: "semester_exam", category: "exam" };
    default:
      return { gradeType: "other", category: "other" };
  }
};
