import test from "node:test";
import assert from "node:assert/strict";
import {
  createShareInvitation,
  getLessonSnapshot,
  LiveLessonShareError,
  listOutgoingShareInvitations,
  listShareableTeachers,
} from "../services/liveLessonShareService.js";
import LiveLesson from "../models/LiveLesson.js";
import LiveLessonShareInvitation from "../models/LiveLessonShareInvitation.js";
import Teacher from "../models/Teacher.js";
import User from "../models/User.js";

const restoreMethod = (target, name, replacement) => {
  const original = target[name];
  target[name] = replacement;
  return () => { target[name] = original; };
};

test("share snapshot contains only lesson metadata and slide content", () => {
  const snapshot = getLessonSnapshot({
    title: "Fractions",
    description: "Equivalent values",
    subject: "Math",
    grade: "Grade 4",
    language: "en",
    source: "csv",
    ownerId: "source-owner",
    school: "school",
    sessionId: "session",
    slides: [{
      order: 0,
      type: "question",
      title: "Quick check",
      body: "",
      html: "",
      examples: [],
      imageUrl: "",
      speakerNotes: "Discuss after answering",
      question: {
        kind: "mcq",
        prompt: "Which is equivalent?",
        options: [{ id: "a", text: "1/2" }, { id: "b", text: "2/4" }],
        correctOptionId: "b",
        explanation: "Both represent one half",
      },
      studentResponses: [{ studentId: "student" }],
    }],
  });

  assert.equal(snapshot.title, "Fractions");
  assert.equal(snapshot.slides[0].question.correctOptionId, "b");
  assert.equal("ownerId" in snapshot, false);
  assert.equal("school" in snapshot, false);
  assert.equal("sessionId" in snapshot, false);
  assert.equal("studentResponses" in snapshot.slides[0], false);
});

test("shared lesson and invitation schemas enforce independent-copy provenance and pending deduplication", () => {
  assert.ok(LiveLesson.schema.path("originLessonId"));
  assert.ok(LiveLesson.schema.path("originOwnerId"));
  assert.ok(LiveLesson.schema.path("originShareInvitationId"));
  const provenanceIndex = LiveLesson.schema.indexes().find(([keys]) => keys.originShareInvitationId === 1);
  assert.equal(provenanceIndex[1].unique, true);
  assert.equal(provenanceIndex[1].partialFilterExpression.originShareInvitationId.$type, "objectId");

  const pendingIndex = LiveLessonShareInvitation.schema.indexes().find(
    ([keys, options]) => keys.school === 1 && keys.sourceLessonId === 1 && keys.recipientId === 1 &&
      options.partialFilterExpression?.status === "pending",
  );
  assert.ok(pendingIndex);
  assert.equal(pendingIndex[1].unique, true);
});

test("share creation scopes ownership to the sender and persists a content-only snapshot", async () => {
  const restore = [
    restoreMethod(User, "findOne", () => ({ select: () => ({ lean: async () => ({ _id: "active-user", role: "teacher" }) }) })),
    restoreMethod(Teacher, "findOne", () => ({ select: () => ({ lean: async () => ({ _id: "active-teacher" }) }) })),
    restoreMethod(LiveLesson, "findOne", async (filter) => {
      assert.deepEqual(filter, {
        _id: "64b64c2f9f1a4a6f8b9c0d11",
        school: "64b64c2f9f1a4a6f8b9c0d22",
        ownerId: "64b64c2f9f1a4a6f8b9c0d33",
      });
      return {
        _id: filter._id,
        title: "Fractions",
        slides: [{ order: 0, type: "opening" }],
      };
    }),
    restoreMethod(LiveLessonShareInvitation, "create", async (invitation) => ({
      _id: "64b64c2f9f1a4a6f8b9c0d44",
      ...invitation,
      createdAt: new Date(0),
    })),
  ];
  try {
    const invitation = await createShareInvitation({
      schoolId: "64b64c2f9f1a4a6f8b9c0d22",
      senderId: "64b64c2f9f1a4a6f8b9c0d33",
      sourceLessonId: "64b64c2f9f1a4a6f8b9c0d11",
      recipientId: "64b64c2f9f1a4a6f8b9c0d55",
    });
    assert.equal(invitation.lesson.title, "Fractions");
    assert.equal(invitation.status, "pending");
    assert.equal(invitation.lesson.slides, undefined);
  } finally {
    restore.reverse().forEach((undo) => undo());
  }
});

test("active school admins can share their owned lesson with a teacher", async () => {
  const schoolId = "64b64c2f9f1a4a6f8b9c0d22";
  const adminId = "64b64c2f9f1a4a6f8b9c0d33";
  const teacherId = "64b64c2f9f1a4a6f8b9c0d55";
  const restore = [
    restoreMethod(User, "findOne", (filter) => ({
      select: () => ({
        lean: async () => ({
          _id: filter._id,
          role: filter._id === adminId ? "admin" : "teacher",
        }),
      }),
    })),
    restoreMethod(Teacher, "findOne", (filter) => ({
      select: () => ({
        lean: async () => filter.user === teacherId ? { _id: "active-teacher" } : null,
      }),
    })),
    restoreMethod(LiveLesson, "findOne", async (filter) => ({
      _id: filter._id,
      ownerId: filter.ownerId,
      title: "Civics",
      slides: [{ order: 0, type: "opening" }],
    })),
    restoreMethod(LiveLessonShareInvitation, "create", async (invitation) => ({
      _id: "invitation-id",
      ...invitation,
      createdAt: new Date(0),
    })),
  ];
  try {
    const invitation = await createShareInvitation({
      schoolId,
      senderId: adminId,
      sourceLessonId: "64b64c2f9f1a4a6f8b9c0d11",
      recipientId: teacherId,
    });
    assert.equal(invitation.status, "pending");
    assert.equal(invitation.lesson.title, "Civics");
  } finally {
    restore.reverse().forEach((undo) => undo());
  }
});

test("share creation rejects a lesson not owned by the sender", async () => {
  const restore = [
    restoreMethod(User, "findOne", () => ({ select: () => ({ lean: async () => ({ _id: "active-user", role: "teacher" }) }) })),
    restoreMethod(Teacher, "findOne", () => ({ select: () => ({ lean: async () => ({ _id: "active-teacher" }) }) })),
    restoreMethod(LiveLesson, "findOne", async () => null),
    restoreMethod(LiveLessonShareInvitation, "create", async () => {
      assert.fail("No invitation should be created for an unowned lesson.");
    }),
  ];
  try {
    await assert.rejects(
      createShareInvitation({
        schoolId: "64b64c2f9f1a4a6f8b9c0d22",
        senderId: "64b64c2f9f1a4a6f8b9c0d33",
        sourceLessonId: "64b64c2f9f1a4a6f8b9c0d11",
        recipientId: "64b64c2f9f1a4a6f8b9c0d55",
      }),
      (error) => error instanceof LiveLessonShareError && error.statusCode === 404,
    );
  } finally {
    restore.reverse().forEach((undo) => undo());
  }
});

test("outgoing invitations default to pending and populate the recipient identity", async () => {
  let queryFilter;
  let populatedField;
  const restore = [
    restoreMethod(User, "findOne", () => ({ select: () => ({ lean: async () => ({ _id: "active-user", role: "teacher" }) }) })),
    restoreMethod(Teacher, "findOne", () => ({ select: () => ({ lean: async () => ({ _id: "active-teacher" }) }) })),
    restoreMethod(LiveLessonShareInvitation, "find", (filter) => {
      queryFilter = filter;
      return {
        sort() { return this; },
        populate(field, selection) {
          populatedField = [field, selection];
          return this;
        },
        lean: async () => [{
          _id: "invitation-id",
          sourceLessonId: "lesson-id",
          recipientId: { _id: "recipient-id", firstName: "Taylor", lastName: "Ng" },
          status: "pending",
          lessonSnapshot: { title: "Fractions" },
          createdAt: new Date(0),
        }],
      };
    }),
  ];
  try {
    const invitations = await listOutgoingShareInvitations({
      schoolId: "school-id",
      senderId: "sender-id",
    });
    assert.deepEqual(queryFilter, { school: "school-id", senderId: "sender-id", status: "pending" });
    assert.deepEqual(populatedField, ["recipientId", "firstName lastName"]);
    assert.deepEqual(invitations[0].recipient, {
      _id: "recipient-id",
      firstName: "Taylor",
      lastName: "Ng",
    });
    assert.equal(invitations[0].lesson.title, "Fractions");
  } finally {
    restore.reverse().forEach((undo) => undo());
  }
});

test("outgoing invitations optionally list all statuses and reject other status filters", async () => {
  let queryFilter;
  const restore = [
    restoreMethod(User, "findOne", () => ({ select: () => ({ lean: async () => ({ _id: "active-user", role: "teacher" }) }) })),
    restoreMethod(Teacher, "findOne", () => ({ select: () => ({ lean: async () => ({ _id: "active-teacher" }) }) })),
    restoreMethod(LiveLessonShareInvitation, "find", (filter) => {
      queryFilter = filter;
      return { sort() { return this; }, populate() { return this; }, lean: async () => [] };
    }),
  ];
  try {
    assert.deepEqual(await listOutgoingShareInvitations({
      schoolId: "school-id",
      senderId: "sender-id",
      status: "all",
    }), []);
    assert.deepEqual(queryFilter, { school: "school-id", senderId: "sender-id" });
    await assert.rejects(
      listOutgoingShareInvitations({ schoolId: "school-id", senderId: "sender-id", status: "accepted" }),
      (error) => error instanceof LiveLessonShareError && error.statusCode === 400,
    );
  } finally {
    restore.reverse().forEach((undo) => undo());
  }
});

test("shareable teacher directory is active, same-school, and excludes the requester", async () => {
  let teacherFilter;
  let populatedField;
  const restore = [
    restoreMethod(User, "findOne", () => ({ select: () => ({ lean: async () => ({ _id: "active-user", role: "teacher" }) }) })),
    restoreMethod(Teacher, "findOne", () => ({ select: () => ({ lean: async () => ({ _id: "active-teacher" }) }) })),
    restoreMethod(Teacher, "find", (filter) => {
      teacherFilter = filter;
      return {
        select() { return this; },
        populate(field, selection) {
          populatedField = [field, selection];
          return this;
        },
        sort() { return this; },
        lean: async () => [{
          user: { _id: "recipient-id", firstName: "Taylor", lastName: "Ng" },
        }],
      };
    }),
  ];
  try {
    assert.deepEqual(await listShareableTeachers({ schoolId: "school-id", requesterId: "sender-id" }), [{
      _id: "recipient-id",
      firstName: "Taylor",
      lastName: "Ng",
    }]);
    assert.deepEqual(teacherFilter, {
      school: "school-id",
      isActive: true,
      user: { $ne: "sender-id" },
    });
    assert.deepEqual(populatedField, ["user", "firstName lastName"]);
  } finally {
    restore.reverse().forEach((undo) => undo());
  }
});
