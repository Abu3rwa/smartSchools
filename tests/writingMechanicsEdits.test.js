/**
 * W01–W16: the teacher save/publish round-trip for language corrections.
 * Every correction is revalidated against the assessed draft before anything
 * mutates; omission preserves, [] clears, malformed input refuses the whole
 * request, and publishing runs the same validator as saving.
 */
import test from "node:test";
import assert from "node:assert/strict";
import process from "node:process";
import mongoose from "mongoose";

import WritingAssignment from "../models/WritingAssignment.js";
import WritingProject from "../models/WritingProject.js";
import WritingDraft from "../models/WritingDraft.js";
import WritingAssessment from "../models/WritingAssessment.js";
import {
  publishAssessment,
  saveAssessmentEdits,
} from "../services/writingAssistantAssessmentService.js";
import { childSections } from "../services/writingAssistantService.js";

// The publish path dispatches email fire-and-forget; these tests never send.
process.env.WRITING_EMAIL_DELIVERY = "off";

const oid = () => new mongoose.Types.ObjectId().toString();
const schoolId = oid();
const teacherId = oid();
const assignmentId = oid();
const projectId = oid();
const draftId = oid();

const BODY_TEXT =
  "It will make them have healthy body and increase their focus.";

const draftSection = (text = BODY_TEXT) => ({
  key: "body",
  index: 0,
  label: "Body",
  text,
});

const typedRow = (overrides = {}) => ({
  category: "grammar",
  original: "healthy body",
  correction: "a healthy body",
  explanation: "Use a before the singular countable noun body.",
  anchor: { start: 23, end: 35 },
  ...overrides,
});

const secondRow = () => ({
  category: "punctuation",
  original: "focus.",
  correction: "focus!",
  explanation: "End this excited sentence with an exclamation mark.",
  anchor: { start: 55, end: 61 },
});

/** Mongoose subdocs detach through toObject; the harness must do the same. */
const subdoc = (value) => ({
  ...value,
  toObject() {
    return JSON.parse(JSON.stringify(this));
  },
});

const makeAssessment = (overrides = {}) => {
  const doc = {
    _id: oid(),
    school: schoolId,
    project: projectId,
    assignment: assignmentId,
    draft: draftId,
    kind: "feedback",
    aiStatus: "done",
    publish: { state: "draft" },
    language: "en",
    sections: [
      subdoc({
        key: "body",
        index: 0,
        label: "Body",
        strengths: ["A clear idea."],
        improvements: [],
        evidence: "",
        why: "",
        nextStep: "Add a reason.",
        mechanics: [typedRow()],
        mechanicsReview: { version: 1, status: "checked" },
        score: 3,
        maxScore: 5,
      }),
    ],
    overall: subdoc({ summary: "A clear opinion.", nextPriorities: ["Add one reason."] }),
    scores: [
      subdoc({ key: "ideas", label: "Ideas", score: 3, maxScore: 5, explanation: "", evidence: "" }),
    ],
    tasks: [subdoc({ id: "t1", text: "Add one reason.", done: false })],
    spellingTargets: [],
    recommendation: { path: "revise" },
    scoreAdjustments: [],
    totalScore: 3,
    saveCalls: 0,
    set(values) {
      Object.assign(this, values);
    },
    async save() {
      this.saveCalls += 1;
    },
    toObject() {
      return { ...this };
    },
    ...overrides,
  };
  return doc;
};

const stub = (target, key, replacement) => {
  const original = target[key];
  target[key] = replacement;
  return () => {
    target[key] = original;
  };
};

const chain = (value) => {
  const query = {
    select: () => query,
    populate: () => query,
    sort: () => query,
    lean: async () => value,
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
  return query;
};

const makeProject = () => ({
  _id: projectId,
  school: schoolId,
  assignment: assignmentId,
  stage: "submitted",
  status: "submitted",
  latestDraft: draftId,
  draftCount: 1,
  saveCalls: 0,
  async save() {
    this.saveCalls += 1;
  },
});

/**
 * The draft read is asserted tenant-scoped here: a correction may only be
 * checked against the assessed draft of this school, never another one's.
 */
const withStubs = (t, { assessment, sections = [draftSection()], run }) => {
  const project = makeProject();
  const restores = [
    stub(WritingAssessment, "findOne", async () => assessment),
    stub(WritingProject, "findOne", async () => project),
    stub(WritingAssignment, "findOne", () => chain({ assignedBy: teacherId })),
    stub(WritingDraft, "findOne", (query) => {
      assert.equal(String(query.school), schoolId);
      assert.equal(String(query._id), String(assessment.draft));
      return chain({ withdrawn: false, sections });
    }),
    stub(WritingAssessment, "findOneAndUpdate", async () => ({ _id: assessment._id })),
    stub(WritingAssessment, "updateOne", async () => ({ ok: 1 })),
  ];
  t.after(() => restores.reverse().forEach((restore) => restore()));
  return run({ assessment, project });
};

const save = (assessment, payload) =>
  saveAssessmentEdits({
    schoolId,
    assessmentId: String(assessment._id),
    userId: teacherId,
    payload,
  });

const mechanicsError = (error, code) => {
  assert.equal(error.statusCode, 400);
  assert.equal(error.code, code);
  assert.ok(Array.isArray(error.details) && error.details.length > 0);
  assert.match(error.details[0].path, /^sections\.body:0\.mechanics/);
  return true;
};

/* ------------------------------------------------------------------ */
/* Save round-trip                                                     */
/* ------------------------------------------------------------------ */

test("W01: a typed row survives form payload, save and student projection", async (t) => {
  const assessment = makeAssessment();
  await withStubs(t, {
    assessment,
    run: async () => {
      await save(assessment, {
        sections: [{ key: "body", index: 0, mechanics: [typedRow()] }],
      });
      assert.deepEqual(assessment.sections[0].mechanics, [typedRow()]);
      const [projected] = childSections(assessment.sections);
      assert.deepEqual(projected.mechanics, [typedRow()]);
      assert.deepEqual(projected.mechanicsReview, { version: 1, status: "checked" });
    },
  });
});

test("W02: a summary-only save leaves corrections and review status untouched", async (t) => {
  const assessment = makeAssessment();
  await withStubs(t, {
    assessment,
    run: async () => {
      await save(assessment, { overall: { summary: "A clearer summary." } });
      assert.deepEqual(assessment.sections[0].mechanics, [typedRow()]);
      assert.deepEqual(assessment.sections[0].mechanicsReview, {
        version: 1,
        status: "checked",
      });
      const paths = assessment.teacherEdits.changedPaths;
      assert.deepEqual(paths, ["overall.summary"]);
    },
  });
});

test("W03: a section patch without mechanics keeps the stored rows", async (t) => {
  const assessment = makeAssessment();
  await withStubs(t, {
    assessment,
    run: async () => {
      await save(assessment, {
        sections: [{ key: "body", index: 0, nextStep: "Add two reasons." }],
      });
      assert.deepEqual(assessment.sections[0].mechanics, [typedRow()]);
      assert.equal(assessment.sections[0].nextStep, "Add two reasons.");
    },
  });
});

test("W04: an explicit empty array clears the part without inventing a review", async (t) => {
  const assessment = makeAssessment();
  await withStubs(t, {
    assessment,
    run: async () => {
      await save(assessment, {
        sections: [{ key: "body", index: 0, mechanics: [] }],
      });
      assert.deepEqual(assessment.sections[0].mechanics, []);
      assert.deepEqual(assessment.sections[0].mechanicsReview, {
        version: 1,
        status: "checked",
      });
      assert.ok(
        assessment.teacherEdits.changedPaths.includes("sections.body:0.mechanics"),
      );
    },
  });
});

test("W04: null mechanics is a bounded error, not a silent clear", async (t) => {
  const assessment = makeAssessment();
  await withStubs(t, {
    assessment,
    run: async () => {
      await assert.rejects(
        save(assessment, { sections: [{ key: "body", index: 0, mechanics: null }] }),
        (error) => mechanicsError(error, "WRITING_MECHANICS_INVALID"),
      );
      assert.deepEqual(assessment.sections[0].mechanics, [typedRow()]);
      assert.equal(assessment.saveCalls, 0);
    },
  });
});

test("W04: an object or a malformed row refuses the whole request", async (t) => {
  const assessment = makeAssessment();
  await withStubs(t, {
    assessment,
    run: async () => {
      await assert.rejects(
        save(assessment, { sections: [{ key: "body", index: 0, mechanics: {} }] }),
        (error) => mechanicsError(error, "WRITING_MECHANICS_INVALID"),
      );
      await assert.rejects(
        save(assessment, { sections: [{ key: "body", index: 0, mechanics: [42] }] }),
        (error) => {
          mechanicsError(error, "WRITING_MECHANICS_INVALID");
          assert.equal(error.details[0].path, "sections.body:0.mechanics[0]");
          return true;
        },
      );
      assert.deepEqual(assessment.sections[0].mechanics, [typedRow()]);
      assert.equal(assessment.saveCalls, 0);
    },
  });
});

test("W05: a stale anchor is rejected against the assessed draft", async (t) => {
  const assessment = makeAssessment();
  await withStubs(t, {
    assessment,
    run: async () => {
      await assert.rejects(
        save(assessment, {
          sections: [
            { key: "body", index: 0, mechanics: [typedRow({ anchor: { start: 0, end: 12 } })] },
          ],
        }),
        (error) => mechanicsError(error, "WRITING_MECHANICS_ANCHOR_MISMATCH"),
      );
      assert.deepEqual(assessment.sections[0].mechanics, [typedRow()]);
      assert.equal(assessment.saveCalls, 0);
    },
  });
});

test("W05: a forged original that is not in the draft is rejected", async (t) => {
  const assessment = makeAssessment();
  await withStubs(t, {
    assessment,
    run: async () => {
      await assert.rejects(
        save(assessment, {
          sections: [
            {
              key: "body",
              index: 0,
              mechanics: [typedRow({ original: "not in the draft", anchor: undefined })],
            },
          ],
        }),
        (error) => mechanicsError(error, "WRITING_MECHANICS_ANCHOR_MISMATCH"),
      );
      assert.equal(assessment.saveCalls, 0);
    },
  });
});

test("W05: an ambiguous occurrence without a selection is rejected", async (t) => {
  const assessment = makeAssessment();
  await withStubs(t, {
    assessment,
    sections: [draftSection("We go out. We go in.")],
    run: async () => {
      await assert.rejects(
        save(assessment, {
          sections: [
            {
              key: "body",
              index: 0,
              mechanics: [
                {
                  category: "verb_tense",
                  original: "go",
                  correction: "went",
                  explanation: "The sentence is about yesterday.",
                },
              ],
            },
          ],
        }),
        (error) => mechanicsError(error, "WRITING_MECHANICS_ANCHOR_MISMATCH"),
      );
    },
  });
});

test("W06: one invalid row fails the request without partially saving other edits", async (t) => {
  const assessment = makeAssessment();
  await withStubs(t, {
    assessment,
    run: async () => {
      await assert.rejects(
        save(assessment, {
          sections: [
            { key: "body", index: 0, score: 5, mechanics: [typedRow({ category: "style" })] },
          ],
          overall: { summary: "A different summary." },
        }),
        (error) => mechanicsError(error, "WRITING_MECHANICS_INVALID"),
      );
      assert.equal(assessment.sections[0].score, 3);
      assert.equal(assessment.overall.summary, "A clear opinion.");
      assert.deepEqual(assessment.sections[0].mechanics, [typedRow()]);
      assert.equal(assessment.saveCalls, 0);
      assert.equal(assessment.teacherEdits, undefined);
    },
  });
});

test("W11: adding a correction changes no score, task or recommendation", async (t) => {
  const assessment = makeAssessment();
  await withStubs(t, {
    assessment,
    run: async () => {
      await save(assessment, {
        sections: [{ key: "body", index: 0, mechanics: [typedRow(), secondRow()] }],
      });
      assert.equal(assessment.sections[0].mechanics.length, 2);
      assert.equal(assessment.sections[0].score, 3);
      assert.deepEqual(
        assessment.scores.map((row) => row.toObject()),
        [{ key: "ideas", label: "Ideas", score: 3, maxScore: 5, explanation: "", evidence: "" }],
      );
      assert.deepEqual(
        assessment.tasks.map((row) => row.toObject()),
        [{ id: "t1", text: "Add one reason.", done: false }],
      );
      assert.deepEqual(assessment.recommendation, { path: "revise" });
      assert.equal(assessment.totalScore, 3);
    },
  });
});

test("W15: an unchanged legacy pair survives a resend byte-for-byte", async (t) => {
  const legacy = { original: "becaus", correction: "because" };
  const assessment = makeAssessment();
  assessment.sections[0].mechanics = [legacy];
  delete assessment.sections[0].mechanicsReview;
  await withStubs(t, {
    assessment,
    run: async () => {
      await save(assessment, {
        sections: [{ key: "body", index: 0, mechanics: [{ ...legacy }] }],
      });
      assert.deepEqual(assessment.sections[0].mechanics, [legacy]);
      assert.equal("category" in assessment.sections[0].mechanics[0], false);
      assert.equal(assessment.teacherEdits, undefined);
    },
  });
});

test("W15: a legacy pair with an empty correction is refused, not a deletion", async (t) => {
  const assessment = makeAssessment();
  await withStubs(t, {
    assessment,
    run: async () => {
      await assert.rejects(
        save(assessment, {
          sections: [
            { key: "body", index: 0, mechanics: [{ original: "becaus", correction: "" }] },
          ],
        }),
        (error) => mechanicsError(error, "WRITING_MECHANICS_INVALID"),
      );
    },
  });
});

test("legacy pairs and typed rows can share one part", async (t) => {
  const assessment = makeAssessment();
  assessment.sections[0].mechanics = [];
  await withStubs(t, {
    assessment,
    run: async () => {
      await save(assessment, {
        sections: [
          {
            key: "body",
            index: 0,
            mechanics: [typedRow(), { original: "becaus", correction: "because" }],
          },
        ],
      });
      assert.equal(assessment.sections[0].mechanics.length, 2);
      assert.deepEqual(assessment.sections[0].mechanics[1], {
        original: "becaus",
        correction: "because",
      });
    },
  });
});

const LIMIT_WORDS =
  "one two three four five six seven eight nine ten eleven twelve thirteen".split(" ");
const LIMIT_TEXT = `${LIMIT_WORDS.join(" ")}.`;
const limitRows = (count) => {
  let cursor = 0;
  return LIMIT_WORDS.slice(0, count).map((word) => {
    const start = LIMIT_TEXT.indexOf(word, cursor);
    cursor = start + word.length;
    return {
      category: "spelling",
      original: word,
      correction: word.toUpperCase(),
      explanation: "Capitalize this word.",
      anchor: { start, end: start + word.length },
    };
  });
};

test("C17/W04: thirteen corrections exceed the part limit with a bounded code", async (t) => {
  const assessment = makeAssessment();
  await withStubs(t, {
    assessment,
    sections: [draftSection(LIMIT_TEXT)],
    run: async () => {
      await assert.rejects(
        save(assessment, {
          sections: [{ key: "body", index: 0, mechanics: limitRows(13) }],
        }),
        (error) => mechanicsError(error, "WRITING_MECHANICS_LIMIT"),
      );
      await save(assessment, {
        sections: [{ key: "body", index: 0, mechanics: limitRows(12) }],
      });
      assert.equal(assessment.sections[0].mechanics.length, 12);
    },
  });
});

test("C12: an exact duplicate proposal is stored once", async (t) => {
  const assessment = makeAssessment();
  await withStubs(t, {
    assessment,
    run: async () => {
      await save(assessment, {
        sections: [{ key: "body", index: 0, mechanics: [typedRow(), typedRow()] }],
      });
      assert.deepEqual(assessment.sections[0].mechanics, [typedRow()]);
    },
  });
});

test("C13: contradictory replacements for one span refuse the save", async (t) => {
  const assessment = makeAssessment();
  await withStubs(t, {
    assessment,
    run: async () => {
      await assert.rejects(
        save(assessment, {
          sections: [
            {
              key: "body",
              index: 0,
              mechanics: [typedRow(), typedRow({ correction: "the healthy body" })],
            },
          ],
        }),
        (error) => mechanicsError(error, "WRITING_MECHANICS_ANCHOR_MISMATCH"),
      );
      assert.equal(assessment.saveCalls, 0);
    },
  });
});

test("teacher wording that would hurt a child refuses the mechanics save", async (t) => {
  const assessment = makeAssessment();
  await withStubs(t, {
    assessment,
    run: async () => {
      await assert.rejects(
        save(assessment, {
          sections: [
            { key: "body", index: 0, mechanics: [typedRow({ explanation: "This is stupid." })] },
          ],
        }),
        (error) => {
          assert.equal(error.statusCode, 400);
          assert.match(error.message, /cannot be sent to a child/);
          return true;
        },
      );
      assert.deepEqual(assessment.sections[0].mechanics, [typedRow()]);
      assert.equal(assessment.saveCalls, 0);
    },
  });
});

test("a client-supplied review status is ignored; the server keeps its own", async (t) => {
  const assessment = makeAssessment();
  await withStubs(t, {
    assessment,
    run: async () => {
      await save(assessment, {
        sections: [
          {
            key: "body",
            index: 0,
            mechanics: [typedRow()],
            mechanicsReview: { version: 9, status: "checked", reasons: [] },
          },
        ],
      });
      assert.deepEqual(assessment.sections[0].mechanicsReview, {
        version: 1,
        status: "checked",
      });
    },
  });
});

test("a mechanics edit is audited and the AI original stays the baseline", async (t) => {
  const assessment = makeAssessment();
  await withStubs(t, {
    assessment,
    run: async () => {
      await save(assessment, {
        sections: [{ key: "body", index: 0, mechanics: [typedRow(), secondRow()] }],
      });
      const edit = assessment.teacherEdits;
      assert.ok(edit.changedPaths.includes("sections.body:0.mechanics"));
      assert.equal(edit.by, teacherId);
      assert.deepEqual(assessment.aiOriginal.sections[0].mechanics, [typedRow()]);
    },
  });
});

/* ------------------------------------------------------------------ */
/* Publish runs the same validation                                    */
/* ------------------------------------------------------------------ */

const publish = (assessment, payload = {}) =>
  publishAssessment({
    schoolId,
    assessmentId: String(assessment._id),
    userId: teacherId,
    payload,
  });

test("publish stores validated corrections and marks the round published", async (t) => {
  const assessment = makeAssessment();
  await withStubs(t, {
    assessment,
    run: async ({ project }) => {
      const result = await publish(assessment, {
        sections: [{ key: "body", index: 0, mechanics: [typedRow(), secondRow()] }],
      });
      assert.equal(result.alreadyPublished, false);
      assert.equal(assessment.publish.state, "published");
      assert.equal(assessment.sections[0].mechanics.length, 2);
      assert.equal(project.saveCalls, 1);
    },
  });
});

test("publish refuses an invalid correction without publishing anything", async (t) => {
  const assessment = makeAssessment();
  await withStubs(t, {
    assessment,
    run: async ({ project }) => {
      await assert.rejects(
        publish(assessment, {
          sections: [
            { key: "body", index: 0, mechanics: [typedRow({ anchor: { start: 0, end: 12 } })] },
          ],
        }),
        (error) => mechanicsError(error, "WRITING_MECHANICS_ANCHOR_MISMATCH"),
      );
      assert.equal(assessment.publish.state, "draft");
      assert.equal(project.stage, "submitted");
      assert.equal(project.saveCalls, 0);
    },
  });
});

test("a stored correction that no longer matches the draft blocks publishing", async (t) => {
  const assessment = makeAssessment();
  assessment.sections[0].mechanics = [typedRow({ anchor: { start: 0, end: 12 } })];
  await withStubs(t, {
    assessment,
    run: async () => {
      await assert.rejects(publish(assessment), (error) => {
        assert.equal(error.statusCode, 400);
        assert.match(error.message, /no longer matches the draft/);
        return true;
      });
      assert.equal(assessment.publish.state, "draft");
    },
  });
});

test("W09/W15: legacy rows and a partial review never strand valid feedback", async (t) => {
  const assessment = makeAssessment();
  assessment.sections[0].mechanics = [{ original: "becaus", correction: "because" }];
  assessment.sections[0].mechanicsReview = {
    version: 1,
    status: "partial",
    reasons: ["limit_reached"],
  };
  await withStubs(t, {
    assessment,
    run: async () => {
      const result = await publish(assessment);
      assert.equal(result.alreadyPublished, false);
      assert.equal(assessment.publish.state, "published");
      assert.deepEqual(assessment.sections[0].mechanics, [
        { original: "becaus", correction: "because" },
      ]);
    },
  });
});

test("W10: a second publish is the guarded already-published path", async (t) => {
  const assessment = makeAssessment();
  await withStubs(t, {
    assessment,
    run: async () => {
      await publish(assessment);
      const again = await publish(assessment);
      assert.equal(again.alreadyPublished, true);
      assert.equal(assessment.saveCalls, 1);
    },
  });
});