import Student from '../models/Student.js';
import SpellingEmailDelivery from '../models/SpellingEmailDelivery.js';
import SpellingSession from '../models/SpellingSession.js';
import SpellingPassage from '../models/SpellingPassage.js';
import { getPortalUrl } from '../helpers/portalUrl.js';
import { sendTransactionalEmail } from './transactionalEmailService.js';
import logger from '../utils/logger.js';
import { DEFAULT_SPELLING_EMAIL_AUDIENCE, isSpellingEmailAudience } from '../utils/spellingEmailSettings.js';
import {
    TONES,
    block,
    button,
    dataTable,
    detailsPanel,
    escapeHtml,
    formatEmailDate,
    noteBlock,
    paragraph,
    resultPill,
    sanitizeSpellingEmailHtml,
    scoreCard,
    sectionTitle,
    statTiles,
    wordChips,
    wrapSpellingEmail
} from '../helpers/spellingEmailLayout.js';

const MAX_ATTEMPTS = 3;

export const getSpellingAssessmentCoverage = (attempts = [], { fallbackGrade = '', fallbackWeek = null } = {}) => {
    const unique = (values) => [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))];
    const grades = unique(attempts.map((attempt) => attempt.grade));
    const weeks = [...new Set(attempts
        .map((attempt) => Number(attempt.week))
        .filter((week) => Number.isInteger(week) && week > 0))].sort((first, second) => first - second);
    const categories = unique(attempts.map((attempt) => attempt.category))
        .sort((first, second) => first.localeCompare(second, undefined, { sensitivity: 'base' }));

    if (grades.length === 0 && fallbackGrade) grades.push(String(fallbackGrade).trim());
    if (weeks.length === 0 && Number.isInteger(Number(fallbackWeek)) && Number(fallbackWeek) > 0) {
        weeks.push(Number(fallbackWeek));
    }

    return { grades, weeks, categories };
};

export const resolveSpellingCompletionRecipients = (student, audience) => {
    if (!student || audience === 'none') return [];
    const entries = typeof student.getAllContactEmailEntries === 'function'
        ? student.getAllContactEmailEntries()
        : [
            ...(student.parentInfo ? [
                { email: student.parentInfo.fatherEmail, type: 'father' },
                { email: student.parentInfo.motherEmail, type: 'mother' },
                { email: student.parentInfo.guardianEmail, type: 'guardian' }
            ] : []),
            { email: student.studentEmail, type: 'student' },
            { email: student.email, type: 'student' },
            { email: student.user?.email, type: 'student' }
        ];
    return [...new Set(entries
        .filter((entry) => audience === 'student-and-parents'
            || (audience === 'student-only' && entry.type === 'student')
            || (audience === 'parents-only' && ['father', 'mother', 'guardian'].includes(entry.type)))
        .map((entry) => String(entry.email || '').trim().toLowerCase())
        .filter(Boolean))];
};

export const buildFormalTestWordList = ({ retestItems }) => {
    const uniqueMissedWords = new Map();
    for (const item of retestItems) {
        const key = String(item.sourceWord);
        if (!key) continue;
        const existing = uniqueMissedWords.get(key);
        if (existing && (existing.status !== 'practice-mastered' || item.status === 'practice-mastered')) continue;
        uniqueMissedWords.set(key, {
            wordId: item.sourceWord,
            wordSnapshot: item.wordSnapshot,
            grade: item.grade,
            week: item.week,
            category: item.category,
            order: null,
            retestItemId: item._id,
            isRetest: true,
            status: item.status
        });
    }
    const plannedWords = [...uniqueMissedWords.values()].map((item) => ({
        wordId: item.wordId,
        wordSnapshot: item.wordSnapshot,
        grade: item.grade,
        week: item.week,
        category: item.category,
        order: item.order,
        retestItemId: item.retestItemId,
        isRetest: item.isRetest
    }));
    return {
        lowConfidenceWords: plannedWords.map((item) => item.wordSnapshot),
        curriculumWords: [],
        plannedWords
    };
};

const pluralLabel = (values, singular, plural) => (values.length === 1 ? singular : plural);

export const buildSpellingCompletionEmail = ({ session, studentName = '', portalUrl = getPortalUrl() }) => {
    const attempts = session.attempts || [];
    const isFormalAssessment = session.assessmentType === 'formal-spelling-test';
    const coverage = getSpellingAssessmentCoverage(attempts, {
        fallbackGrade: session.curriculumGrade,
        fallbackWeek: session.curriculumWeek
    });
    const targetWords = [...new Set(attempts.filter((attempt) => !attempt.correct).map((attempt) => String(attempt.wordSnapshot || '').trim()).filter(Boolean))];
    const name = String(studentName || '').trim();
    const completedDate = formatEmailDate(session.completedAt || session.startedAt);
    const retestDate = isFormalAssessment ? '' : formatEmailDate(session.retestDeadline);
    const total = attempts.length;
    const score = Math.min(session.correctCount || 0, total);
    const correctCount = session.correctCount || 0;
    const mistakeCount = session.mistakeCount || 0;
    const coverageRows = [
        { label: pluralLabel(coverage.grades, 'Grade', 'Grades'), value: coverage.grades.join(', ') },
        { label: pluralLabel(coverage.weeks, 'Week', 'Weeks'), value: coverage.weeks.join(', ') },
        { label: pluralLabel(coverage.categories, 'Category', 'Categories'), value: coverage.categories.join(', ') }
    ];

    const subject = isFormalAssessment
        ? `Spelling quiz result${name ? ` for ${name}` : ''}: ${score} of ${total} correct`
        : `Spelling level check summary${name ? ` for ${name}` : ''} (${completedDate})`;

    const coverageText = coverageRows.filter((row) => row.value).map((row) => `${row.label}: ${row.value}`).join('\n');
    const text = [
        isFormalAssessment ? 'Formal spelling quiz result' : 'Spelling level check summary',
        name ? `Student: ${name}` : '',
        `Completed: ${completedDate}`,
        isFormalAssessment
            ? 'This was a graded spelling quiz and its score has been recorded in the Gradebook.'
            : "This is not a graded assignment. It is a KG-Grade 5 spelling assessment used to understand the student's spelling level.",
        coverageText,
        isFormalAssessment ? `Score: ${score} out of ${total} words` : `Correct: ${correctCount}\nIncorrect: ${mistakeCount}`,
        `${isFormalAssessment ? 'Words to practice' : 'Target words to practice'}: ${targetWords.length ? targetWords.join(', ') : 'None'}`,
        retestDate ? `Retest deadline: ${retestDate}` : '',
        portalUrl ? `Open portal: ${portalUrl}` : ''
    ].filter(Boolean).join('\n');

    const resultRows = attempts.map((attempt) => [
        escapeHtml(attempt.wordSnapshot),
        ...(isFormalAssessment ? [escapeHtml(attempt.week), escapeHtml(attempt.category)] : []),
        resultPill(attempt.correct)
    ]);
    const resultHeaders = [
        { label: 'Word' },
        ...(isFormalAssessment ? [{ label: 'Week' }, { label: 'Category' }] : []),
        { label: 'Result', align: 'right' }
    ];

    const bodyHtml = [
        paragraph(isFormalAssessment
            ? `This graded quiz${name ? ` for <strong>${escapeHtml(name)}</strong>` : ''} has been recorded in the Gradebook.`
            : `This spelling check${name ? ` for <strong>${escapeHtml(name)}</strong>` : ''} is <strong>not a graded assignment</strong>. It is a KG&ndash;Grade 5 assessment that helps us understand the current spelling level.`),
        isFormalAssessment
            ? scoreCard({ score, total, label: 'Quiz score' })
            : statTiles([
                { label: 'Words checked', value: total },
                { label: 'Correct', value: correctCount, tone: TONES.success },
                { label: 'Incorrect', value: mistakeCount, tone: TONES.danger }
            ]),
        sectionTitle(isFormalAssessment ? 'Quiz coverage' : 'Level checked'),
        detailsPanel([
            ...coverageRows,
            { label: 'Retest deadline', value: retestDate, color: TONES.warning.strong }
        ]),
        sectionTitle(isFormalAssessment ? 'Words to practice' : 'Target words to practice', targetWords.length ? 'Spend a few minutes on these before the next session.' : ''),
        block(wordChips(targetWords, TONES.warning, 'No missed words. Great work!'), 16),
        total ? sectionTitle('Word by word') : '',
        total ? dataTable(resultHeaders, resultRows) : '',
        button(portalUrl, 'Open spelling portal')
    ].join('');

    const html = sanitizeSpellingEmailHtml(wrapSpellingEmail({
        preheader: isFormalAssessment
            ? `${name || 'Your'} spelling quiz score: ${score} of ${total}.`
            : `${correctCount} correct, ${mistakeCount} to practice.`,
        eyebrow: isFormalAssessment ? 'Spelling quiz result' : 'Spelling level check',
        title: isFormalAssessment ? 'Formal spelling quiz' : 'Spelling level check',
        subtitle: [name ? `For ${name}` : '', completedDate ? `Completed ${completedDate}` : ''].filter(Boolean).join(' · '),
        bodyHtml
    }));

    return { subject, text, html };
};

export async function queueSpellingCompletionEmail({ session, dbSession }) {
    const audience = isSpellingEmailAudience(session.emailNotification)
        ? session.emailNotification
        : DEFAULT_SPELLING_EMAIL_AUDIENCE;
    if (audience === 'none') {
        await SpellingSession.updateOne(
            { _id: session._id, school: session.school },
            { $set: { emailStatus: 'not-applicable', emailError: 'Spelling completion email sending is disabled' } },
            { session: dbSession }
        );
        return null;
    }

    const student = await Student.findOne({ _id: session.student, school: session.school })
        .populate('user', 'email')
        .session(dbSession);
    if (!student) return null;
    const recipients = resolveSpellingCompletionRecipients(student, audience);
    if (recipients.length === 0) {
        await SpellingSession.updateOne(
            { _id: session._id, school: session.school },
            { $set: { emailStatus: 'not-applicable', emailError: 'No student or parent email addresses are configured' } },
            { session: dbSession }
        );
        return null;
    }

    const { subject, text, html } = buildSpellingCompletionEmail({ session, studentName: student.fullName });

    await SpellingSession.updateOne(
        { _id: session._id, school: session.school },
        { $set: { emailStatus: 'pending', emailError: null } },
        { session: dbSession }
    );
    return SpellingEmailDelivery.create([{
        school: session.school,
        session: session._id,
        student: session.student,
        senderUser: session.createdBy || session.administeredBy || null,
        recipients,
        subject,
        html,
        text
    }], { session: dbSession }).then(([delivery]) => delivery);
}

export const buildSpellingRetestPracticeEmail = ({ session, words = [], studentName = '', portalUrl = getPortalUrl() }) => {
    const seen = new Set();
    const practiceWords = words
        .map((word) => String(word || '').trim())
        .filter((word) => word && !seen.has(word.toLowerCase()) && seen.add(word.toLowerCase()));
    const name = String(studentName || '').trim();
    const firstName = name.split(/\s+/)[0];
    const availableDate = formatEmailDate(session.startedAt);
    const wordCountLabel = `${practiceWords.length} ${practiceWords.length === 1 ? 'word' : 'words'}`;

    const subject = `Spelling retest quiz ready${name ? ` for ${name}` : ''}: ${wordCountLabel} to practice`;
    const text = [
        ['Your spelling retest quiz is ready', name ? `Student: ${name}` : '', availableDate ? `Available since: ${availableDate}` : ''].filter(Boolean).join('\n'),
        ['Your graded spelling retest quiz is now available. Practice these words before you begin:', ...practiceWords.map((word) => `- ${word}`)].join('\n'),
        portalUrl ? `Open the spelling portal: ${portalUrl}` : ''
    ].filter(Boolean).join('\n\n');

    const bodyHtml = [
        paragraph(`${firstName ? `<strong>${escapeHtml(firstName)}</strong>, it's` : "It's"} time to revisit the words you missed earlier. Your <strong>graded retest quiz</strong> is open now in the spelling portal.`),
        detailsPanel([
            { label: 'Quiz', value: 'Graded spelling retest' },
            { label: 'Words', value: wordCountLabel },
            { label: 'Available since', value: availableDate, color: TONES.accent.strong }
        ]),
        sectionTitle('Words to practice', 'Review these before you begin. The quiz uses exactly this list.'),
        block(wordChips(practiceWords, TONES.warning, 'No words to practice.'), 16),
        noteBlock('<strong>Quick warm-up:</strong> read each word aloud, spell it letter by letter, then cover it and write it from memory. When you feel ready, start the quiz.', TONES.accent),
        button(portalUrl, 'Start retest quiz')
    ].join('');

    const html = sanitizeSpellingEmailHtml(wrapSpellingEmail({
        preheader: `${wordCountLabel} to practice before your spelling retest quiz.`,
        eyebrow: 'Spelling retest',
        title: 'Your retest quiz is ready',
        subtitle: [name ? `For ${name}` : '', availableDate ? `Available since ${availableDate}` : ''].filter(Boolean).join(' · '),
        bodyHtml,
        footer: 'Practice makes progress. Take your time and do your best.'
    }));

    return { subject, text, html };
};

export async function queueSpellingRetestPracticeEmail({ session, words, dbSession }) {
    const audience = isSpellingEmailAudience(session.emailNotification)
        ? session.emailNotification
        : DEFAULT_SPELLING_EMAIL_AUDIENCE;
    if (audience === 'none') {
        await SpellingSession.updateOne(
            { _id: session._id, school: session.school },
            { $set: { retestEmailStatus: 'not-applicable' } },
            { session: dbSession }
        );
        return null;
    }

    const student = await Student.findOne({ _id: session.student, school: session.school })
        .populate('user', 'email')
        .session(dbSession);
    if (!student) throw new Error('Student not found while preparing spelling retest email');
    const recipients = resolveSpellingCompletionRecipients(student, audience);
    if (recipients.length === 0) {
        await SpellingSession.updateOne(
            { _id: session._id, school: session.school },
            { $set: { retestEmailStatus: 'not-applicable' } },
            { session: dbSession }
        );
        return null;
    }

    const { subject, text, html } = buildSpellingRetestPracticeEmail({ session, words, studentName: student.fullName });

    await SpellingSession.updateOne(
        { _id: session._id, school: session.school },
        { $set: { retestEmailStatus: 'pending' } },
        { session: dbSession }
    );
    return SpellingEmailDelivery.create([{
        school: session.school,
        session: session._id,
        student: session.student,
        senderUser: session.createdBy || session.administeredBy || null,
        kind: 'retest-practice',
        recipients,
        subject,
        html,
        text
    }], { session: dbSession }).then(([delivery]) => delivery);
}

export const buildFormalSpellingTestWordListEmail = ({ session, lowConfidenceWords, timeZone = 'UTC', studentName = '', portalUrl = getPortalUrl() }) => {
    const scheduledDate = new Date(session.scheduledAt).toLocaleString('en-US', {
        timeZone,
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    });
    const name = String(studentName || '').trim();
    const totalWords = lowConfidenceWords.length;
    const wordCountLabel = `${totalWords} ${totalWords === 1 ? 'word' : 'words'}`;
    const subject = `Words to prepare for your spelling test on ${scheduledDate}`;
    const text = [
        'Prepare for your spelling test',
        name ? `Student: ${name}` : '',
        `Scheduled: ${scheduledDate}`,
        `The test list has ${wordCountLabel}.`,
        '',
        'Unresolved missed words to review:',
        ...(lowConfidenceWords.length ? lowConfidenceWords.map((word) => `- ${word}`) : ['- None']),
        '',
        '',
        'Your test will use only this unresolved-word list and finish when you complete it, unless it ends earlier because the mistake limit is reached.',
        portalUrl ? `Open the spelling portal: ${portalUrl}` : ''
    ].filter((line) => line !== '').join('\n');

    const bodyHtml = [
        paragraph(`${name ? `<strong>${escapeHtml(name.split(/\s+/)[0])}</strong>, your` : 'Your'} formal spelling test is coming up. A quick review today can help you feel ready.`),
        detailsPanel([
            { label: 'Test date', value: scheduledDate, color: TONES.accent.strong },
            { label: 'Test length', value: wordCountLabel }
        ]),
        sectionTitle('Words still to recover', 'Give these words extra practice. This is the list you will be tested on.'),
        block(wordChips(lowConfidenceWords, TONES.warning, 'No previously missed words.'), 16),
        noteBlock('<strong>How the test works:</strong> your formal test covers only these unresolved words and ends when you finish the list, unless the mistake limit is reached first.'),
        noteBlock('<strong>Practice tip:</strong> say each word out loud, write it three times, then cover it and write it again from memory.', TONES.accent),
        button(portalUrl, 'Open spelling portal')
    ].join('');

    const html = sanitizeSpellingEmailHtml(wrapSpellingEmail({
        preheader: `${wordCountLabel} to review before your spelling test on ${scheduledDate}.`,
        eyebrow: 'Spelling test prep',
        title: 'Get ready for your spelling test',
        subtitle: [name ? `For ${name}` : '', scheduledDate].filter(Boolean).join(' · '),
        bodyHtml,
        footer: "You've got this. Take your time and do your best."
    }));
    return { subject, text, html };
};

export async function queueFormalSpellingTestWordListEmail({ session, lowConfidenceWords, audience, timeZone, dbSession }) {
    const student = await Student.findOne({ _id: session.student, school: session.school })
        .populate('user', 'email')
        .session(dbSession);
    if (!student) throw new Error('Student not found while preparing formal spelling test email');
    const recipients = resolveSpellingCompletionRecipients(student, audience);
    if (recipients.length === 0) {
        throw Object.assign(new Error('No email address is configured for the selected formal test email audience'), { statusCode: 400 });
    }

    const email = buildFormalSpellingTestWordListEmail({ session, lowConfidenceWords, timeZone, studentName: student.fullName });
    const [delivery] = await SpellingEmailDelivery.create([{
        school: session.school,
        session: session._id,
        student: session.student,
        senderUser: session.createdBy || null,
        kind: 'formal-test-prep',
        recipients,
        ...email
    }], { session: dbSession });
    return delivery;
}

export async function processDueSpellingEmails({ now = new Date(), limit = 25, deliveryId = null } = {}) {
    const stats = { claimed: 0, sent: 0, failed: 0 };
    for (let index = 0; index < Math.min(Math.max(Number(limit) || 25, 1), 100); index += 1) {
        const delivery = await SpellingEmailDelivery.findOneAndUpdate(
            {
                ...(deliveryId ? { _id: deliveryId } : {}),
                status: { $in: ['pending', 'failed'] },
                attempts: { $lt: MAX_ATTEMPTS },
                nextAttemptAt: { $lte: now }
            },
            { $set: { status: 'processing' }, $inc: { attempts: 1 } },
            { new: true, sort: { nextAttemptAt: 1, createdAt: 1 } }
        );
        if (!delivery) break;
        stats.claimed += 1;
        if (delivery.kind !== 'formal-test-prep') {
            await SpellingSession.updateOne(
                { _id: delivery.session, school: delivery.school },
                delivery.kind === 'retest-practice'
                    ? { $inc: { emailAttempts: 1 }, $set: { retestEmailStatus: 'pending' } }
                    : { $inc: { emailAttempts: 1 }, $set: { emailStatus: 'pending' } }
            );
        }
        try {
            await sendTransactionalEmail({
                to: delivery.recipients,
                subject: delivery.subject,
                text: delivery.text,
                html: delivery.html,
                schoolId: delivery.school,
                preferredUserId: delivery.senderUser || null,
                allowAdminFallback: false,
                allowSmtp: false
            });
            await SpellingEmailDelivery.updateOne({ _id: delivery._id, status: 'processing' }, { $set: { status: 'sent', sentAt: new Date(), lastError: '' } });
            if (delivery.kind === 'retest-practice') {
                await SpellingSession.updateOne(
                    { _id: delivery.session, school: delivery.school },
                    { $set: { retestEmailStatus: 'sent' } }
                );
            } else if (delivery.kind !== 'formal-test-prep') {
                await SpellingSession.updateOne({ _id: delivery.session, school: delivery.school }, { $set: { emailStatus: 'sent', emailSentAt: new Date(), emailError: null } });
            }
            if (delivery.kind === 'passage') {
                await SpellingPassage.updateOne(
                    delivery.passage
                        ? { _id: delivery.passage, school: delivery.school }
                        : { school: delivery.school, session: delivery.session },
                    { $set: { status: 'sent', sentAt: new Date(), lastError: '' } }
                );
            }
            stats.sent += 1;
        } catch (error) {
            const exhausted = delivery.attempts >= MAX_ATTEMPTS;
            logger.error('spelling_completion_email_failed', {
                deliveryId: String(delivery._id),
                sessionId: String(delivery.session),
                attempts: delivery.attempts,
                exhausted,
                message: error.message
            });
            await SpellingEmailDelivery.updateOne(
                { _id: delivery._id, status: 'processing' },
                { $set: { status: exhausted ? 'failed' : 'pending', lastError: error.message, nextAttemptAt: new Date(Date.now() + (delivery.attempts * 5 * 60 * 1000)) } }
            );
            if (delivery.kind === 'retest-practice') {
                await SpellingSession.updateOne(
                    { _id: delivery.session, school: delivery.school },
                    { $set: { retestEmailStatus: exhausted ? 'failed' : 'pending' } }
                );
            } else if (delivery.kind !== 'formal-test-prep') {
                await SpellingSession.updateOne({ _id: delivery.session, school: delivery.school }, { $set: { emailStatus: exhausted ? 'failed' : 'pending', emailError: error.message } });
            }
            if (delivery.kind === 'passage') {
                await SpellingPassage.updateOne({ school: delivery.school, session: delivery.session }, { $set: { status: exhausted ? 'failed' : 'queued', lastError: error.message } });
            }
            stats.failed += 1;
        }
    }
    return stats;
}

export async function processSpellingEmailDelivery({ deliveryId }) {
    if (!deliveryId) throw new Error('A spelling email delivery ID is required');
    await processDueSpellingEmails({ limit: 1, deliveryId });
    return SpellingEmailDelivery.findById(deliveryId).select('status lastError').lean();
}
