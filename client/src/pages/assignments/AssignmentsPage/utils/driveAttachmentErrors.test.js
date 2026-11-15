import test from "node:test";
import assert from "node:assert/strict";
import { driveUploadErrorMessage } from "./driveAttachmentErrors.js";

const t = (key, options) =>
  options?.reason ? `${key}#${options.reason}` : key;

test("a refused share names the share step and Google's reason", () => {
  const message = driveUploadErrorMessage(t, {
    response: {
      data: {
        code: "DRIVE_FILE_API_FAILED",
        step: "share",
        reason: "cannotShare",
      },
    },
  });

  assert.equal(
    message,
    "assignments:driveAttachments.testShareBlocked#cannotShare",
  );
});

test("a refused upload names the upload step", () => {
  const message = driveUploadErrorMessage(t, {
    response: {
      data: {
        code: "DRIVE_FILE_API_FAILED",
        step: "upload",
        reason: "accessNotConfigured",
      },
    },
  });

  assert.equal(
    message,
    "assignments:driveAttachments.testUploadBlocked#accessNotConfigured",
  );
});

test("server messages and the generic copy are still used when Google gave no reason", () => {
  assert.equal(
    driveUploadErrorMessage(t, {
      response: { data: { message: "Connect Google Drive first." } },
    }),
    "Connect Google Drive first.",
  );

  assert.equal(
    driveUploadErrorMessage(t, { response: { data: { code: "DRIVE_FILE_API_FAILED" } } }),
    "assignments:driveAttachments.uploadFailed",
  );

  assert.equal(
    driveUploadErrorMessage(t, new Error("boom")),
    "assignments:driveAttachments.uploadFailed",
  );
});
