import SpellingPassage from '../models/SpellingPassage.js';
import SpellingSession from '../models/SpellingSession.js';
import SpellingEmailDelivery from '../models/SpellingEmailDelivery.js';
import Student from '../models/Student.js';
import { resolveSpellingCompletionRecipients } from './spellingEmailService.js';
import { buildSpellingPassageEmail } from './spellingPassageEmailService.js';
import aiService from './aiservice.js';

const notFound = (message) => Object.assign(new Error(message), { statusCode: 404 });
const badRequest = (message) => Object.assign(new Error(message), { statusCode: 400 });
const forbidden = (message) => Object.assign(new Error(message), { statusCode: 403 });
const conflict = (message) => Object.assign(new Error(message), { statusCode: 409 });

const uniqueMissedWords = (sessions) => {
    const words = new Map();
    for (const session of sessions) {
        for (const attempt of session.attempts || []) {
            const word = String(attempt.wordSnapshot || '').trim();
            const key = word.toLocaleLowerCase();
            if (!attempt.correct && word && !words.has(key)) words.set(key, word);
        }
    }
    return [...words.values()];
};

const validateGeneratedContent = ({ content, missedWords, style }) => {
    const normalized = String(content || '').trim();
    if (!normalized) throw new Error('AI returned empty practice content');
    const wordPattern = (word) => new RegExp(`(^|\\W)${word.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}(?=\\W|$)`, 'i');
    for (const word of missedWords) {
        if (!wordPattern(word).test(normalized)) {
            throw new Error(`AI content is missing the missed word: ${word}`);
        }
    }
    const sentences = normalized.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((sentence) => sentence.trim()).filter(Boolean) || [];
    if (!sentences.length || sentences.some((sentence) => !missedWords.some((word) => wordPattern(word).test(sentence)))) {
        throw new Error('Every practice sentence must include at least one missed word');
    }
    if (style === 'passage' && normalized.split(/\s+/).length > 140) {
        throw new Error('AI passage is longer than the allowed limit');
    }
    return normalized;
};

const fallbackContent = (missedWords) => missedWords.map((word, index) => {
    const templates = [
        `I can spell ${word} when I write it in my spelling notebook.`,
        `Can you find ${word} in this sentence and read it aloud?`,
        `I wrote ${word} carefully, then checked ${word} one more time.`,
        `The word ${word} is ready for me to practice today.`
    ];
    return templates[index % templates.length];
}).join('\n');

const getAuthorizedSession = async ({ schoolId, sessionId, user }) => {
    const session = await SpellingSession.findOne({ _id: sessionId, school: schoolId }).lean();
    if (!session) throw notFound('Spelling session not found');
    if (user?.role === 'student') {
        const student = await import('../models/Student.js').then(({ default: Student }) => Student.findOne({ _id: session.student, user: user._id, school: schoolId }).select('_id').lean());
        if (!student) throw forbidden('You cannot access this spelling session');
    }
    if (session.status !== 'completed') throw badRequest('Practice passages can only be created after a session is completed');
    return session;
};

export async function getSpellingPassage({ schoolId, sessionId, user }) {
    await getAuthorizedSession({ schoolId, sessionId, user });
    const passage = await SpellingPassage.findOne({ school: schoolId, session: sessionId }).sort({ createdAt: -1 }).lean();
    if (user?.role === 'student' && passage && !['approved', 'sent'].includes(passage.status)) return null;
    return passage;
}

export async function generateSpellingPassage({ schoolId, sessionId, userId, style = 'sentence-list' }) {
    const session = await getAuthorizedSession({ schoolId, sessionId, user: { role: 'teacher' } });
    if (!['passage', 'sentence-list'].includes(style)) throw badRequest('Invalid passage style');
    const existing = await SpellingPassage.findOne({ school: schoolId, session: sessionId }).sort({ createdAt: -1 });
    if (existing?.status === 'queued') throw conflict('A queued passage cannot be regenerated until delivery is cancelled');
    if (existing?.regenerationCount >= 3) throw badRequest('Maximum passage generation attempts reached');
    const completedSessions = await SpellingSession.find({
        school: schoolId,
        student: session.student,
        status: 'completed'
    }).sort({ completedAt: 1, createdAt: 1 }).lean();
    const missedWords = uniqueMissedWords(completedSessions);
    if (!missedWords.length) throw badRequest('No missed words are available for practice');
    const prompt = `Create safe, age-appropriate KG-Grade 5 spelling practice as ${style === 'passage' ? 'a short connected set of sentences' : 'a list of short sentences'}. Return only JSON: {"content":"...","highlightedWords":[...]}.
Every sentence MUST include at least one word from the missed-word list. Every missed word must appear correctly spelled at least once, and may appear in more than one sentence for repeated practice. Do not include a heading, introduction, instructions, or closing sentence that does not contain a missed word. Use natural sentences like: "I have a cute little pet dog." Keep it short, avoid mature or frightening themes, and make clear this is practice material, not a grade.
Grade: ${session.curriculumGrade || 'KG-5'}
Missed words: ${JSON.stringify(missedWords)}`;
    let content;
    let highlightedWords = missedWords;
    try {
        const result = await aiService.generateStructuredJson({ prompt, modelName: process.env.SPELLING_PASSAGE_AI_MODEL || process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite' });
        content = validateGeneratedContent({ content: result.parsed.content, missedWords, style });
        highlightedWords = Array.isArray(result.parsed.highlightedWords) ? result.parsed.highlightedWords : missedWords;
    } catch {
        content = fallbackContent(missedWords);
    }
    if (existing?.status === 'sent') {
        return SpellingPassage.create({
            school: schoolId,
            session: sessionId,
            student: session.student,
            supersedes: existing._id,
            style,
            missedWords,
            highlightedWords,
            content,
            status: 'draft',
            generatedAt: new Date(),
            generatedBy: userId,
            regenerationCount: (existing.regenerationCount || 0) + 1,
            lastError: ''
        });
    }

    const passage = await SpellingPassage.findOneAndUpdate(
        existing
            ? { _id: existing._id, school: schoolId, session: sessionId }
            : { school: schoolId, session: sessionId },
        { $set: { student: session.student, style, missedWords, highlightedWords, content, status: 'draft', generatedAt: new Date(), generatedBy: userId, lastError: '' }, $inc: { regenerationCount: 1 } },
        { upsert: !existing, new: true, setDefaultsOnInsert: true }
    );
    return passage;
}

export async function updateSpellingPassage({ schoolId, sessionId, userId, content }) {
    if (!String(content || '').trim()) throw badRequest('Passage content is required');
    const passage = await SpellingPassage.findOneAndUpdate(
        { school: schoolId, session: sessionId, status: { $in: ['draft', 'approved', 'failed'] } },
        { $set: { content: String(content).trim(), editedAt: new Date(), editedBy: userId, editedByTeacher: true, status: 'draft' } },
        { new: true, sort: { createdAt: -1 } }
    );
    if (!passage) throw notFound('Editable spelling passage not found');
    return passage;
}

export async function approveSpellingPassage({ schoolId, sessionId, userId }) {
    const passage = await SpellingPassage.findOneAndUpdate(
        { school: schoolId, session: sessionId, status: 'draft' },
        { $set: { status: 'approved', approvedAt: new Date(), approvedBy: userId, lastError: '' } },
        { new: true, sort: { createdAt: -1 } }
    );
    if (!passage) throw notFound('Draft spelling passage not found');
    return passage;
}

export async function discardSpellingPassage({ schoolId, sessionId, userId }) {
    const passage = await SpellingPassage.findOneAndUpdate(
        { school: schoolId, session: sessionId, status: { $in: ['draft', 'approved', 'failed'] } },
        { $set: { status: 'discarded', editedBy: userId, editedAt: new Date() } },
        { new: true, sort: { createdAt: -1 } }
    );
    if (!passage) throw notFound('Spelling passage not found');
    return passage;
}

export async function sendSpellingPassage({ schoolId, sessionId, userId }) {
    const session = await getAuthorizedSession({ schoolId, sessionId, user: { role: 'teacher' } });
    const passage = await SpellingPassage.findOne({ school: schoolId, session: sessionId }).sort({ createdAt: -1 });
    if (!passage || !['approved', 'failed'].includes(passage.status)) throw badRequest('Approve the spelling passage before sending it');
    const audience = session.passageEmailAudience || session.emailNotification;
    if (audience === 'none') {
        throw badRequest('Passage email is disabled for this session. Set "Send practice passage to" to Student, Parents/guardians, or Both before starting a new session.');
    }
    const student = await Student.findOne({ _id: session.student, school: schoolId }).populate('user', 'email');
    if (!student) throw notFound('Student for this spelling session was not found');
    const recipients = resolveSpellingCompletionRecipients(student, audience);
    if (!recipients.length) {
        const audienceLabel = audience === 'student-only' ? 'student' : audience === 'parents-only' ? 'parent/guardian' : 'student or parent/guardian';
        throw badRequest(`No ${audienceLabel} email address is configured for this student. Add an email address, then start a new session so the audience setting is saved.`);
    }
    const passageEmail = buildSpellingPassageEmail({
        passage,
        session,
        portalUrl: process.env.PORTAL_URL || process.env.CLIENT_URL || ''
    });
    const existingDelivery = await SpellingEmailDelivery.findOne({ school: schoolId, passage: passage._id, kind: 'passage' }).lean();
    if (['pending', 'processing', 'sent'].includes(existingDelivery?.status)) {
        throw conflict(existingDelivery.status === 'sent'
            ? 'This passage has already been sent'
            : 'This passage already has a queued delivery');
    }

    const delivery = await SpellingEmailDelivery.findOneAndUpdate(
        { school: schoolId, passage: passage._id, kind: 'passage' },
        {
            $set: {
                recipients,
                subject: passageEmail.subject,
                text: passageEmail.text,
                html: passageEmail.html,
                status: 'staging',
                attempts: 0,
                nextAttemptAt: new Date(),
                sentAt: null,
                lastError: ''
            },
            $setOnInsert: { school: schoolId, session: sessionId, passage: passage._id, student: session.student, kind: 'passage' }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    passage.status = 'queued';
    passage.emailDeliveryId = delivery._id;
    passage.editedBy = userId;
    await passage.save();

    const activatedDelivery = await SpellingEmailDelivery.findOneAndUpdate(
        { _id: delivery._id, status: 'staging' },
        { $set: { status: 'pending', nextAttemptAt: new Date() } },
        { new: true }
    );
    if (activatedDelivery) return activatedDelivery;

    const currentDelivery = await SpellingEmailDelivery.findById(delivery._id).lean();
    if (currentDelivery?.status === 'pending') return currentDelivery;
    throw conflict('Unable to queue the passage email. The passage can still be edited or cancelled.');
}

export async function cancelSpellingPassageDelivery({ schoolId, sessionId, userId }) {
    const queuedPassage = await SpellingPassage.findOne({ school: schoolId, session: sessionId, status: 'queued' }).lean();
    if (!queuedPassage?.emailDeliveryId) throw notFound('Queued spelling passage not found');

    const delivery = await SpellingEmailDelivery.findOneAndUpdate(
        {
            _id: queuedPassage.emailDeliveryId,
            school: schoolId,
            session: sessionId,
            kind: 'passage',
            status: { $in: ['staging', 'pending'] }
        },
        { $set: { status: 'cancelled', lastError: 'Cancelled by teacher' } },
        { new: true }
    );

    if (!delivery) {
        const existingDelivery = await SpellingEmailDelivery.findById(queuedPassage.emailDeliveryId).lean();
        if (existingDelivery?.status === 'processing') throw conflict('The passage is already being sent and can no longer be cancelled');
        if (existingDelivery?.status === 'sent') throw conflict('The passage has already been sent and cannot be cancelled');
        throw notFound('Pending passage delivery not found');
    }

    const passage = await SpellingPassage.findOneAndUpdate(
        { _id: queuedPassage._id, school: schoolId, session: sessionId, status: 'queued', emailDeliveryId: delivery._id },
        { $set: { status: 'approved', emailDeliveryId: null, editedBy: userId } },
        { new: true }
    );
    if (!passage) throw notFound('Queued spelling passage not found');
    return passage;
}
