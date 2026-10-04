import test from "node:test";
import assert from "node:assert/strict";
import notificationService from "../services/notificationService.js";

const grade = {
  remarks: "Active participation & focus (+2); Completed classwork on time (+4)",
};

const assertRemarkChips = (html) => {
  assert.match(html, /class="gbr-remark-chip gbr-remark-positive"/);
  assert.match(html, /Active participation &amp; focus/);
  assert.match(html, />\+2<\/strong>/);
  assert.match(html, /background:#16834a;color:#ffffff/);
  assert.doesNotMatch(html, /<span class="label">Remarks:<\/span>/);
};

test("graded assignment email renders remarks as styled chips", () => {
  const content = notificationService._buildAssignmentGradedContent({
    student: { fullName: "Sofia Marie Martinez-Egan" },
    assignment: {
      assignmentTypeName: "Classwork",
      title: "Run-on Sentences",
      maxMarks: 10,
    },
    grade: { ...grade, marks: 10, maxMarks: 10 },
  });

  assertRemarkChips(content.htmlContent);
});

test("graded homework email renders remarks as styled chips", () => {
  const content = notificationService._buildHomeworkGradedContent({
    student: { fullName: "Sofia Marie Martinez-Egan" },
    assignment: { title: "Run-on Sentences", maxMarks: 10 },
    grade: { ...grade, marks: 10, maxMarks: 10 },
  });

  assertRemarkChips(content.htmlContent);
});
