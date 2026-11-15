import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { URL } from "node:url";

/*
 * The one rule this module must never break: a student's writing path makes no
 * AI calls. Assessment is teacher-triggered, so anything reachable from
 * /api/writing/my* must stay free of the AI service. These tests read the
 * source instead of a mock so the guard survives a refactor.
 */

const read = (relative) => readFile(new URL(relative, import.meta.url), "utf8");

// The source uses double quotes; these guards must survive a reformat, so they
// match either style instead of pinning one.
const eitherQuote = (source) => source.replace(/"/g, "'");

const SERVICE = "../services/writingAssistantService.js";
const CONTROLLER = "../controllers/writingController.js";
const ROUTES = "../routes/writingRoutes.js";
const ASSESSMENT = "../services/writingAssistantAssessmentService.js";

const STUDENT_HANDLERS = [
  "myWriting",
  "myProject",
  "myProjectById",
  "autosaveProject",
  "submitProject",
  "reportPasteAttempt",
  "markNotebookWritten",
  "printProject",
];

// Only the student block of the controller, i.e. everything from myWriting on.
const studentSection = (source) => {
  const start = source.indexOf("export const myWriting");
  assert.notEqual(
    start,
    -1,
    "writingController.js must keep its student handlers together",
  );
  return source.slice(start);
};

const serviceCalls = (source) =>
  [...source.matchAll(/writingService\.([A-Za-z0-9_]+)/g)].map(
    (match) => match[1],
  );

const ALLOWED_SERVICE_CALLS = [
  "getStudentFeed",
  "openProject",
  "getStudentProject",
  "autosaveProject",
  "submitDraft",
  "recordPasteAttempt",
  "markNotebookWritten",
];

test("no writing file on the student path imports the AI", async () => {
  for (const file of [SERVICE, CONTROLLER, ROUTES]) {
    const source = await read(file);
    for (const forbidden of [
      "connectAi",
      "writingAssistantPrompts",
      "aiService",
      "gemini",
    ]) {
      assert.equal(
        source.includes(forbidden),
        false,
        `${file} must not reference ${forbidden}`,
      );
    }
  }
});

test("student handlers only call the seven non-AI service functions", async () => {
  const source = studentSection(await read(CONTROLLER));
  const calls = [...new Set(serviceCalls(source))].sort();
  assert.deepEqual(calls, [...ALLOWED_SERVICE_CALLS].sort());
});

test("the rest of the controller never reuses a student handler name", async () => {
  const source = await read(CONTROLLER);
  const teacherSection = source.slice(
    0,
    source.indexOf("export const myWriting"),
  );
  for (const handler of STUDENT_HANDLERS) {
    assert.equal(
      new RegExp(`export const ${handler}\\b`).test(teacherSection),
      false,
      `${handler} belongs to the student block only`,
    );
  }
});

/*
 * Route guards are asserted by walking the real router and invoking the real
 * middleware, not by matching source text. A reformat or a quote-style change
 * cannot make these pass or fail; only a change to the actual chain can.
 */
const loadRouter = async () => (await import(ROUTES)).default;

const routeLayers = (router) => router.stack.filter((layer) => layer.route);

const guardResult = (guard, role) => {
  let status = null;
  let passed = false;
  const res = {
    status(code) {
      status = code;
      return this;
    },
    json() {
      return this;
    },
  };
  guard({ user: { role, roles: [role] } }, res, () => {
    passed = true;
  });
  return { status, passed };
};

const STUDENT_PATHS = [
  "/my",
  "/assignments/:assignmentId/open",
  "/projects/:projectId",
  "/projects/:projectId/print",
  "/projects/:projectId/autosave",
  "/projects/:projectId/paste-attempts",
  "/projects/:projectId/submit",
  "/projects/:projectId/notebook-written",
];

test("every student route admits a student and refuses every staff role", async () => {
  const layers = routeLayers(await loadRouter());
  const studentLayers = layers.filter((layer) => {
    const guard = layer.route.stack[0]?.handle;
    return typeof guard === "function" && guardResult(guard, "student").passed;
  });

  assert.deepEqual(
    studentLayers.map((layer) => layer.route.path).sort(),
    [...STUDENT_PATHS].sort(),
    "the student-guarded routes must be exactly the eight student paths",
  );

  for (const layer of studentLayers) {
    const guard = layer.route.stack[0].handle;
    for (const role of ["teacher", "admin", "super_admin", "parent"]) {
      const result = guardResult(guard, role);
      assert.equal(
        result.passed,
        false,
        `${layer.route.path} must not admit ${role}`,
      );
      assert.equal(result.status, 403);
    }
  }
});

test("teacher routes stay behind the staff guard and never guard /my", async () => {
  const layers = routeLayers(await loadRouter());
  const staffLayers = layers.filter((layer) => {
    const guard = layer.route.stack[0]?.handle;
    if (typeof guard !== "function") return false;
    return (
      guardResult(guard, "teacher").passed &&
      guardResult(guard, "admin").passed &&
      !guardResult(guard, "student").passed
    );
  });

  assert.ok(
    staffLayers.length >= 11,
    "teacher CRUD, board and history routes must use staff",
  );
  assert.equal(
    staffLayers.some((layer) => layer.route.path === "/my"),
    false,
    "/my must never be staff-guarded",
  );
  for (const layer of staffLayers) {
    assert.equal(
      guardResult(layer.route.stack[0].handle, "parent").passed,
      false,
      `${layer.route.path} must not admit a parent`,
    );
  }
});

test("the eight student routes bind the eight student handlers", async () => {
  // Handler identity is not observable from the wrapped asyncHandler closure,
  // so this one guard stays a source parse — quote- and layout-agnostic.
  const source = eitherQuote(await read(ROUTES)).replace(/\s+/g, " ");
  const studentRoutes = [
    ...source.matchAll(/router\.(get|post|put)\(\s*'([^']+)',\s*([^;]+);/g),
  ].filter((match) => match[3].includes("authorize('student')"));

  assert.equal(studentRoutes.length, 8, "all eight student routes must exist");
  assert.deepEqual(
    studentRoutes.map((route) => route[2]).sort(),
    [...STUDENT_PATHS].sort(),
  );
  for (const route of studentRoutes) {
    const handler = route[3]
      .trim()
      .replace(/\)$/, "")
      .replace(/,\s*$/, "")
      .split(",")
      .pop()
      .trim();
    assert.ok(
      STUDENT_HANDLERS.includes(handler),
      `${route[2]} is bound to ${handler}, which is not a student handler`,
    );
  }
});

test("the writing service exports the student-facing functions", async () => {
  const module = await import(SERVICE);
  for (const name of ALLOWED_SERVICE_CALLS) {
    assert.equal(typeof module[name], "function", `${name} must be exported`);
  }
});

test("teacher assessment lives in its own service and is the only AI entry point", async () => {
  const assessment = await read(ASSESSMENT);
  assert.ok(
    assessment.includes("connectAi"),
    "the assessment service must call the AI",
  );
  assert.ok(
    assessment.includes("writingAssistantPrompts"),
    "the assessment service owns prompt building",
  );

  const controller = await read(CONTROLLER);
  const teacherSection = controller.slice(
    0,
    controller.indexOf("export const myWriting"),
  );
  const calls = [
    ...new Set(
      [
        ...teacherSection.matchAll(
          /writingAssessmentService\.([A-Za-z0-9_]+)/g,
        ),
      ].map((m) => m[1]),
    ),
  ];
  for (const name of [
    "assessDraft",
    "assessPendingBatch",
    "compareDrafts",
    "saveAssessmentEdits",
    "publishAssessment",
    "overrideStage",
    "recordNotebookReview",
  ]) {
    assert.ok(
      calls.includes(name),
      `${name} must be reachable from the teacher block`,
    );
  }
});

test("the student read path exposes published feedback only", async () => {
  const source = eitherQuote(await read(SERVICE));
  assert.ok(
    source.includes("'publish.state': 'published'"),
    "getStudentProject must filter to published assessments",
  );
  assert.ok(
    source.includes("select('-aiOriginal')"),
    "the teacher history must not ship the AI original back down",
  );
});

test("every writing AI call is pinned to OpenAI", async () => {
  const assessment = eitherQuote(await read(ASSESSMENT));
  const calls = assessment.match(/connectAi\([^;]*;/g) || [];
  assert.ok(calls.length >= 2, "feedback and comparison must both call the AI");
  assert.ok(
    assessment.includes("provider: 'openai'"),
    "the writing AI provider must be hard-coded to OpenAI",
  );
  assert.equal(
    assessment.includes("WRITING_AI_PROVIDER"),
    false,
    "the provider must not be configurable by environment",
  );
  for (const call of calls) {
    assert.match(
      call,
      /aiOptions\(\{/,
      "every call must build its options through aiOptions",
    );
  }
});

test("the assessment service exports every workflow entry point", async () => {
  const module = await import(ASSESSMENT);
  for (const name of [
    "assessDraft",
    "assessPendingBatch",
    "compareDrafts",
    "saveAssessmentEdits",
    "publishAssessment",
    "overrideStage",
    "recordNotebookReview",
  ]) {
    assert.equal(typeof module[name], "function", `${name} must be exported`);
  }
});

/* ------------------------------------------------------------------ */
/* Writing Analysis — live by owner decision, so it needs the same      */
/* boundary guards as the Assistant.                                    */
/* ------------------------------------------------------------------ */

const ANALYSIS_SERVICE = "../services/writingAnalysisService.js";
const ANALYSIS_PROMPTS = "../services/writingAnalysisPrompts.js";
const ANALYSIS_LOGIC = "../services/writingAnalysisLogic.js";
const ANALYSIS_CONTROLLER = "../controllers/writingAnalysisController.js";

const ANALYSIS_PATHS = [
  "/analysis/scope",
  "/analysis",
  "/analysis/:analysisId",
  "/analysis/:analysisId/publish-preview",
  "/analysis/:analysisId/retry",
  "/analysis/:analysisId/publish",
];

test("every analysis route is staff-only and refuses students and parents", async () => {
  const layers = routeLayers(await loadRouter());
  const analysisLayers = layers.filter((layer) =>
    ANALYSIS_PATHS.includes(layer.route.path),
  );
  assert.deepEqual(
    [...new Set(analysisLayers.map((layer) => layer.route.path))].sort(),
    [...ANALYSIS_PATHS].sort(),
    "every analysis path must be registered",
  );
  for (const layer of analysisLayers) {
    const guard = layer.route.stack[0].handle;
    for (const role of ["teacher", "admin", "super_admin"]) {
      assert.equal(
        guardResult(guard, role).passed,
        true,
        `${layer.route.path} must admit ${role}`,
      );
    }
    for (const role of ["student", "parent"]) {
      const result = guardResult(guard, role);
      assert.equal(
        result.passed,
        false,
        `${layer.route.path} must never admit ${role}`,
      );
      assert.equal(result.status, 403);
    }
  }
});

test("no student handler can reach the analysis service or its prompts", async () => {
  const source = await read(CONTROLLER);
  const studentSection = source.slice(source.indexOf("export const myWriting"));
  for (const forbidden of [
    "writingAnalysisService",
    "writingAnalysisPrompts",
    "analysisService",
    "runAnalysis",
    "publishAnalysis",
  ]) {
    assert.equal(
      studentSection.includes(forbidden),
      false,
      `the student block must not reference ${forbidden}`,
    );
  }
  const routes = eitherQuote(await read(ROUTES));
  const studentRoutes = routes
    .split("/*")
    .find((block) => block.includes("Student. These routes"));
  assert.ok(studentRoutes, "the student route block must stay labelled");
  assert.equal(
    /analysis/i.test(studentRoutes),
    false,
    "no analysis route may sit in the student block",
  );
});

test("the analysis rules module never touches Mongo or the AI", async () => {
  const logic = await read(ANALYSIS_LOGIC);
  for (const forbidden of [
    "connectAi",
    "mongoose",
    "models/",
    "aiCreditService",
    "writingAnalysisPrompts",
  ]) {
    assert.equal(
      logic.includes(forbidden),
      false,
      `writingAnalysisLogic.js must not reference ${forbidden}`,
    );
  }
});

test("the analysis service is the only analysis AI entry point", async () => {
  const service = await read(ANALYSIS_SERVICE);
  assert.ok(
    service.includes("connectAi"),
    "the analysis service must own the AI call",
  );
  assert.ok(
    service.includes("writingAnalysisPrompts"),
    "the analysis service must own prompt building",
  );
  const prompts = await read(ANALYSIS_PROMPTS);
  assert.equal(
    prompts.includes("connectAi"),
    false,
    "prompt building must not call the AI itself",
  );
  const controller = await read(ANALYSIS_CONTROLLER);
  assert.equal(
    controller.includes("connectAi"),
    false,
    "the controller must not call the AI",
  );
});

test("analysis prompts scrub the full name and every name part", async () => {
  const { promptSafeText } = await import(ANALYSIS_PROMPTS);
  const essay =
    "My name is Sara Ahmed Khan and I live in Dubai. Call me on 0501234567. " +
    "Sara wrote about her cat. Ahmed likes football.";
  const safe = promptSafeText(essay, "Sara Ahmed Khan");
  for (const leak of ["Sara", "Ahmed", "Khan", "0501234567"]) {
    assert.equal(
      safe.includes(leak),
      false,
      `the analysis prompt must not contain ${leak}`,
    );
  }
  assert.ok(safe.includes("cat"), "the essay text must survive scrubbing");
  assert.ok(safe.includes("football"), "the essay text must survive scrubbing");
});

test("a retry checks visibility before it claims the run", async () => {
  const service = eitherQuote(await read(ANALYSIS_SERVICE));
  const start = service.indexOf("export const runAnalysis");
  assert.notEqual(start, -1, "runAnalysis must exist");
  const next = service.slice(start + 10).search(/\n(?:export )?const /);
  const body = service.slice(start, start + 10 + next);
  const guardAt = body.indexOf("loadVisibleAnalysis");
  const claimAt = body.indexOf("findOneAndUpdate");
  assert.notEqual(guardAt, -1, "runAnalysis must check visibility");
  assert.notEqual(claimAt, -1, "runAnalysis must claim the run");
  assert.ok(
    guardAt < claimAt,
    "the visibility check must run before the claim, not after it",
  );
  const controller = await read(ANALYSIS_CONTROLLER);
  const retry = controller.slice(controller.indexOf("export const retryAnalysis"));
  assert.ok(
    retry.includes("isAdmin"),
    "retryAnalysis must pass the caller's admin flag through",
  );
});
