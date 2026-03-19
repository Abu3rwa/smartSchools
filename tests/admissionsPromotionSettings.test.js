import test from "node:test";
import assert from "node:assert/strict";
import {
  createDefaultAdmissionsPromotionSettings,
  normalizeAdmissionsPromotionSettings,
  validateAdmissionsPromotionSettingsPayload,
} from "../utils/admissionsPromotionSettings.js";

test("createDefaultAdmissionsPromotionSettings returns expected baseline shape", () => {
  const settings = createDefaultAdmissionsPromotionSettings();

  assert.equal(settings.enabled, true);
  assert.equal(settings.promotionPolicy.minimumAcademicThreshold, 50);
  assert.equal(settings.promotionPolicy.attendanceMinimumPercent, 75);
  assert.equal(settings.approvalWorkflow.depth, 1);
  assert.equal(settings.sectionAssignmentStrategy, "manual");
  assert.ok(Array.isArray(settings.reasonCodes));
  assert.ok(settings.reasonCodes.length > 0);
});

test("normalizeAdmissionsPromotionSettings clamps numeric values and normalizes lists", () => {
  const normalized = normalizeAdmissionsPromotionSettings({
    promotionPolicy: {
      minimumAcademicThreshold: 200,
      attendanceMinimumPercent: -10,
      requiredClearanceChecks: {
        fees: true,
        library: "yes",
      },
    },
    approvalWorkflow: {
      depth: 10,
      roles: [" Principal ", "", "class_teacher"],
    },
    sectionAssignmentStrategy: "invalid_strategy",
    reasonCodes: [" attendance_concern ", "ATTENDANCE_CONCERN", ""],
  });

  assert.equal(normalized.promotionPolicy.minimumAcademicThreshold, 100);
  assert.equal(normalized.promotionPolicy.attendanceMinimumPercent, 0);
  assert.equal(normalized.promotionPolicy.requiredClearanceChecks.fees, true);
  assert.equal(normalized.promotionPolicy.requiredClearanceChecks.library, false);
  assert.equal(normalized.approvalWorkflow.depth, 5);
  assert.deepEqual(normalized.approvalWorkflow.roles, ["principal", "class_teacher"]);
  assert.equal(normalized.sectionAssignmentStrategy, "manual");
  assert.deepEqual(normalized.reasonCodes, ["ATTENDANCE_CONCERN"]);
});

test("normalizeAdmissionsPromotionSettings clears invalid lock windows", () => {
  const normalized = normalizeAdmissionsPromotionSettings({
    calendar: {
      newAdmissionsLockWindow: {
        startDate: "2026-08-10",
        endDate: "2026-08-01",
      },
      returningAdmissionsLockWindow: {
        startDate: "not-a-date",
        endDate: "still-not-a-date",
      },
    },
  });

  assert.equal(normalized.calendar.newAdmissionsLockWindow.startDate, null);
  assert.equal(normalized.calendar.newAdmissionsLockWindow.endDate, null);
  assert.equal(normalized.calendar.returningAdmissionsLockWindow.startDate, null);
  assert.equal(normalized.calendar.returningAdmissionsLockWindow.endDate, null);
});

test("validateAdmissionsPromotionSettingsPayload rejects invalid payloads", () => {
  const invalidRoot = validateAdmissionsPromotionSettingsPayload(null);
  assert.equal(invalidRoot.valid, false);

  const invalidWindow = validateAdmissionsPromotionSettingsPayload({
    calendar: {
      newAdmissionsLockWindow: {
        startDate: "2026-10-10",
        endDate: "2026-10-01",
      },
    },
  });
  assert.equal(invalidWindow.valid, false);
  assert.match(invalidWindow.message, /newAdmissionsLockWindow/);

  const invalidStrategy = validateAdmissionsPromotionSettingsPayload({
    sectionAssignmentStrategy: "bad",
  });
  assert.equal(invalidStrategy.valid, false);
  assert.match(invalidStrategy.message, /sectionAssignmentStrategy/);
});

test("validateAdmissionsPromotionSettingsPayload accepts valid payload", () => {
  const valid = validateAdmissionsPromotionSettingsPayload({
    enabled: true,
    sectionAssignmentStrategy: "capacity_based",
    calendar: {
      newAdmissionsLockWindow: {
        startDate: "2026-08-01",
        endDate: "2026-08-15",
      },
      returningAdmissionsLockWindow: {
        startDate: "2026-08-20",
        endDate: "2026-09-01",
      },
    },
  });

  assert.equal(valid.valid, true);
}
);
