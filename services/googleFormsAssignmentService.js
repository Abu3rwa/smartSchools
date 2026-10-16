import { google } from 'googleapis';
import GoogleFormSubmission from '../models/GoogleFormSubmission.js';
import Grade from '../models/Grade.js';
import Student from '../models/Student.js';
import googleFormsOAuthService from './googleFormsOAuthService.js';
import { isGoogleFormsEnabledForSchool } from '../config/googleFormsConfig.js';

const toId = (value) => (value == null ? '' : String(value));
const QUESTION_TYPES = new Set(['multiple_choice', 'true_false', 'short_answer']);

export const validateGoogleFormQuestions = (rawQuestions) => {
    if (!Array.isArray(rawQuestions) || rawQuestions.length < 1 || rawQuestions.length > 100) {
        throw new Error('A Google Form quiz must contain between 1 and 100 questions.');
    }
    return rawQuestions.map((question, index) => {
        const type = String(question?.type || '').trim().toLowerCase();
        const title = String(question?.title || '').trim();
        const points = Number(question?.points);
        if (!QUESTION_TYPES.has(type) || !title || title.length > 1000) {
            throw new Error(`Question ${index + 1} must have a supported type and a prompt of at most 1000 characters.`);
        }
        if (!Number.isFinite(points) || points < 0 || points > 1000) {
            throw new Error(`Question ${index + 1} has an invalid point value.`);
        }
        if (type === 'short_answer') {
            return { type, title, points: 0 };
        }
        if (!Number.isInteger(points) || points < 1) {
            throw new Error(`Question ${index + 1} must be worth at least 1 point.`);
        }
        const options = type === 'true_false'
            ? ['True', 'False']
            : [...new Set((Array.isArray(question.options) ? question.options : [])
                .map((value) => String(value || '').trim())
                .filter(Boolean))];
        if (options.length < 2 || options.length > 20 || options.some((value) => value.length > 500)) {
            throw new Error(`Question ${index + 1} must have 2 to 20 answer options (500 characters maximum each).`);
        }
        const correctAnswer = String(question.correctAnswer || '').trim();
        if (!options.includes(correctAnswer)) {
            throw new Error(`Question ${index + 1} must identify one of its answer options as correct.`);
        }
        return { type, title, points, options, correctAnswer };
    });
};

const questionItemFor = (question) => ({
    title: question.title,
    questionItem: {
        question: {
            required: true,
            ...(question.type === 'short_answer'
                ? { textQuestion: { paragraph: false } }
                : {
                    choiceQuestion: {
                        type: 'RADIO',
                        options: question.options.map((value) => ({ value })),
                        shuffle: false
                    }
                })
        }
    }
});

const formQuestions = (form) => (form.items || [])
    .filter((item) => item.questionItem?.question?.questionId)
    .map((item) => ({
        itemId: item.itemId,
        questionId: item.questionItem.question.questionId,
        title: item.title || ''
    }));

export const createGoogleQuiz = async ({ assignment, actorId, schoolId, questions }) => {
    if (!isGoogleFormsEnabledForSchool(schoolId)) {
        const error = new Error('Google Forms is not enabled for this school.');
        error.code = 'NOT_AVAILABLE';
        throw error;
    }
    const normalizedQuestions = validateGoogleFormQuestions(questions);
    const objectivePoints = normalizedQuestions
        .filter((question) => question.type !== 'short_answer')
        .reduce((sum, question) => sum + question.points, 0);
    if (objectivePoints < 1) {
        const error = new Error('Add at least one multiple-choice or true/false question to score this quiz.');
        error.code = 'INVALID_QUIZ';
        throw error;
    }
    const { auth, user } = await googleFormsOAuthService.getAuthorizedClient(actorId);
    const formsApi = google.forms({ version: 'v1', auth });
    const { data: created } = await formsApi.forms.create({
        requestBody: { info: { title: assignment.title, documentTitle: assignment.title } }
    });
    if (!created.formId) throw new Error('Google Forms did not return a form ID.');

    await formsApi.forms.batchUpdate({
        formId: created.formId,
        requestBody: {
            requests: [
                {
                    updateSettings: {
                        settings: {
                            quizSettings: { isQuiz: true },
                            emailCollectionType: 'VERIFIED'
                        },
                        updateMask: 'quizSettings.isQuiz,emailCollectionType'
                    }
                },
                ...normalizedQuestions.map((question, index) => ({
                    createItem: {
                        item: questionItemFor(question),
                        location: { index }
                    }
                }))
            ]
        }
    });

    const questionMetadata = await formsApi.forms.get({ formId: created.formId });
    const questionIds = formQuestions(questionMetadata.data);
    if (questionIds.length !== normalizedQuestions.length || questionIds.some((item) => !item.itemId)) {
        throw new Error('Google Forms did not create all quiz questions correctly.');
    }
    const correctAnswerRequests = [];
    questionIds.forEach((item, index) => {
        const question = normalizedQuestions[index];
        if (question.type === 'short_answer') return;
        correctAnswerRequests.push({
            updateItem: {
                item: {
                    itemId: item.itemId,
                    questionItem: {
                        question: {
                            questionId: item.questionId,
                            grading: {
                                pointValue: question.points,
                                correctAnswers: { answers: [{ value: question.correctAnswer }] }
                            }
                        }
                    }
                },
                location: { index },
                updateMask: 'questionItem.question.grading'
            }
        });
    });
    if (correctAnswerRequests.length) {
        await formsApi.forms.batchUpdate({
            formId: created.formId,
            requestBody: { requests: correctAnswerRequests }
        });
    }
    const responderUri = created.responderUri || `https://docs.google.com/forms/d/${created.formId}/viewform`;
    let responderUrl;
    try {
        responderUrl = new URL(responderUri);
    } catch {
        throw new Error('Google Forms returned an invalid responder URL.');
    }
    if (responderUrl.protocol !== 'https:' || responderUrl.hostname !== 'docs.google.com'
        || !responderUrl.pathname.startsWith('/forms/')) {
        throw new Error('Google Forms returned an unsafe responder URL.');
    }
    return {
        formId: created.formId,
        responderUri: responderUrl.href,
        ownerUserId: toId(user._id),
        questions: questionIds.map((item, index) => ({
            questionId: item.questionId,
            itemId: item.itemId,
            title: item.title,
            type: normalizedQuestions[index].type,
            points: normalizedQuestions[index].points
        })),
        objectivePoints
    };
};

const responseAnswers = (response, questions) => Object.entries(response.answers || {}).map(([questionId, answer]) => ({
    questionId,
    question: questions.find((item) => item.questionId === questionId)?.title || '',
    values: (answer.textAnswers?.answers || []).map((item) => String(item.value || '').slice(0, 5000))
}));

export const syncGoogleQuizResponses = async ({ assignment, actorId, schoolId }) => {
    if (!isGoogleFormsEnabledForSchool(schoolId) || !assignment.metadata?.googleForm?.formId) {
        const error = new Error('This assignment has no active Google Form.');
        error.code = 'FORM_NOT_FOUND';
        throw error;
    }
    const formOwnerId = assignment.metadata.googleForm.ownerUserId || actorId;
    const { auth } = await googleFormsOAuthService.getAuthorizedClient(formOwnerId);
    const formsApi = google.forms({ version: 'v1', auth });
    const { data: form } = await formsApi.forms.get({ formId: assignment.metadata.googleForm.formId });
    if (form.settings?.emailCollectionType !== 'VERIFIED') {
        const error = new Error('This Google Form must collect verified respondent emails before responses can be matched to students.');
        error.code = 'EMAIL_VERIFICATION_REQUIRED';
        throw error;
    }
    const questions = assignment.metadata.googleForm.questions || [];
    const students = await Student.find({
        school: schoolId,
        academicYear: assignment.academicYear,
        currentClass: assignment.class,
        status: 'active',
        ...(assignment.scope === 'selected_students' ? { _id: { $in: assignment.studentIds } } : {})
    }).populate('user', 'email').select('_id user email studentEmail firstName lastName');
    const studentsByEmail = new Map();
    for (const student of students) {
        const studentEmails = [
            student.user?.email,
            student.studentEmail,
            student.email
        ].map((email) => String(email || '').trim().toLowerCase()).filter(Boolean);
        for (const email of new Set(studentEmails)) {
            const mappedStudent = studentsByEmail.get(email);
            if (mappedStudent && toId(mappedStudent._id) !== toId(student._id)) {
                studentsByEmail.set(email, null);
            } else if (!studentsByEmail.has(email)) {
                studentsByEmail.set(email, student);
            }
        }
    }

    let nextPageToken;
    let imported = 0;
    let unmatched = 0;
    let updatedGrades = 0;
    do {
        const { data } = await formsApi.forms.responses.list({
            formId: assignment.metadata.googleForm.formId,
            pageSize: 5000,
            pageToken: nextPageToken
        });
        for (const response of data.responses || []) {
            const email = String(response.respondentEmail || '').trim().toLowerCase();
            const student = email ? studentsByEmail.get(email) : null;
            if (!student) {
                unmatched += 1;
                continue;
            }
            const submittedAt = new Date(response.lastSubmittedTime || response.createTime || Date.now());
            const previous = await GoogleFormSubmission.findOne({
                school: schoolId,
                assignment: assignment._id,
                student: student._id
            }).select('submittedAt').lean();
            if (previous?.submittedAt && previous.submittedAt > submittedAt) continue;
            const score = Number.isFinite(Number(response.totalScore)) ? Number(response.totalScore) : null;
            await GoogleFormSubmission.findOneAndUpdate(
                { school: schoolId, assignment: assignment._id, student: student._id },
                {
                    $set: {
                        googleResponseId: response.responseId,
                        studentEmail: email,
                        status: assignment.dueDate && submittedAt > assignment.dueDate ? 'late' : 'submitted',
                        submittedAt,
                        score,
                        possibleScore: assignment.metadata.googleForm.objectivePoints || null,
                        answers: responseAnswers(response, questions)
                    }
                },
                { upsert: true, new: true, runValidators: true }
            );
            imported += 1;

            const hasShortAnswer = questions.some((question) => question.type === 'short_answer');
            const possibleScore = Number(assignment.metadata.googleForm.objectivePoints || 0);
            if (score !== null && possibleScore > 0 && !hasShortAnswer) {
                const marks = Math.min(Number(assignment.maxMarks), Math.max(0, (score / possibleScore) * Number(assignment.maxMarks)));
                const month = submittedAt.getUTCMonth() + 1;
                await Grade.findOneAndUpdate(
                    { school: schoolId, assignment: assignment._id, student: student._id },
                    {
                        $set: {
                            marks,
                            maxMarks: Number(assignment.maxMarks),
                            date: submittedAt,
                            month,
                            semester: month >= 8 ? 1 : 2,
                            title: assignment.title,
                            description: assignment.instructions || '',
                            category: 'quiz',
                            notes: 'Score synced from Google Forms',
                            remarks: '',
                            subject: assignment.subject,
                            class: assignment.class,
                            teacher: assignment.teacher,
                            academicYear: assignment.academicYear,
                            gradeType: 'quiz',
                            assignment: assignment._id,
                            gradingSource: 'google_forms',
                            lessonPlanIds: assignment.lessonPlanIds || []
                        },
                        $setOnInsert: { school: schoolId, student: student._id }
                    },
                    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
                );
                updatedGrades += 1;
            }
        }
        nextPageToken = data.nextPageToken;
    } while (nextPageToken);

    return { imported, unmatched, updatedGrades };
};

export const listGoogleQuizSubmissions = async ({ assignmentId, schoolId }) => {
    const rows = await GoogleFormSubmission.find({ assignment: assignmentId, school: schoolId })
        .populate('student', 'firstName lastName studentId')
        .sort({ submittedAt: -1 })
        .lean();
    return rows.map((row) => ({
        id: toId(row._id),
        student: {
            id: toId(row.student?._id),
            name: `${row.student?.firstName || ''} ${row.student?.lastName || ''}`.trim(),
            studentId: row.student?.studentId || ''
        },
        submittedAt: row.submittedAt,
        status: row.status,
        score: row.score,
        possibleScore: row.possibleScore,
        answers: row.answers
    }));
};
