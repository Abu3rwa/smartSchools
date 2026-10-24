import test from "node:test";
import assert from "node:assert/strict";
import notificationService from "../services/notificationService.js";
import { getPortalUrl } from "../helpers/portalUrl.js";

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
    assert.match(parentContent.htmlContent, />Student<\/td>\s*<td[^>]*>Test Student A</);
    assert.match(studentContent.message, /A new quiz is ready for you/);
    assert.match(studentContent.htmlContent, /A new <strong>quiz<\/strong> is ready for you/);
    assert.doesNotMatch(studentContent.htmlContent, />Student<\/td>/);
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
    assert.match(parentContent.htmlContent, />Student<\/td>\s*<td[^>]*>Test Student A</);
    assert.match(studentContent.message, /Your quiz has been graded/);
    assert.match(studentContent.htmlContent, /Your <strong>quiz<\/strong> has been graded/);
    assert.match(studentContent.htmlContent, /class="gbr-remark-chip gbr-remark-positive"/);
    assert.doesNotMatch(studentContent.htmlContent, />Student<\/td>/);
});

test("posted assignment email only makes http(s) links clickable", async () => {
    const content = await notificationService._buildAssignmentPostedContent({
        student,
        assignment: {
            ...quiz,
            links: [
                { title: "Unsafe", url: "javascript:alert(1)" },
                { title: "Study guide", url: "https://example.com/guide" },
            ],
        },
    });

    assert.doesNotMatch(content.htmlContent, /javascript:/);
    assert.match(content.htmlContent, /href="https:\/\/example\.com\/guide"/);
    assert.match(content.htmlContent, />Unsafe</);
});

test("a standards practice notice opens the practice session, not the assignments list", async () => {
    const build = (assignmentTypeKey) =>
        notificationService._buildAssignmentPostedContent({
            student,
            assignment: {
                _id: "6adba7842d4905e6f87dfcae",
                assignmentTypeName: "Standards Practice",
                assignmentTypeKey,
                title: "Explain the function of conjunctions",
            },
            audience: "student",
        });

    const practice = await build("standard_assignment");
    const homework = await build("homework");
    const base = getPortalUrl();

    assert.ok(
        practice.message.includes(`View: ${base}/practice/6adba7842d4905e6f87dfcae`),
        `expected the practice route in the plain text, got: ${practice.message}`
    );
    assert.ok(
        practice.htmlContent.includes(`href="${base}/practice/6adba7842d4905e6f87dfcae"`),
        "the button has to carry the same route as the text"
    );
    assert.ok(
        homework.htmlContent.includes(`href="${base}/assignments/6adba7842d4905e6f87dfcae"`),
        "every other assignment type keeps the assignments route"
    );
});
