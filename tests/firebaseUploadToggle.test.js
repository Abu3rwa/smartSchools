import { test } from "node:test";
import assert from "node:assert/strict";
import process from "node:process";
import { Buffer } from "node:buffer";
import { storage } from "../config/firebase.js";
import {
  uploadFile,
  uploadPrivateFile,
} from "../services/firebaseStorageService.js";
import { requireAssignmentUploadAvailability } from "../middleware/uploadAssignmentAttachments.js";

const originalEnabled = process.env.FIREBASE_UPLOAD_ENABLED;
const originalBucket = process.env.FIREBASE_STORAGE_BUCKET;

const restoreEnv = () => {
  if (originalEnabled === undefined) delete process.env.FIREBASE_UPLOAD_ENABLED;
  else process.env.FIREBASE_UPLOAD_ENABLED = originalEnabled;
  if (originalBucket === undefined) delete process.env.FIREBASE_STORAGE_BUCKET;
  else process.env.FIREBASE_STORAGE_BUCKET = originalBucket;
};

// Force the direct bucket path so the enabled test never probes Google.
const useFakeBucket = () => {
  process.env.FIREBASE_STORAGE_BUCKET = "test-bucket.appspot.com";
};

const mockBucket = (t) => {
  if (!storage) return { calls: () => 0 };
  let calls = 0;
  t.mock.method(storage, "bucket", () => {
    calls += 1;
    throw new Error("bucket-should-not-be-reached");
  });
  return { calls: () => calls };
};

test("disabled uploads reject before touching Firebase storage", async (t) => {
  t.after(restoreEnv);
  process.env.FIREBASE_UPLOAD_ENABLED = "false";
  useFakeBucket();
  const bucket = mockBucket(t);

  await assert.rejects(
    () => uploadFile(Buffer.from("x"), "image/png", "a.png"),
    (error) =>
      error.code === "FIREBASE_UPLOAD_DISABLED" && error.statusCode === 503,
  );
  assert.equal(bucket.calls(), 0);
});

test("disabled private uploads reject before touching Firebase storage", async (t) => {
  t.after(restoreEnv);
  process.env.FIREBASE_UPLOAD_ENABLED = "false";
  useFakeBucket();
  const bucket = mockBucket(t);

  await assert.rejects(
    () => uploadPrivateFile(Buffer.from("x"), "application/pdf", "a.pdf"),
    (error) =>
      error.code === "FIREBASE_UPLOAD_DISABLED" && error.statusCode === 503,
  );
  assert.equal(bucket.calls(), 0);
});

test("assignment upload guard rejects files but allows requests without files when disabled", (t) => {
  t.after(restoreEnv);
  process.env.FIREBASE_UPLOAD_ENABLED = "false";
  let result;
  requireAssignmentUploadAvailability({ files: [{}] }, {}, (error) => {
    result = error;
  });
  assert.equal(result?.code, "FIREBASE_UPLOAD_DISABLED");
  assert.equal(result?.statusCode, 503);
  result = "not called";
  requireAssignmentUploadAvailability({ files: [] }, {}, (error) => {
    result = error;
  });
  assert.equal(result, undefined);
});

test("assignment upload guard allows files when uploads are enabled", (t) => {
  t.after(restoreEnv);
  process.env.FIREBASE_UPLOAD_ENABLED = "true";
  let result = "not called";
  requireAssignmentUploadAvailability({ files: [{}] }, {}, (error) => {
    result = error;
  });
  assert.equal(result, undefined);
});

test("uploads stay enabled by default when the flag is unset", async (t) => {
  t.after(restoreEnv);
  delete process.env.FIREBASE_UPLOAD_ENABLED;
  useFakeBucket();
  mockBucket(t);

  await assert.rejects(
    () => uploadFile(Buffer.from("x"), "image/png", "a.png"),
    (error) => error.code !== "FIREBASE_UPLOAD_DISABLED",
  );
});

test("an explicit true keeps uploads enabled", async (t) => {
  t.after(restoreEnv);
  process.env.FIREBASE_UPLOAD_ENABLED = "true";
  useFakeBucket();
  mockBucket(t);

  await assert.rejects(
    () => uploadPrivateFile(Buffer.from("x"), "application/pdf", "a.pdf"),
    (error) => error.code !== "FIREBASE_UPLOAD_DISABLED",
  );
});
