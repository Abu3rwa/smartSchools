import { asyncHandler } from '../middleware/errorHandler.js';
import { buildStudentSpellingDetails } from '../services/spellingDetailsService.js';

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
