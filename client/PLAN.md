# Implementation Plan: Enhanced Student Tracking & Reporting

## Goal
Enable flexible grade categorization, lesson planning, and comprehensive daily/weekly reporting to parents.

## 1. Grade Entry Enhancements
**User Story:** As a teacher, I want to categorize grades (Homework, Classwork, Test, Custom) so that I can track performance more accurately.

- [ ] **Modify `GradeEntryPage.jsx`**:
    - Add a "Category" dropdown selector (Default options: Classwork, Homework, Test).
    - Add "Create Custom Category" option (simple text input when selected).
    - Update `handleSubmit` to include the selected `category` in the payload sent to `bulkAddGrades`.
- [ ] **Update `gradeSlice.js` & `gradeService.js`**:
    - Ensure the `category` field is passed correctly in the API request.

## 2. Lesson Planning (New Feature)
**User Story:** As a teacher, I want to record daily lessons with resources so that I can include them in weekly reports.

- [ ] **Create `LessonService.js`**:
    - Endpoints for `createLesson`, `getLessons`, `updateLesson`, `deleteLesson`.
    - Data structure: `{ date, classId, subjectId, title, description, resources: [{ title, url }] }`.
- [ ] **Create `LessonSlice.js`**:
    - Redux state management for lessons.
- [ ] **Create `LessonPlanPage.jsx`**:
    - Calendar or List view of the week.
    - Form to add/edit lessons for a specific class/subject/date.
    - Input fields for Title, Description, and multiple Resource Links.

## 3. Reporting Enhancements
**User Story:** As a teacher, I want to send daily classwork summaries and weekly detailed reports to parents.

- [ ] **Daily Classwork Report**:
    - Leverage existing `sendDailyReport` in `notificationService`.
    - Add a specialized "Send Daily Report" button in `StudentsPage` or `DashboardPage`.
    - **Logic**: This report must filter and only include grades from the **"Classwork"** category for that specific day.
    - Include associated Lesson info for that day if available.
- [ ] **Weekly Full Report**:
    - **Create `WeeklyReportPage.jsx`**:
        - Select Class and Week range.
        - Display:
            - **Lessons Taught:** List of lessons from the `LessonPlan` (Title, Desc, Links).
            - **Grades:** Summary of grades entered that week (Homework, Test, etc.).
        - **"Send Weekly Report" Action**:
            - Trigger `notificationService.sendWeeklyReport` (new method needed) which compiles this data into an email payload.
- [ ] **Monthly Classwork Table**:
    - Update `GradeReportPage.jsx` or create `MonthlyGradesPage.jsx`.
    - View: Table showing Date | Category | Grade | Note/Remark for a specific month.
    - Include "Download/Send" option.

## 4. UI/UX Improvements
- [ ] Add sidebar navigation for "Lesson Plans".
- [ ] Ensure "Grade Entry" clearly indicates which category is being entered.

## Execution Order
1.  **Grade Categories**: Update Entry Page first as it extends existing flow.
2.  **Lesson Plans**: Build the new CRUD flow for lessons.
3.  **Reports**: Build the report views that aggregate data from steps 1 & 2.
