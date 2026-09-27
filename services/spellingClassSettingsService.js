import SpellingClassSettings from '../models/SpellingClassSettings.js';
import { DEFAULT_SPELLING_EMAIL_AUDIENCE, isSpellingEmailAudience } from '../utils/spellingEmailSettings.js';

const badRequest = (message) => Object.assign(new Error(message), { statusCode: 400 });
const normalize = (input = {}) => {
    const defaultMaxMistakes = Number(input.defaultMaxMistakes ?? 3);
    if (!Number.isInteger(defaultMaxMistakes) || defaultMaxMistakes < 1 || defaultMaxMistakes > 50) throw badRequest('defaultMaxMistakes must be a positive integer between 1 and 50');
    const defaultEmailAudience = input.defaultEmailAudience || DEFAULT_SPELLING_EMAIL_AUDIENCE;
    const passageEmailAudience = input.passageGeneration?.passageEmailAudience || 'none';
    if (!isSpellingEmailAudience(defaultEmailAudience) || !isSpellingEmailAudience(passageEmailAudience)) throw badRequest('Invalid spelling email audience');
    return {
        defaultMaxMistakes,
        defaultEmailAudience,
        passageGeneration: {
            enabled: input.passageGeneration?.enabled === true,
            trigger: input.passageGeneration?.trigger === 'automatic' ? 'automatic' : 'manual',
            style: input.passageGeneration?.style === 'passage' ? 'passage' : 'sentence-list',
            requireTeacherApproval: input.passageGeneration?.requireTeacherApproval !== false,
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
    return SpellingClassSettings.findOneAndUpdate(
        { school: schoolId, class: classId },
        { $set: { ...settings, teacher: teacherId } },
        { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
    ).lean();
}
