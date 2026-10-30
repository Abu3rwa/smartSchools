import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

/**
 * One lesson the tutor is allowed to answer from. Lessons belong to a subject and
 * a grade, never to a class, so every class in the same grade reads the same
 * content. The unit and chapter columns are optional: a teacher may import a flat
 * list of lessons, or a full unit → chapter → lesson tree.
 */
const tutorLessonSchema = new mongoose.Schema(
    {
        school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
        subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true, index: true },
        grade: { type: Number, required: true, min: 1, max: 12, index: true },
        unitNumber: { type: Number, default: null, min: 1 },
        unitTitle: { type: String, trim: true, default: '' },
        chapterNumber: { type: Number, default: null, min: 1 },
        chapterTitle: { type: String, trim: true, default: '' },
        lessonNumber: { type: Number, required: true, min: 1 },
        title: { type: String, required: true, trim: true, maxlength: 200 },
        content: { type: String, required: true },
        standards: [{ type: String, trim: true, uppercase: true }],
        keywords: [{ type: String, trim: true }],
        // Title, keywords and the opening of the lesson, lowercased. The tutor scores
        // a subject's whole lesson list on this small column, then reads the full text
        // of the three lessons it actually answers from.
        searchText: { type: String, default: '' },
        wordCount: { type: Number, default: 0 },
        source: { type: String, trim: true, default: '' },
        isActive: { type: Boolean, default: true },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    },
    { timestamps: true }
);

tutorLessonSchema.index({ school: 1, subject: 1, grade: 1, unitNumber: 1, chapterNumber: 1, lessonNumber: 1 });

tutorLessonSchema.plugin(tenantIsolationPlugin);

const TutorLesson = mongoose.model('TutorLesson', tutorLessonSchema);
export default TutorLesson;
