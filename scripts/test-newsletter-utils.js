/**
 * Lightweight sanity checks for newsletter utilities.
 * Run: node scripts/test-newsletter-utils.js
 */
import assert from "assert";
import { computeIssueReadiness } from "../services/newsletterIssueService.js";
import { collectStudentFamilyEmails } from "../utils/newsletterRecipients.js";
import { parseNewsletterJson, countWords } from "../services/newsletterAiService.js";

function testComputeIssueReadiness() {
  const expectedSubjectIds = ["a", "b", "c"];
  const excludedSubjectIds = ["b"];
  const sections = [
    { status: "approved", subject: { _id: "a" } },
    { status: "submitted", subject: { _id: "c" } },
  ];

  const r = computeIssueReadiness({ expectedSubjectIds, sections, excludedSubjectIds });
  assert.strictEqual(r.isSendEnabled, false);
  assert.deepStrictEqual(r.missingSubjectIds, ["c"]);
}

function testCollectStudentFamilyEmails() {
  const student = {
    parentInfo: {
      fatherEmail: "FATHER@Example.com",
      motherEmail: "mother@example.com",
      guardianEmail: "not-an-email",
    },
    studentEmail: "student@example.com",
    email: "student@example.com", // duplicate
  };

  const emails = collectStudentFamilyEmails(student);
  assert.deepStrictEqual(emails.sort(), ["father@example.com", "mother@example.com", "student@example.com"].sort());
}

function testParseNewsletterJson() {
  const raw = "```json\n{ \"content\": \"Hello world\", \"wordCount\": 2, \"keyTopics\": [\"x\"], \"homeworkMentioned\": false }\n```";
  const parsed = parseNewsletterJson(raw);
  assert.strictEqual(parsed.content, "Hello world");
  assert.strictEqual(countWords(parsed.content), 2);
}

function main() {
  testComputeIssueReadiness();
  testCollectStudentFamilyEmails();
  testParseNewsletterJson();
  console.log("✅ Newsletter utility tests passed");
}

main();

