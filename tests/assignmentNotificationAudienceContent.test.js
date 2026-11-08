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
                { type: "external_url", title: "Unsafe", url: "javascript:alert(1)" },
                { type: "external_url", title: "Study guide", url: "https://example.com/guide" },
            ],
        },
    });

    assert.doesNotMatch(content.htmlContent, /javascript:/);
    assert.match(content.htmlContent, /href="https:\/\/example\.com\/guide"/);
    assert.doesNotMatch(content.htmlContent, />Unsafe</);
});

test("a standards practice notice opens the practice session for students", async () => {
    const build = (assignmentTypeKey, audience) =>
        notificationService._buildAssignmentPostedContent({
            student,
            assignment: {
                _id: "6adba7842d4905e6f87dfcae",
                assignmentTypeName: "Standards Practice",
                assignmentTypeKey,
                title: "Explain the function of conjunctions",
            },
            audience,
        });

    const practice = await build("standard_assignment", "student");
    const homework = await build("homework", "student");
    const parentPractice = await build("standard_assignment", "parent");
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
        homework.htmlContent.includes(`href="${base}/my-assignments/6adba7842d4905e6f87dfcae"`),
        "students keep the existing my-assignments detail route"
    );
    assert.ok(
        parentPractice.message.includes(`View: ${base}/assignments/6adba7842d4905e6f87dfcae`),
        "parents land on the read-only assignment detail page, never the practice session"
    );
});

const longInstructions = Array.from(
    { length: 40 },
    (_, index) => `Step ${index + 1}: read the passage and answer the questions.`,
).join("\n");

test("posted email keeps long instructions in full while the plain message stays short", async () => {
    const content = await notificationService._buildAssignmentPostedContent({
        student,
        assignment: { ...quiz, instructions: longInstructions },
    });

    assert.match(content.htmlContent, /Step 1: read the passage/);
    assert.match(content.htmlContent, /Step 40: read the passage and answer the questions\./);
    assert.match(content.htmlContent, /Instructions/);
    assert.ok(content.message.includes(`${longInstructions.slice(0, 447)}...`));
    assert.doesNotMatch(content.message, /Step 40:/);
});

test("reminder email carries instructions, resource links, attachments and the detail button", async () => {
    const assignment = {
        _id: "6adba7842d4905e6f87dfcae",
        assignmentTypeName: "Quiz",
        title: "Weather and climate",
        dueDate: quiz.dueDate,
        instructions: longInstructions,
        links: [
            { type: "external_url", title: "Study guide", url: "https://example.com/guide" },
        ],
        attachments: [
            { fileName: "worksheet.pdf", url: "https://files.example.com/worksheet.pdf" },
        ],
    };
    const content = await notificationService._buildAssignmentReminderContent({
        student,
        assignment,
        subject: "Reminder: Weather and climate",
        reminderText: "Please finish the quiz before the due date.",
        audience: "parent",
    });
    const base = getPortalUrl();

    assert.match(content.htmlContent, /Step 1: read the passage/);
    assert.match(content.htmlContent, /Step 40: read the passage and answer the questions\./);
    assert.match(content.htmlContent, /Instructions/);
    assert.match(content.htmlContent, /Test Student A/);
    assert.match(content.htmlContent, /href="https:\/\/example\.com\/guide"/);
    assert.match(content.htmlContent, /href="https:\/\/files\.example\.com\/worksheet\.pdf"/);
    assert.ok(content.htmlContent.includes(`href="${base}/assignments/6adba7842d4905e6f87dfcae"`));
    assert.ok(content.message.includes("Study guide: https://example.com/guide"));
});
