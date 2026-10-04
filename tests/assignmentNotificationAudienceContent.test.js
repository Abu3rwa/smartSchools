import test from "node:test";
import assert from "node:assert/strict";
import notificationService from "../services/notificationService.js";

const student = { fullName: "Test Student A" };
const quiz = {
    assignmentTypeName: "Quiz",
    title: "Assignment",
    dueDate: "2026-10-06T12:00:00.000Z",
};

test("posted assignment content addresses parents by name and speaks directly to students", async () => {
    const parentContent = await notificationService._buildAssignmentPostedContent({
        student,
        assignment: quiz,
    });
    const studentContent = await notificationService._buildAssignmentPostedContent({
        student,
        assignment: quiz,
        audience: "student",
    });

    assert.match(parentContent.message, /posted for Test Student A/);
    assert.match(parentContent.htmlContent, /Student:<\/span> Test Student A/);
    assert.match(studentContent.message, /A new quiz is ready for you/);
    assert.match(studentContent.htmlContent, /A new <strong>quiz<\/strong> is ready for you/);
    assert.doesNotMatch(studentContent.htmlContent, /Student:<\/span>/);
});

test("graded assignment content addresses parents by name and speaks directly to students", () => {
    const grade = { marks: 8, maxMarks: 10, remarks: "Great effort (+1)" };
    const parentContent = notificationService._buildAssignmentGradedContent({
        student,
        assignment: { ...quiz, maxMarks: 10 },
        grade,
    });
    const studentContent = notificationService._buildAssignmentGradedContent({
        student,
        assignment: { ...quiz, maxMarks: 10 },
        grade,
        audience: "student",
    });

    assert.match(parentContent.message, /Test Student A's quiz has been graded/);
    assert.match(parentContent.htmlContent, /Student:<\/span> Test Student A/);
    assert.match(studentContent.message, /Your quiz has been graded/);
    assert.match(studentContent.htmlContent, /Your <strong>quiz<\/strong> has been graded/);
    assert.match(studentContent.htmlContent, /class="gbr-remark-chip gbr-remark-positive"/);
    assert.doesNotMatch(studentContent.htmlContent, /Student:<\/span>/);
});
