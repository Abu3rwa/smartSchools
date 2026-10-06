import { asyncHandler } from '../middleware/errorHandler.js';
import { buildStudentSpellingDetails } from '../services/spellingDetailsService.js';
import { buildStudentSpellingDetailsDocx } from '../services/spellingDetailsDocxService.js';

export const getStudentSpellingDetails = asyncHandler(async (req, res) => {
    const data = await buildStudentSpellingDetails({
        schoolId: req.schoolId,
        studentId: req.params.studentId,
        grade: req.query.grade,
        from: req.query.from,
        to: req.query.to
    });
    return res.json({ success: true, data });
});

export const exportStudentSpellingDetailsDocx = asyncHandler(async (req, res) => {
    const details = await buildStudentSpellingDetails({
        schoolId: req.schoolId,
        studentId: req.params.studentId
    });
    const buffer = await buildStudentSpellingDetailsDocx(details, { locale: req.query.locale });
    const fullName = `${details.student.firstName || ''}-${details.student.lastName || ''}`.trim();
    const safeName = fullName.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'student';
    const filename = `spelling-report-${safeName}.docx`;
    const encodedFilename = encodeURIComponent(`spelling-report-${fullName || 'student'}.docx`)
        .replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${encodedFilename}`);
    return res.send(buffer);
});
