import Subject from '../models/Subject.js';
import Student from '../models/Student.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
    resolveTeacherProfile,
    isTeacherAuthorizedForClassSubject
} from '../helpers/teacherScoping.js';
import { normalizeLessonContext } from '../helpers/gradeLessonContext.js';
import {
    extractDocumentText,
    isImageDocumentMime,
    DOCUMENT_MAX_CHARS
} from '../services/documentTextExtraction.js';
import { draftLessonSummaryFromText } from '../services/lessonSummaryAiService.js';
import notificationService from '../services/notificationService.js';

const draftError = (res, statusCode, code, message) =>
    res.status(statusCode).json({ success: false, code, message });

const authorizeLessonScope = async (req, res, classId, subjectId) => {
    if (!classId || !subjectId) {
        draftError(res, 400, 'LESSON_CLASS_SUBJECT_REQUIRED', 'Choose a class and subject first.');
        return false;
    }
    if (req.user.role === 'teacher') {
        const teacherProfile = await resolveTeacherProfile(req);
        if (!teacherProfile) {
            draftError(res, 403, 'LESSON_TEACHER_PROFILE_MISSING', 'Teacher profile not found');
            return false;
        }
        const authorized = await isTeacherAuthorizedForClassSubject(teacherProfile._id, classId, subjectId);
        if (!authorized) {
            draftError(res, 403, 'LESSON_NOT_AUTHORIZED', 'You are not authorized for this class and subject');
            return false;
        }
    }
    return true;
};

/**
 * Draft a family-facing lesson title + summary from the teacher's own account
 * of the lesson. Nothing is saved; the teacher reviews before applying.
 */
export const draftGradeLessonSummary = asyncHandler(async (req, res) => {
    const { classId, subjectId } = req.body || {};
    if (!(await authorizeLessonScope(req, res, classId, subjectId))) return;

    const sourceText = String(req.body?.sourceText ?? '').trim();
    if (!sourceText) {
        return draftError(res, 400, 'LESSON_SOURCE_EMPTY', 'Describe what actually happened in class before drafting.');
    }
    if (sourceText.length > DOCUMENT_MAX_CHARS) {
        return draftError(res, 400, 'LESSON_SOURCE_TOO_LONG', `Keep the lesson description under ${DOCUMENT_MAX_CHARS} characters.`);
    }

    const result = await draftLessonSummaryFromText({
        sourceText,
        usage: { feature: 'grade_lesson_summary_draft' }
    });

    res.json({
        success: true,
        data: { title: result.title, summary: result.instructions }
    });
});

/**
 * Turn one ephemeral PDF into lesson text. Images are deliberately not
 * transcribed here: raw photos can carry student personal data, and that path
 * needs a reviewed privacy gate before it is enabled for grade entry.
 */
export const extractGradeLessonSource = asyncHandler(async (req, res) => {
    const { classId, subjectId } = req.body || {};
    if (!(await authorizeLessonScope(req, res, classId, subjectId))) return;

    if (!req.file) {
        return draftError(res, 400, 'LESSON_SOURCE_REQUIRED', 'Choose a PDF file first.');
    }

    const mimeType = String(req.file.mimetype || '').toLowerCase();
    if (isImageDocumentMime(mimeType)) {
        return draftError(
            res,
            400,
            'LESSON_IMAGE_NOT_ENABLED',
            'Photo transcription is not enabled for grade entry yet. Upload a text PDF, or write the summary yourself.'
        );
    }

    if (mimeType === 'application/pdf') {
        if (req.file.buffer.slice(0, 5).toString('latin1') !== '%PDF-') {
            return draftError(res, 422, 'DOCUMENT_PDF_UNREADABLE', 'This file is not a readable PDF. Export the material as a PDF with selectable text and try again.');
        }
        const extracted = await extractDocumentText({
            buffer: req.file.buffer,
            mimeType,
            usage: false
        });
        return res.json({
            success: true,
            data: {
                sourceType: 'pdf',
                text: extracted.text,
                truncated: extracted.truncated
            }
        });
    }

    return draftError(
        res,
        400,
        'LESSON_SOURCE_TYPE_UNSUPPORTED',
        'Only PDF files with selectable text are read here. Write the summary yourself for other formats.'
    );
});

/**
 * Render the real grade-update email for one authorized pupil without saving
 * or sending anything, so the preview cannot drift from the sent message.
 */
export const previewGradeLessonEmail = asyncHandler(async (req, res) => {
    const body = req.body || {};
    const { classId, subjectId, studentId } = body;
    if (!(await authorizeLessonScope(req, res, classId, subjectId))) return;
    if (!studentId) {
        return draftError(res, 400, 'LESSON_STUDENT_REQUIRED', 'Choose a student to preview their email.');
    }

    const student = await Student.findOne({ _id: studentId, school: req.schoolId });
    if (!student) {
        return draftError(res, 404, 'LESSON_STUDENT_NOT_FOUND', 'Student not found in this school.');
    }
    const enrolled = [student.currentClass, ...(student.enrolledClasses || [])]
        .filter(Boolean)
        .some((id) => String(id) === String(classId));
    if (!enrolled) {
        return draftError(res, 403, 'LESSON_STUDENT_NOT_IN_CLASS', 'This student is not enrolled in the selected class.');
    }

    const maxMarks = Number(body.maxMarks);
    const marks = Number(body.marks);
    if (!Number.isFinite(maxMarks) || maxMarks < 1 || !Number.isFinite(marks) || marks < 0 || marks > maxMarks) {
        return draftError(res, 400, 'LESSON_MARKS_INVALID', 'Enter a valid mark between 0 and the maximum before previewing.');
    }

    const lessonContext = normalizeLessonContext({ title: body.title, lessonSummary: body.lessonSummary });
    const subject = await Subject.findById(subjectId).select('name nameAr').lean();
    const language = body.language === 'ar' ? 'ar' : 'en';
    const date = body.date ? new Date(body.date) : new Date();
    if (Number.isNaN(date.getTime())) {
        return draftError(res, 400, 'LESSON_DATE_INVALID', 'Choose a valid lesson date.');
    }

    const html = await notificationService.formatGradeUpdateHtml(
        student,
        {
            class: classId,
            title: lessonContext.title,
            lessonSummary: lessonContext.lessonSummary,
            remarks: String(body.remarks ?? ''),
            marks,
            maxMarks,
            date,
            gradeType: 'classwork',
            subjectName: subject?.name,
            subjectNameAr: subject?.nameAr
        },
        req.user._id,
        language
    );

    res.json({ success: true, data: { html } });
});