import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import mongoose from "mongoose";

import WritingCommentBank, {
  COMMENT_SKILLS,
} from "../models/WritingCommentBank.js";
import {
  MAX_BANK_NOTE_CHARS,
  MAX_BANK_SUGGESTIONS,
  deleteComment,
  listComments,
  markCommentUsed,
  rankBankNotes,
  saveComment,
} from "../services/writingCommentBankService.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const oid = () => new mongoose.Types.ObjectId().toString();

const schoolId = oid();
const userId = oid();

const stub = (target, key, replacement) => {
  const original = target[key];
  target[key] = replacement;
  return () => {
    target[key] = original;
  };
};

const withStubs = async (stubs, run) => {
  const restores = stubs.map(([target, key, value]) => stub(target, key, value));
  try {
    await run();
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
};

const findStub = (rows) => {
  const calls = [];
  return {
    calls,
    fn: (query) => {
      calls.push(query);
      return {
        sort: () => ({ limit: () => ({ lean: async () => rows }) }),
      };
    },
  };
};

const leanUpdateStub = (value) => {
  const calls = [];
  return {
    calls,
    fn: (query, update, options) => {
      calls.push({ query, update, options });
      return { lean: async () => value };
    },
  };
};

test("suggestions put the section first, then its criteria, then reuse", () => {
  const section = {
    _id: "section",
    sectionKeys: ["Body"],
    criterionKeys: [],
    usageCount: 0,
  };
  const criterion = {
    _id: "criterion",
    sectionKeys: ["intro"],
    criterionKeys: ["supporting detail"],
    usageCount: 9,
  };
  const fresher = {
    _id: "fresher",
    sectionKeys: [],
    criterionKeys: [],
    usageCount: 7,
    lastUsedAt: "2026-11-01",
  };
  const older = {
    _id: "older",
    sectionKeys: [],
    criterionKeys: [],
    usageCount: 7,
    lastUsedAt: "2026-10-01",
  };
  const unused = {
    _id: "unused",
    sectionKeys: [],
    criterionKeys: [],
    usageCount: 0,
  };

  const ranked = rankBankNotes([unused, criterion, section, older, fresher], {
    sectionKey: "body",
    criteria: ["Supporting detail"],
  });

  assert.deepEqual(
    ranked.map((note) => note._id),
    ["section", "criterion", "fresher", "older", "unused"],
  );
});

test("a saved note carries its skill, section and criteria, capped", async () => {
  let created = null;
  await withStubs(
    [
      [
        WritingCommentBank,
        "create",
        async (doc) => {
          created = doc;
          return { toObject: () => ({ ...doc, _id: oid() }) };
        },
      ],
    ],
    async () => {
      const result = await saveComment({
        schoolId,
        userId,
        payload: {
          text: "  Adds one clear   reason.  ",
          skill: "evidence",
          sectionKey: "Body",
          criteria: ["a", "b", "c", "d", "e", "f", "g"],
          sharedWithSchool: true,
        },
      });
      assert.equal(result.created, true);
      assert.equal(result.note.skill, "evidence");
      assert.equal(result.note.usageCount, 0);
      assert.equal(result.note.mine, true);
      assert.match(result.note.text, /^Adds one clear reason\.$/);
    },
  );
  assert.equal(created.text, "Adds one clear reason.");
  assert.deepEqual(created.sectionKeys, ["body"]);
  assert.equal(created.criterionKeys.length, 6);
  assert.equal(created.sharedWithSchool, true);
});

test("an unknown skill is stored as other and long text is capped", async () => {
  let created = null;
  await withStubs(
    [
      [
        WritingCommentBank,
        "create",
        async (doc) => {
          created = doc;
          return { toObject: () => ({ ...doc, _id: oid() }) };
        },
      ],
    ],
    async () => {
      await saveComment({
        schoolId,
        userId,
        payload: { text: "x".repeat(400), skill: "louder" },
      });
    },
  );
  assert.equal(created.skill, "other");
  assert.equal(created.text.length, MAX_BANK_NOTE_CHARS);
});

test("an empty or unsafe note is refused and nothing is stored", async () => {
  await withStubs(
    [
      [
        WritingCommentBank,
        "create",
        async () => {
          assert.fail("an invalid note must not reach the database");
        },
      ],
    ],
    async () => {
      await assert.rejects(
        saveComment({ schoolId, userId, payload: { text: "   " } }),
        (error) => {
          assert.equal(error.statusCode, 400);
          assert.match(error.message, /Write the note/);
          return true;
        },
      );
      await assert.rejects(
        saveComment({
          schoolId,
          userId,
          payload: { text: "Your parents will be proud." },
        }),
        (error) => {
          assert.equal(error.statusCode, 400);
          assert.match(error.message, /cannot be sent to a child/);
          assert.match(error.message, /your parents/);
          return true;
        },
      );
    },
  );
});

test("saving the same sentence twice refreshes its tags instead of duplicating", async () => {
  const updated = leanUpdateStub({
    _id: oid(),
    school: schoolId,
    teacher: userId,
    text: "Adds one clear reason.",
    skill: "clarity",
    sectionKeys: ["body"],
    criterionKeys: [],
    usageCount: 3,
    sharedWithSchool: false,
  });
  await withStubs(
    [
      [
        WritingCommentBank,
        "create",
        async () => {
          throw Object.assign(new Error("duplicate"), { code: 11000 });
        },
      ],
      [WritingCommentBank, "findOneAndUpdate", updated.fn],
    ],
    async () => {
      const result = await saveComment({
        schoolId,
        userId,
        payload: { text: "Adds one clear reason.", skill: "clarity", sectionKey: "body" },
      });
      assert.equal(result.created, false);
      assert.equal(result.note.usageCount, 3);
      assert.equal(updated.calls.length, 1);
      assert.deepEqual(updated.calls[0].query, {
        school: schoolId,
        teacher: userId,
        text: "Adds one clear reason.",
      });
      assert.equal(updated.calls[0].update.$set.skill, "clarity");
    },
  );
});

test("the list reads only the teacher's notes and the shared ones", async () => {
  const find = findStub([
    {
      _id: oid(),
      teacher: userId,
      text: "Own note.",
      skill: "focus",
      sectionKeys: ["body"],
      criterionKeys: [],
      usageCount: 1,
      sharedWithSchool: false,
    },
    {
      _id: oid(),
      teacher: oid(),
      text: "A colleague's shared note.",
      skill: "grammar",
      sectionKeys: [],
      criterionKeys: [],
      usageCount: 0,
      sharedWithSchool: true,
    },
  ]);
  await withStubs([[WritingCommentBank, "find", find.fn]], async () => {
    const result = await listComments({
      schoolId,
      userId,
      sectionKey: "body",
      criteria: ["Supporting detail"],
    });
    assert.equal(result.notes.length, 2);
    assert.equal(result.notes[0].text, "Own note.");
    assert.equal(result.notes[0].mine, true);
    assert.equal(result.notes[1].mine, false);
    assert.equal(result.notes[0].teacher, undefined);
    assert.deepEqual(result.skills, COMMENT_SKILLS);
    assert.equal(result.notes.length <= MAX_BANK_SUGGESTIONS, true);
  });
  assert.deepEqual(find.calls[0].$or, [
    { teacher: userId },
    { sharedWithSchool: true },
  ]);
  assert.equal(find.calls[0].school, schoolId);
  assert.equal(find.calls[0].skill, undefined);
});

test("a skill filter is honoured only for a known skill", async () => {
  const find = findStub([]);
  await withStubs([[WritingCommentBank, "find", find.fn]], async () => {
    await listComments({ schoolId, userId, skill: "grammar" });
    await listComments({ schoolId, userId, skill: "louder" });
  });
  assert.equal(find.calls[0].skill, "grammar");
  assert.equal(find.calls[1].skill, undefined);
});

test("a note someone else kept private can never be deleted or counted", async () => {
  await withStubs(
    [[WritingCommentBank, "findOneAndDelete", () => ({ lean: async () => null })]],
    async () => {
      await assert.rejects(
        deleteComment({ schoolId, userId, commentId: oid() }),
        (error) => {
          assert.equal(error.statusCode, 404);
          assert.match(error.message, /not in your comment bank/);
          return true;
        },
      );
    },
  );

  const update = leanUpdateStub(null);
  await withStubs([[WritingCommentBank, "findOneAndUpdate", update.fn]], async () => {
    await assert.rejects(
      markCommentUsed({ schoolId, userId, commentId: oid() }),
      (error) => {
        assert.equal(error.statusCode, 404);
        return true;
      },
    );
  });
  const query = update.calls[0].query;
  assert.deepEqual(query.$or, [
    { teacher: userId },
    { sharedWithSchool: true },
  ]);
  assert.equal(query.school, schoolId);
});

test("deleting and counting are scoped to the caller's own note", async () => {
  const removed = {
    calls: [],
    fn: (query) => {
      removed.calls.push(query);
      return { lean: async () => ({ _id: query._id }) };
    },
  };
  await withStubs(
    [[WritingCommentBank, "findOneAndDelete", removed.fn]],
    async () => {
      const result = await deleteComment({
        schoolId,
        userId,
        commentId: oid(),
      });
      assert.equal(result.deleted, true);
    },
  );
  assert.equal(removed.calls[0].teacher, userId);
  assert.equal(removed.calls[0].school, schoolId);
});

test("the model keeps one text per teacher and the fixed skill list", () => {
  const unique = WritingCommentBank.schema
    .indexes()
    .find(
      ([keys]) => keys.school === 1 && keys.teacher === 1 && keys.text === 1,
    );
  assert.ok(unique, "the per-teacher text index exists");
  assert.equal(unique[1].unique, true);
  assert.deepEqual(
    WritingCommentBank.schema.path("skill").enumValues,
    COMMENT_SKILLS,
  );
  assert.equal(
    WritingCommentBank.schema.path("text").options.maxlength,
    MAX_BANK_NOTE_CHARS,
  );
});

test("every comment-bank route is staff-only and flag-gated", async () => {
  const source = await readFile(
    join(HERE, "..", "routes", "writingRoutes.js"),
    "utf8",
  );
  const routes = source.match(/router\.(get|post|delete)\(\s*"\/comment-bank[^;]+;/g) || [];
  assert.equal(routes.length, 4);
  for (const route of routes) {
    assert.match(route, /\bstaff\b/);
    assert.match(route, /\brequireTeacherTools\b/);
  }
});
