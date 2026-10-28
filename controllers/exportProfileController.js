import { asyncHandler } from '../middleware/errorHandler.js';
import ExportProfile from '../models/ExportProfile.js';
import Class from '../models/Class.js';
import Subject from '../models/Subject.js';
import {
    applyOverrides,
    buildExportFile,
    buildPreview,
    buildProfilePayload,
    loadProfileById,
    validateProfilePayload
} from '../services/gradebookExportService.js';
import { getTeacherAssignments, isTeacherAuthorizedForClassSubject, resolveTeacherProfile } from '../helpers/teacherScoping.js';

const forbidden = (res, message = 'You are not authorized to export this gradebook.') =>
    res.status(403).json({ success: false, message });

const teacherCanUse = async (req, classId, subjectId) => {
    if (req.user.role !== 'teacher') return true;
    const teacher = await resolveTeacherProfile(req);
    if (!teacher) return false;
    return isTeacherAuthorizedForClassSubject(teacher._id, classId, subjectId);
};

const ensureClassAndSubject = async (schoolId, classId, subjectId) => {
    const [classDoc, subjectDoc] = await Promise.all([
        Class.findOne({ _id: classId, school: schoolId }).select('_id academicYear').lean(),
        Subject.findOne({ _id: subjectId, school: schoolId }).select('_id').lean()
    ]);
    if (!classDoc) return 'Class not found.';
    if (!subjectDoc) return 'Subject not found.';
    return null;
};

/** GET /api/export-profiles?classId=&subjectId= */
export const listProfiles = asyncHandler(async (req, res) => {
    const schoolId = req.schoolId;
    const { classId, subjectId } = req.query;
    const query = { school: schoolId };
    if (classId) query.class = classId;
    if (subjectId) query.subject = subjectId;

    if (req.user.role === 'teacher') {
        const teacher = await resolveTeacherProfile(req);
        if (!teacher) return forbidden(res);
        const assignments = (await getTeacherAssignments(teacher._id))
            .filter((pair) => (!classId || String(pair.classId) === String(classId))
                && (!subjectId || String(pair.subjectId) === String(subjectId)));
        if (!assignments.length) {
            return res.json({ success: true, data: [] });
        }
        query.$or = assignments.map((pair) => ({ class: pair.classId, subject: pair.subjectId }));
    }

    const profiles = await ExportProfile.find(query).sort({ updatedAt: -1 }).lean();
    res.json({ success: true, data: profiles });
});

/** POST /api/export-profiles */
export const createProfile = asyncHandler(async (req, res) => {
    const schoolId = req.schoolId;
    const payload = buildProfilePayload(req.body);
    const invalid = validateProfilePayload(payload);
    if (invalid) {
        return res.status(400).json({ success: false, message: invalid });
    }

    const lookupError = await ensureClassAndSubject(schoolId, payload.class, payload.subject);
    if (lookupError) return res.status(404).json({ success: false, message: lookupError });

    if (!(await teacherCanUse(req, payload.class, payload.subject))) return forbidden(res);

    const profile = await ExportProfile.create({
        ...payload,
        school: schoolId,
        createdBy: req.user._id
    });

    res.status(201).json({ success: true, data: profile });
});

/** PUT /api/export-profiles/:id */
export const updateProfile = asyncHandler(async (req, res) => {
    const schoolId = req.schoolId;
    const existing = await ExportProfile.findOne({ _id: req.params.id, school: schoolId }).lean();
    if (!existing) return res.status(404).json({ success: false, message: 'Export profile not found.' });

    const merged = buildProfilePayload({
        ...existing,
        ...req.body,
        classId: req.body.classId || existing.class,
        subjectId: req.body.subjectId || existing.subject,
        columns: req.body.columns !== undefined ? req.body.columns : existing.columns
    });

    const invalid = validateProfilePayload(merged);
    if (invalid) return res.status(400).json({ success: false, message: invalid });

    const lookupError = await ensureClassAndSubject(schoolId, merged.class, merged.subject);
    if (lookupError) return res.status(404).json({ success: false, message: lookupError });

    if (!(await teacherCanUse(req, merged.class, merged.subject))) return forbidden(res);

    const updated = await ExportProfile.findByIdAndUpdate(
        existing._id,
        { $set: merged },
        { new: true, runValidators: true }
    );

    res.json({ success: true, data: updated });
});

/** DELETE /api/export-profiles/:id */
export const deleteProfile = asyncHandler(async (req, res) => {
    const schoolId = req.schoolId;
    const existing = await ExportProfile.findOne({ _id: req.params.id, school: schoolId }).lean();
    if (!existing) return res.status(404).json({ success: false, message: 'Export profile not found.' });

    if (!(await teacherCanUse(req, existing.class, existing.subject))) return forbidden(res);

    await ExportProfile.deleteOne({ _id: existing._id, school: schoolId });
    res.json({ success: true });
});

/**
 * A preview or download may run against a saved profile or against the values
 * currently in the dialog, so nothing has to be saved just to look at the rows.
 */
const resolveRequestProfile = async (schoolId, body = {}) => {
    if (body.profile && typeof body.profile === 'object') {
        const payload = buildProfilePayload(body.profile);
        if (!payload.class || !payload.subject) {
            return { error: 'Class and subject are required.' };
        }
        if (!payload.academicYear) {
            return { error: 'Academic year is required.' };
        }
        return { profile: applyOverrides(payload, body.overrides) };
    }

    if (!body.profileId) return { error: 'Profile is required.' };

    const saved = await loadProfileById(schoolId, body.profileId);
    return { profile: applyOverrides(saved, body.overrides) };
};

/** POST /api/gradebook-export/preview */
export const previewExport = asyncHandler(async (req, res) => {
    const schoolId = req.schoolId;
    const { dateFrom, dateTo } = req.body || {};

    const resolved = await resolveRequestProfile(schoolId, req.body);
    if (resolved.error) return res.status(400).json({ success: false, message: resolved.error });

    if (!(await teacherCanUse(req, resolved.profile.class, resolved.profile.subject))) return forbidden(res);

    const preview = await buildPreview({ schoolId, profile: resolved.profile, dateFrom, dateTo });
    res.json({ success: true, data: preview });
});

/** POST /api/gradebook-export/xlsx */
export const downloadExport = asyncHandler(async (req, res) => {
    const schoolId = req.schoolId;
    const { dateFrom, dateTo } = req.body || {};

    const resolved = await resolveRequestProfile(schoolId, req.body);
    if (resolved.error) return res.status(400).json({ success: false, message: resolved.error });

    if (!(await teacherCanUse(req, resolved.profile.class, resolved.profile.subject))) return forbidden(res);

    const { buffer, fileName } = await buildExportFile({ schoolId, profile: resolved.profile, dateFrom, dateTo });

    const asciiName = fileName.replace(/[^\x20-\x7E]/g, '_');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader(
        'Content-Disposition',
        `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
    );
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    res.send(Buffer.from(buffer));
});
