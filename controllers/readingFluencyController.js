import { asyncHandler } from "../middleware/errorHandler.js";
import Student from "../models/Student.js";
import * as fluencyService from "../services/readingFluency/readingFluencyService.js";
import * as modelAudioService from "../services/readingFluency/modelAudioService.js";
import * as fluencyReports from "../services/readingFluency/reports.js";
import { resolveAcademicYearForRequest } from "../helpers/academicYearScope.js";
import { getSchoolTimeZone } from "../helpers/attendanceEligibility.js";
import { assertObjectId } from "../utils/assertObjectId.js";

const currentStudent = async (req) => {
  const academicYear = resolveAcademicYearForRequest(req);
  const query = { user: req.user._id, school: req.schoolId };
  if (academicYear) query.academicYear = academicYear;
  const student = await Student.findOne(query)
    .select("_id academicYear")
    .lean();
  if (!student) {
    throw Object.assign(
      new Error(
        `Student not found for academic year ${academicYear || "this year"}`,
      ),
      { statusCode: 404 },
    );
  }
  return student;
};

export const getFluencyAssignment = asyncHandler(async (req, res) => {
  const student = await currentStudent(req);
  assertObjectId(req.params.assignmentId, "assignment");
  const data = await fluencyService.getStudentAssignmentView({
    schoolId: req.schoolId,
    studentId: student._id,
    assignmentId: req.params.assignmentId,
    academicYear: resolveAcademicYearForRequest(req),
    timeZone: await getSchoolTimeZone(req.schoolId),
  });
  res.status(200).json({ success: true, data });
});

export const recordFluencyListen = asyncHandler(async (req, res) => {
  const student = await currentStudent(req);
  assertObjectId(req.body?.assignmentId, "assignment");
  const data = await fluencyService.recordListen({
    schoolId: req.schoolId,
    studentId: student._id,
    assignmentId: req.body?.assignmentId,
    blockKey: req.body?.blockKey,
    academicYear: resolveAcademicYearForRequest(req),
  });
  res.status(200).json({ success: true, data });
});

export const recordFluencyConsent = asyncHandler(async (req, res) => {
  const student = await currentStudent(req);
  const data = await fluencyService.recordConsent({
    schoolId: req.schoolId,
    studentId: student._id,
  });
  res.status(200).json({ success: true, data });
});

export const scoreFluencyAttempt = asyncHandler(async (req, res) => {
  const student = await currentStudent(req);
  assertObjectId(req.body?.assignmentId, "assignment");
  const data = await fluencyService.scoreAttempt({
    schoolId: req.schoolId,
    studentId: student._id,
    assignmentId: req.body?.assignmentId,
    blockKey: req.body?.blockKey,
    level:
      req.body?.level === undefined || req.body?.level === ""
        ? null
        : req.body.level,
    recordedSec: req.body?.recordedSec,
    idempotencyKey: req.body?.idempotencyKey,
    buffer: req.file?.buffer,
    mimeType: req.file?.mimetype || "audio/webm",
    academicYear: resolveAcademicYearForRequest(req),
    timeZone: await getSchoolTimeZone(req.schoolId),
  });
  res.status(201).json({ success: true, data });
});

export const getFluencyAttempts = asyncHandler(async (req, res) => {
  const student = await currentStudent(req);
  assertObjectId(req.params.assignmentId, "assignment");
  const data = await fluencyService.getStudentPartAttempts({
    schoolId: req.schoolId,
    studentId: student._id,
    assignmentId: req.params.assignmentId,
    blockKey: req.params.blockKey,
    academicYear: resolveAcademicYearForRequest(req),
  });
  res.status(200).json({ success: true, data });
});

export const updateFluencySettings = asyncHandler(async (req, res) => {
  assertObjectId(req.params.assignmentId, "assignment");
  const data = await fluencyService.updateFluencySettings({
    schoolId: req.schoolId,
    assignmentId: req.params.assignmentId,
    userId: req.user._id,
    isAdmin: req.user.role === "admin",
    patch: req.body || {},
  });
  res.status(200).json({
    success: true,
    message: "Reading aloud settings saved",
    data,
  });
});

export const getFluencyClassReport = asyncHandler(async (req, res) => {
  assertObjectId(req.params.assignmentId, "assignment");
  const data = await fluencyReports.getFluencyClassReport({
    schoolId: req.schoolId,
    assignmentId: req.params.assignmentId,
  });
  res.status(200).json({ success: true, data });
});

export const getFluencyStudentReport = asyncHandler(async (req, res) => {
  assertObjectId(req.params.assignmentId, "assignment");
  assertObjectId(req.params.studentId, "student");
  const data = await fluencyReports.getFluencyStudentReport({
    schoolId: req.schoolId,
    assignmentId: req.params.assignmentId,
    studentId: req.params.studentId,
  });
  res.status(200).json({ success: true, data });
});

export const getFluencyHardWords = asyncHandler(async (req, res) => {
  assertObjectId(req.params.assignmentId, "assignment");
  const data = await fluencyReports.getFluencyHardWords({
    schoolId: req.schoolId,
    assignmentId: req.params.assignmentId,
  });
  res.status(200).json({ success: true, data });
});

export const exportFluencyCsv = asyncHandler(async (req, res) => {
  assertObjectId(req.params.assignmentId, "assignment");
  const data = await fluencyReports.exportFluencyCsv({
    schoolId: req.schoolId,
    assignmentId: req.params.assignmentId,
  });
  res
    .status(200)
    .set({
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": fluencyReports.csvContentDisposition(
        data.filename,
        data.filenameUtf8,
      ),
      "Cache-Control": "no-store",
    })
    .send(data.csv);
});

export const getModelAudioCoverage = asyncHandler(async (req, res) => {
  assertObjectId(req.params.textId, "text");
  const data = await modelAudioService.getModelAudioCoverage({
    schoolId: req.schoolId,
    textId: req.params.textId,
    userId: req.user._id,
    isAdmin: req.user.role === "admin",
  });
  res.status(200).json({ success: true, data });
});

export const generateModelAudio = asyncHandler(async (req, res) => {
  assertObjectId(req.params.textId, "text");
  const data = await modelAudioService.generateModelAudio({
    schoolId: req.schoolId,
    textId: req.params.textId,
    userId: req.user._id,
    isAdmin: req.user.role === "admin",
    blocks: req.body?.blocks || null,
    regenerate: req.body?.regenerate === true,
    limit: req.body?.limit,
  });
  res.status(201).json({
    success: true,
    message: data.generated
      ? `Generated the model voice for ${data.generated} part${data.generated === 1 ? "" : "s"}.`
      : "The model voice is already up to date.",
    data,
  });
});

// lean() returns a BSON Binary, and Buffer.from(Binary) is an empty buffer.
const audioBytes = (value) => {
  if (Buffer.isBuffer(value)) return value;
  const raw = value?.buffer;
  if (raw && typeof raw.subarray === "function") {
    return Buffer.from(
      raw.subarray(
        0,
        Number.isInteger(value.position) ? value.position : raw.length,
      ),
    );
  }
  return Buffer.from(value);
};

const sendAudio = (req, res, doc) => {
  const data = audioBytes(doc.data);
  const total = data.length;
  if (!total) {
    res.status(404).json({
      success: false,
      code: "MODEL_AUDIO_NOT_FOUND",
      message: "The model voice is not ready for this part yet.",
    });
    return;
  }
  const headers = {
    "Content-Type": doc.contentType || "audio/mpeg",
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
    "X-Content-Type-Options": "nosniff",
    // The size is in the tag so a browser that cached an empty response refetches.
    ETag: `"${doc._id}-${total}"`,
  };

  const range = String(req.headers.range || "").trim();
  if (!range) {
    res
      .status(200)
      .set({ ...headers, "Content-Length": String(total) })
      .send(data);
    return;
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match || (!match[1] && !match[2])) {
    res
      .status(416)
      .set({ "Content-Range": `bytes */${total}` })
      .end();
    return;
  }

  let start;
  let end;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isFinite(suffix) || suffix <= 0) {
      res
        .status(416)
        .set({ "Content-Range": `bytes */${total}` })
        .end();
      return;
    }
    start = Math.max(0, total - suffix);
    end = total - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : total - 1;
  }

  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    start >= total ||
    end < start
  ) {
    res
      .status(416)
      .set({ "Content-Range": `bytes */${total}` })
      .end();
    return;
  }
  end = Math.min(end, total - 1);

  res
    .status(206)
    .set({
      ...headers,
      "Content-Range": `bytes ${start}-${end}/${total}`,
      "Content-Length": String(end - start + 1),
    })
    .send(data.subarray(start, end + 1));
};

export const streamModelAudio = asyncHandler(async (req, res) => {
  const isStudent = req.user.role === "student";
  const student = isStudent ? await currentStudent(req) : null;
  assertObjectId(req.params.textId, "text");
  const doc = await modelAudioService.getModelAudio({
    schoolId: req.schoolId,
    textId: req.params.textId,
    blockKey: req.params.blockKey,
    level: req.query.level,
    hash: req.query.hash,
    studentId: student?._id || null,
    userId: req.user._id,
    isAdmin: req.user.role === "admin",
    academicYear: resolveAcademicYearForRequest(req),
  });
  sendAudio(req, res, doc);
});
