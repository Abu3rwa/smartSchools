import SpellingClassSettings from '../models/SpellingClassSettings.js';
import Class from '../models/Class.js';
import Subject from '../models/Subject.js';
import mongoose from 'mongoose';
import { DEFAULT_SPELLING_EMAIL_AUDIENCE, isSpellingEmailAudience } from '../utils/spellingEmailSettings.js';

const badRequest = (message) => Object.assign(new Error(message), { statusCode: 400 });
const normalize = (input = {}) => {
    const gradebookSubject = input.gradebookSubject || null;
    if (gradebookSubject && !mongoose.isValidObjectId(gradebookSubject)) {
        throw badRequest('gradebookSubject must be a valid subject ID');
    }
    const defaultMaxMistakes = Number(input.defaultMaxMistakes ?? 3);
    if (!Number.isInteger(defaultMaxMistakes) || defaultMaxMistakes < 1 || defaultMaxMistakes > 50) throw badRequest('defaultMaxMistakes must be a positive integer between 1 and 50');
    const retestIntervalDays = Number(input.retestIntervalDays ?? 7);
    if (![7, 30, 60].includes(retestIntervalDays)) throw badRequest('retestIntervalDays must be 7, 30, or 60');
    const defaultEmailAudience = input.defaultEmailAudience || DEFAULT_SPELLING_EMAIL_AUDIENCE;
    const passageEmailAudience = input.passageGeneration?.passageEmailAudience || 'none';
    if (!isSpellingEmailAudience(defaultEmailAudience) || !isSpellingEmailAudience(passageEmailAudience)) throw badRequest('Invalid spelling email audience');
    return {
        defaultMaxMistakes,
        defaultEmailAudience,
        gradebookSubject,
        retestIntervalDays,
        dictationMode: {
            enabled: input.dictationMode?.enabled === true,
            autoPlayOnShow: input.dictationMode?.autoPlayOnShow !== false
        },
        passageGeneration: {
            enabled: input.passageGeneration?.enabled === true,
            trigger: 'manual',
            style: input.passageGeneration?.style === 'passage' ? 'passage' : 'sentence-list',
            requireTeacherApproval: true,
            passageEmailAudience
        }
    };
};

export async function getSpellingClassSettings({ schoolId, classId, teacherId }) {
    const existing = await SpellingClassSettings.findOne({ school: schoolId, class: classId }).lean();
    if (existing) return existing;
    return { school: schoolId, class: classId, teacher: teacherId, ...normalize() };
}

export async function updateSpellingClassSettings({ schoolId, classId, teacherId, input }) {
    const settings = normalize(input);
    if (settings.gradebookSubject) {
        const classDoc = await Class.findOne({ _id: classId, school: schoolId }).select('subjects.subject').lean();
        if (!classDoc) throw Object.assign(new Error('Class not found'), { statusCode: 404 });
        const subjectIsAssigned = classDoc.subjects.some(
            (entry) => String(entry.subject) === String(settings.gradebookSubject)
        );
        const subject = subjectIsAssigned
            ? await Subject.findOne({ _id: settings.gradebookSubject, school: schoolId }).select('_id').lean()
            : null;
        if (!subject) throw badRequest('The Gradebook subject must be assigned to this class');
    }
    return SpellingClassSettings.findOneAndUpdate(
        { school: schoolId, class: classId },
        { $set: { ...settings, teacher: teacherId } },
        { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
    ).lean();
}
