import test from "node:test";
import assert from "node:assert/strict";
import { generateAssignmentReminder } from "../helpers/assignmentReminderAi.js";

test("assignment reminder addresses the student by their first name", () => {
    const { body, studentBody } = generateAssignmentReminder({
        assignment: {
            assignmentTypeName: "Homework",
            dueDate: "2026-10-05T12:00:00.000Z",
        },
        studentName: "Sireen Mohamed Farhat",
    });

    assert.match(body, /^Just a friendly heads-up that Sireen's homework is due on /);
    assert.doesNotMatch(body, /\bStudent's\b/);
    assert.match(studentBody, /^Friendly reminder: your homework is due on /i);
    assert.doesNotMatch(studentBody, /Sireen|they're having fun/);
});

test("assignment reminder for students still addresses the student directly without a due date", () => {
    const { studentBody } = generateAssignmentReminder({
        assignment: {
            assignmentTypeName: "Homework",
            title: "Native Peoples of North America",
        },
        studentName: "Sireen Mohamed Farhat",
    });

    assert.match(studentBody, /please complete your homework, "Native Peoples of North America"/i);
});
