import assert from "node:assert/strict";
import test from "node:test";

import ReadingAssignment from "../models/ReadingAssignment.js";
import ReadingFluencyAttempt from "../models/ReadingFluencyAttempt.js";
import ReadingFluencyProgress from "../models/ReadingFluencyProgress.js";
import Student from "../models/Student.js";
import { readingTextHash } from "../utils/readingBlocks.js";
import {
  csvContentDisposition,
  exportFluencyCsv,
  getFluencyClassReport,
  getFluencyHardWords,
  getFluencyStudentReport
} from "../services/readingFluency/reports.js";
import { PASSAGE, SHORT_PASSAGE } from "./fixtures/readingFluency.js";

const schoolId = "507f1f77bcf86cd799439012";
const assignmentId = "507f1f77bcf86cd799439016";
const textId = "507f1f77bcf86cd799439017";

const AISHA = "507f1f77bcf86cd799439101";
const OMAR = "507f1f77bcf86cd799439102";
const ZAKARYA = "507f1f77bcf86cd799439103";
const DANA = "507f1f77bcf86cd799439104";
const MOVED = "507f1f77bcf86cd799439105";

/** A Mongoose-like query: chainable, awaitable, and lean-able. */
const query = (value) => {
  const chain = {
    populate: () => chain,
    select: () => chain,
    sort: () => chain,
    lean: async () => value,
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject)
  };
  return chain;
};

const at = (day) => new Date(Date.UTC(2026, 10, day, 9, 0, 0));

const textDocument = () => ({
  _id: textId,
  school: schoolId,
  title: "Creating a Nation",
  language: "english",
  originalText: "",
  originalComplexity: null,
  sections: [
    { order: 0, title: "Money and the Stamp Act", text: PASSAGE },
    { order: 1, title: "Protests and Repeal", text: SHORT_PASSAGE }
  ],
  simplifiedVersions: []
});

const assignment = (overrides = {}) => ({
  _id: assignmentId,
  school: schoolId,
  students: [AISHA, OMAR, ZAKARYA, DANA],
  assignedBy: { firstName: "Maya", lastName: "Haddad" },
  isActive: true,
  dueDate: at(20),
  class: { name: "9AY" },
  text: textDocument(),
  fluency: {
    enabled: true,
    parts: [{ key: "s-0", level: null }, { key: "s-1", level: null }],
    minReadings: 2,
    maxReadingsPerPart: 6,
    targetAccuracy: 95,
    targetWpm: null,
    showPace: true,
    requireListenFirst: false
  },
  ...overrides
});

const students = () => [
  { _id: AISHA, firstName: "Aisha", lastName: "Ezzurghi" },
  { _id: OMAR, firstName: "Omar", lastName: "Khalid" },
  { _id: ZAKARYA, firstName: "Zakarya", lastName: "Mansour" },
  { _id: DANA, firstName: "Dana", lastName: "Reed" },
  { _id: MOVED, firstName: "Moved", lastName: "Student" }
];

const progressRow = (student, blockKey, overrides = {}) => ({
  student,
  blockKey,
  readings: 2,
  attempts: 2,
  first: { accuracy: 90, wpm: 70 },
  best: { accuracy: 93, wpm: 80 },
  latest: { accuracy: 93, wpm: 80, at: at(5) },
  goalMet: false,
  focusWords: [],
  ...overrides
});

const attemptRow = (student, blockKey, overrides = {}) => ({
  _id: `attempt-${student}-${blockKey}-${overrides.accuracy ?? 90}`,
  student,
  blockKey,
  level: null,
  status: "scored",
  counted: true,
  accuracy: 90,
  wpm: 70,
  statusMap: "cccc",
  issues: [],
  pauses: [],
  createdAt: at(4),
  ...overrides
});

const progressFixture = () => [
  progressRow(AISHA, "s-0", {
    first: { accuracy: 95, wpm: 80 },
    best: { accuracy: 96, wpm: 90 },
    latest: { accuracy: 95, wpm: 90, at: at(6) },
    goalMet: true,
    focusWords: [{ word: "Parliament", misses: 2 }]
  }),
  progressRow(AISHA, "s-1", {
    first: { accuracy: 96, wpm: 82 },
    best: { accuracy: 97, wpm: 92 },
    latest: { accuracy: 96, wpm: 92, at: at(7) },
    goalMet: true,
    focusWords: [{ word: "repealed", misses: 1 }]
  }),
  progressRow(OMAR, "s-0", {
    first: { accuracy: 80, wpm: 60 },
    best: { accuracy: 85, wpm: 65 },
    latest: { accuracy: 85, wpm: 65, at: at(8) },
    focusWords: [
      { word: "parliament", misses: 3 },
      { word: "Massacre", misses: 1 }
    ]
  }),
  progressRow(DANA, "s-0", {
    first: { accuracy: 90, wpm: 70 },
    best: { accuracy: 93, wpm: 80 },
    latest: { accuracy: 93, wpm: 80, at: at(9) }
  }),
  progressRow(MOVED, "s-0", {
    readings: 5,
    first: { accuracy: 50, wpm: 40 },
    best: { accuracy: 55, wpm: 45 },
    latest: { accuracy: 55, wpm: 45, at: at(10) },
    focusWords: [{ word: "independence", misses: 4 }]
  })
];

const attemptsFixture = () => [
  attemptRow(AISHA, "s-0", { accuracy: 95, wpm: 80, createdAt: at(5) }),
  attemptRow(AISHA, "s-0", { accuracy: 95, wpm: 90, createdAt: at(6) }),
  attemptRow(AISHA, "s-1", { accuracy: 96, wpm: 82, createdAt: at(5) }),
  attemptRow(AISHA, "s-1", { accuracy: 96, wpm: 92, createdAt: at(7) }),
  attemptRow(OMAR, "s-0", { accuracy: 80, wpm: 60, createdAt: at(7) }),
  attemptRow(OMAR, "s-0", { accuracy: 85, wpm: 65, createdAt: at(8) }),
  attemptRow(DANA, "s-0", { accuracy: 90, wpm: 70, createdAt: at(8) }),
  attemptRow(DANA, "s-0", { accuracy: 93, wpm: 80, createdAt: at(9) }),
  attemptRow(MOVED, "s-0", { accuracy: 50, wpm: 40, createdAt: at(9) }),
  attemptRow(MOVED, "s-0", { accuracy: 55, wpm: 45, createdAt: at(10) })
];

const stubReport = (t, {
  assignmentValue = assignment(),
  progress = progressFixture(),
  attempts = attemptsFixture()
} = {}) => {
  t.mock.method(ReadingAssignment, "findOne", () => query(assignmentValue));
  t.mock.method(Student, "findOne", (filter) => query(
    students().find((student) => String(student._id) === String(filter?._id)) || null
  ));
  t.mock.method(Student, "find", () => query(students()));
  t.mock.method(ReadingFluencyProgress, "find", (filter) => {
    const keys = filter?.blockKey?.$in;
    return query(progress.filter((row) => (
      (!keys || keys.includes(row.blockKey))
      && (!filter?.student || String(row.student) === String(filter.student))
    )));
  });
  t.mock.method(ReadingFluencyAttempt, "find", (filter) => {
    const keys = filter?.blockKey?.$in;
    return query(attempts.filter((row) => (
      (!keys || keys.includes(row.blockKey))
      && (!filter?.student || String(row.student) === String(filter.student))
      && (!filter?.status || row.status === filter.status)
    )));
  });
};

const studentByName = (report, name) => report.students.find((student) => student.name === name);

const stubExport = (t, title) => {
  t.mock.method(ReadingAssignment, "findOne", () => query(
    assignment({ text: { ...textDocument(), title } })
  ));
  t.mock.method(Student, "findOne", () => query(students()[0]));
  t.mock.method(Student, "find", () => query(students()));
  t.mock.method(ReadingFluencyProgress, "find", () => query(progressFixture()));
  t.mock.method(ReadingFluencyAttempt, "find", () => query(attemptsFixture()));
};

test("the class report ranks students by status and totals only the roster", async (t) => {
  stubReport(t);
  const report = await getFluencyClassReport({ schoolId, assignmentId });

  assert.equal(report.enabled, true);
  assert.deepEqual(report.parts.map((part) => part.key), ["s-0", "s-1"]);
  assert.equal(report.parts[0].title, "Money and the Stamp Act");
  assert.equal(report.parts[0].available, true);
  assert.deepEqual(
    report.students.map((student) => student.name),
    ["Moved Student", "Omar Khalid", "Zakarya Mansour", "Dana Reed", "Aisha Ezzurghi"]
  );

  const omar = studentByName(report, "Omar Khalid");
  assert.equal(omar.status, "needs_support");
  assert.equal(omar.latestAccuracy, 85);
  assert.equal(omar.accuracyChange, 5);
  assert.equal(omar.assigned, true);

  const zakarya = studentByName(report, "Zakarya Mansour");
  assert.equal(zakarya.status, "not_started");
  assert.equal(zakarya.readings, 0);
  assert.equal(zakarya.lastPractised, null);

  const dana = studentByName(report, "Dana Reed");
  assert.equal(dana.status, "on_track");
  assert.equal(dana.partsStarted, 1);

  const aisha = studentByName(report, "Aisha Ezzurghi");
  assert.equal(aisha.status, "goal_met");
  assert.equal(aisha.goalMetParts, 2);
  assert.equal(aisha.readings, 4);

  const moved = studentByName(report, "Moved Student");
  assert.equal(moved.assigned, false);
  assert.equal(moved.status, "needs_support");

  assert.deepEqual(report.totals, {
    assigned: 4,
    started: 3,
    goalMet: 1,
    averageReadingsPerPart: 2,
    averageAccuracy: 91,
    averageAccuracyChange: 3
  });
  assert.equal(report.assignment.title, "Creating a Nation");
  assert.equal(report.assignment.textId, textId);
  assert.equal(report.assignment.className, "9AY");
  assert.equal(report.assignment.assignedBy, "Maya Haddad");
});

test("a student is on track until their latest accuracy drops below 90", async (t) => {
  stubReport(t, {
    progress: [progressRow(DANA, "s-0")],
    attempts: [
      attemptRow(DANA, "s-0", { accuracy: 91, createdAt: at(4) }),
      attemptRow(DANA, "s-0", { accuracy: 89, createdAt: at(5) })
    ]
  });
  const report = await getFluencyClassReport({ schoolId, assignmentId });
  const dana = studentByName(report, "Dana Reed");
  assert.equal(dana.status, "needs_support");
});

test("three readings without improvement also need support", async (t) => {
  stubReport(t, {
    progress: [progressRow(DANA, "s-0", { readings: 3, attempts: 3 })],
    attempts: [
      attemptRow(DANA, "s-0", { accuracy: 94, createdAt: at(4) }),
      attemptRow(DANA, "s-0", { accuracy: 96, createdAt: at(5) }),
      attemptRow(DANA, "s-0", { accuracy: 94, createdAt: at(6) })
    ]
  });
  const report = await getFluencyClassReport({ schoolId, assignmentId });
  const dana = studentByName(report, "Dana Reed");
  assert.equal(dana.status, "needs_support");
  assert.equal(dana.latestAccuracy, 94);
});

test("hard words merge case variants and count students", async (t) => {
  stubReport(t);
  const report = await getFluencyHardWords({ schoolId, assignmentId });

  assert.deepEqual(report.words, [
    { word: "Parliament", misses: 5, students: 2 },
    { word: "independence", misses: 4, students: 1 },
    { word: "Massacre", misses: 1, students: 1 },
    { word: "repealed", misses: 1, students: 1 }
  ]);
});

test("the student report rebuilds the block text and returns attempts newest first", async (t) => {
  stubReport(t);
  const report = await getFluencyStudentReport({
    schoolId,
    assignmentId,
    studentId: OMAR
  });

  assert.equal(report.student.name, "Omar Khalid");
  assert.equal(report.student.assigned, true);
  assert.equal(report.student.status, "needs_support");
  assert.equal(report.parts.length, 2);
  assert.deepEqual(report.focusWords, [
    { word: "parliament", misses: 3 },
    { word: "Massacre", misses: 1 }
  ]);

  const part = report.parts.find((item) => item.key === "s-0");
  assert.equal(part.text, PASSAGE);
  assert.equal(part.level, null);
  assert.equal(
    part.textHash,
    readingTextHash({ targetLevel: null, blockKey: "s-0", text: PASSAGE })
  );
  assert.deepEqual(part.attempts.map((attempt) => attempt.accuracy), [85, 80]);
  assert.equal(part.attempts[0].textChanged, false);

  const untouched = report.parts.find((item) => item.key === "s-1");
  assert.equal(untouched.title, "Protests and Repeal");
  assert.equal(untouched.attempts.length, 0);
  assert.equal(untouched.progress.readings, 0);

  assert.equal(report.totals.readings, 2);
  assert.equal(report.totals.firstAccuracy, 80);
  assert.equal(report.totals.latestAccuracy, 85);
});

test("the student report flags attempts written against older text", async (t) => {
  stubReport(t, {
    progress: [progressRow(OMAR, "s-0")],
    attempts: [
      attemptRow(OMAR, "s-0", {
        accuracy: 80,
        createdAt: at(7),
        textHash: "old-hash"
      })
    ]
  });
  const report = await getFluencyStudentReport({
    schoolId,
    assignmentId,
    studentId: OMAR
  });
  assert.equal(report.parts[0].attempts[0].textChanged, true);
});

test("a part removed from the assignment keeps its history but not the totals", async (t) => {
  stubReport(t, {
    assignmentValue: assignment({
      fluency: {
        enabled: true,
        parts: [{ key: "s-0", level: null }],
        minReadings: 2,
        maxReadingsPerPart: 6,
        targetAccuracy: 95,
        targetWpm: null,
        showPace: true,
        requireListenFirst: false
      }
    }),
    progress: [progressRow(OMAR, "s-1", { readings: 4 })],
    attempts: [
      attemptRow(OMAR, "s-1", { accuracy: 85, createdAt: at(7) }),
      attemptRow(OMAR, "s-1", { accuracy: 85, createdAt: at(8) })
    ]
  });
  const report = await getFluencyStudentReport({
    schoolId,
    assignmentId,
    studentId: OMAR
  });

  assert.equal(report.parts.length, 2);
  const removed = report.parts.find((part) => part.key === "s-1");
  assert.equal(removed.enabled, false);
  assert.equal(removed.attempts.length, 2);
  assert.equal(report.totals.readings, 0);
  assert.equal(report.student.status, "not_started");
});

test("a student outside the roster with no activity is not reportable", async (t) => {
  stubReport(t, { progress: [], attempts: [] });
  await assert.rejects(
    getFluencyStudentReport({ schoolId, assignmentId, studentId: MOVED }),
    (error) => error.statusCode === 404 && error.code === "FLUENCY_REPORT_NOT_FOUND"
  );
});

test("CSV export quotes fields, prefixes formulas and includes every part", async (t) => {
  const roster = students().map((student) => (
    student._id === OMAR ? { ...student, firstName: "=SUM(A1)", lastName: "Khalid" } : student
  ));
  t.mock.method(ReadingAssignment, "findOne", () => query(assignment()));
  t.mock.method(Student, "findOne", () => query(roster[1]));
  t.mock.method(Student, "find", () => query(roster));
  t.mock.method(ReadingFluencyProgress, "find", () => query(progressFixture()));
  t.mock.method(ReadingFluencyAttempt, "find", () => query(attemptsFixture()));

  const { filename, filenameUtf8, csv } = await exportFluencyCsv({ schoolId, assignmentId });
  const lines = csv.replace(/^\uFEFF/, "").trim().split("\r\n");

  assert.equal(filename, "Creating-a-Nation.csv");
  assert.equal(filenameUtf8, "Creating a Nation.csv");
  assert.ok(csv.startsWith("\uFEFF"));
  assert.equal(lines.length, 1 + 5 * 2);
  assert.equal(
    lines[0],
    '"Student","Class","Part","Readings","First accuracy","Latest accuracy",' +
      '"Best accuracy","First pace (wpm)","Latest pace (wpm)","Long pauses (latest)",' +
      '"Goal met","Last practised"'
  );
  assert.ok(lines.some((line) => line.startsWith(`"'=SUM(A1) Khalid"`)));
  assert.ok(lines.some((line) => line.includes('"Money and the Stamp Act"')));
  assert.ok(lines.every((line) => line.split(",").length >= 12));
});

test("turning reading aloud off leaves the class report empty and blocks CSV", async (t) => {
  stubReport(t, {
    assignmentValue: assignment({
      fluency: {
        enabled: false,
        parts: [],
        minReadings: 3,
        maxReadingsPerPart: 6,
        targetAccuracy: 95,
        targetWpm: null,
        showPace: true,
        requireListenFirst: false
      }
    })
  });

  const report = await getFluencyClassReport({ schoolId, assignmentId });
  assert.equal(report.enabled, false);
  assert.deepEqual(report.students, []);
  assert.equal(report.totals.assigned, 0);
  assert.equal((await getFluencyHardWords({ schoolId, assignmentId })).words.length, 0);

  await assert.rejects(
    exportFluencyCsv({ schoolId, assignmentId }),
    (error) => error.statusCode === 409 && error.code === "FLUENCY_DISABLED"
  );
});

test("an Arabic title downloads under an ASCII name plus a UTF-8 header", async (t) => {
  stubExport(t, "إنشاء أمة");
  const { filename, filenameUtf8 } = await exportFluencyCsv({ schoolId, assignmentId });
  const header = csvContentDisposition(filename, filenameUtf8);

  assert.equal(filename, "reading-fluency.csv");
  assert.equal(filenameUtf8, "إنشاء أمة.csv");
  assert.ok(header.startsWith("attachment; filename=\"reading-fluency.csv\""));
  assert.ok(header.includes("filename*=UTF-8''"));
  // Node throws ERR_INVALID_CHAR on a header value outside Latin-1.
  assert.equal(/[^\x20-\x7e]/.test(header), false);
  assert.ok(header.includes(encodeURIComponent("إنشاء أمة.csv")));
});

test("a title with quotes, newlines and slashes cannot break the header", async (t) => {
  stubExport(t, 'Bad "title"\r\n/with slashes');
  const { filename, filenameUtf8 } = await exportFluencyCsv({ schoolId, assignmentId });
  const header = csvContentDisposition(filename, filenameUtf8);

  assert.equal(filename, "Bad-title-with-slashes.csv");
  assert.equal(filenameUtf8, "Bad title with slashes.csv");
  assert.equal(header.split('"').length - 1, 2);
  assert.equal(/[\r\n]/.test(header), false);
  assert.equal(/[^\x20-\x7e]/.test(header), false);
});

test("a title with nothing usable falls back to a plain name", async (t) => {
  stubExport(t, "");
  const { filename, filenameUtf8 } = await exportFluencyCsv({ schoolId, assignmentId });

  assert.equal(filename, "reading-fluency.csv");
  assert.equal(filenameUtf8, "reading-fluency.csv");
  assert.equal(
    csvContentDisposition(filename, filenameUtf8),
    "attachment; filename=\"reading-fluency.csv\"; filename*=UTF-8''reading-fluency.csv"
  );
});

test("the extended filename escapes the characters RFC 5987 leaves alone", () => {
  const header = csvContentDisposition("report.csv", "it's a (big) *report*.csv");
  const extended = header.split("filename*=UTF-8''")[1];

  assert.ok(extended.includes("%27"));
  assert.ok(extended.includes("%28"));
  assert.ok(extended.includes("%29"));
  assert.ok(extended.includes("%2A"));
  assert.equal(/['()*]/.test(extended), false);
});
