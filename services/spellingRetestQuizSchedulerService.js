import Student from '../models/Student.js';
import SpellingClassSettings from '../models/SpellingClassSettings.js';
import SpellingRetestItem from '../models/SpellingRetestItem.js';
import SpellingSession from '../models/SpellingSession.js';
import { queueSpellingRetestPracticeEmail } from './spellingEmailService.js';
import { withTransaction } from '../utils/withTransaction.js';

const DEFAULT_INTERVAL_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export const selectRetestQuizItems = (items) => [...items]
    .sort((left, right) => (
        (left.correctRetestStreak || 0) - (right.correctRetestStreak || 0)
        || (right.incorrectRetestCount || 0) - (left.incorrectRetestCount || 0)
        || new Date(left.lastRetestedAt || 0) - new Date(right.lastRetestedAt || 0)
        || new Date(left.dueAt) - new Date(right.dueAt)
        || new Date(left.flaggedAt) - new Date(right.flaggedAt)
        || String(left._id).localeCompare(String(right._id))
    ));

export async function scheduleDueSpellingRetestQuizzes({ now = new Date(), limit = 500 } = {}) {
    const result = { studentsChecked: 0, quizzesScheduled: 0, wordsScheduled: 0 };
    const dueItems = await SpellingRetestItem.find({ status: 'pending', dueAt: { $lte: now } })
        .sort({ lastRetestedAt: 1, dueAt: 1, flaggedAt: 1, _id: 1 })
        .limit(Math.min(Math.max(Number(limit) || 500, 1), 2000))
        .setOptions({ skipTenantFilter: true })
        .lean();
    const students = new Map();
    dueItems.forEach((item) => {
        const key = `${item.school}:${item.student}`;
        const items = students.get(key) || [];
        items.push(item);
        students.set(key, items);
    });

    for (const items of students.values()) {
        result.studentsChecked += 1;
        const student = await Student.findOne({ _id: items[0].student, school: items[0].school })
            .select('user currentClass enrolledClasses')
            .lean();
        if (!student) continue;
        const classId = student.currentClass || student.enrolledClasses?.[0] || null;
        const settings = classId
            ? await SpellingClassSettings.findOne({ school: items[0].school, class: classId }).lean()
            : null;
        const intervalDays = settings?.retestIntervalDays || DEFAULT_INTERVAL_DAYS;
        const dueStudentItems = await SpellingRetestItem.find({
            school: items[0].school,
            student: items[0].student,
            status: 'pending',
            dueAt: { $lte: now }
        })
            .sort({ dueAt: 1, flaggedAt: 1, _id: 1 })
            .lean();
        const selectedItems = selectRetestQuizItems(dueStudentItems);
        if (!selectedItems.length) continue;

        const quizKey = new Date(selectedItems[0].dueAt).toISOString();
        const nextDueAt = new Date(now.getTime() + intervalDays * DAY_MS);
        try {
            const scheduledWordCount = await withTransaction(async (dbSession) => {
                const activeSession = await SpellingSession.findOne({
                    school: items[0].school,
                    student: items[0].student,
                    status: { $in: ['scheduled', 'in-progress'] }
                }).select('_id').session(dbSession).lean();
                if (activeSession) return 0;

                const existingQuiz = await SpellingSession.findOne({
                    school: items[0].school,
                    student: items[0].student,
                    retestQuizKey: quizKey
                }).select('_id').session(dbSession).lean();
                if (existingQuiz) return 0;

                const [quiz] = await SpellingSession.create([{
                    school: items[0].school,
                    student: items[0].student,
                    mode: 'self-serve',
                    status: 'in-progress',
                    assessmentType: 'retest-quiz',
                    retestQuizItems: selectedItems.map((item) => item._id),
                    retestQuizKey: quizKey,
                    maxMistakesAllowed: 50,
                    retestDeadline: nextDueAt,
                    retestIntervalDays: intervalDays,
                    curriculumGrade: selectedItems[0].grade,
                    curriculumWeek: selectedItems[0].week,
                    startedAt: now,
                    createdBy: student.user || null,
                    emailNotification: settings?.defaultEmailAudience || 'student-and-parents'
                }], { session: dbSession });

                await SpellingRetestItem.updateMany({
                    _id: { $in: selectedItems.map((item) => item._id) },
                    school: items[0].school,
                    student: items[0].student,
                    status: 'pending'
                }, {
                    $set: { dueAt: nextDueAt }
                }, { session: dbSession });
                await SpellingRetestItem.updateMany({
                    _id: { $in: selectedItems.map((item) => item._id) },
                    school: items[0].school,
                    status: 'pending'
                }, {
                    $set: { lastRetestedAt: now }
                }, { session: dbSession });

                await queueSpellingRetestPracticeEmail({
                    session: quiz,
                    words: selectedItems.map((item) => item.wordSnapshot),
                    dbSession
                });
                return selectedItems.length;
            });
            if (scheduledWordCount > 0) {
                result.quizzesScheduled += 1;
                result.wordsScheduled += scheduledWordCount;
            }
        } catch (error) {
            if (error.code === 11000) continue;
            throw error;
        }
    }
    return result;
}
