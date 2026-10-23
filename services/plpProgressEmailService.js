import { buildFamilySafeProgressUpdate } from './plpPrivacyService.js';
import {
    EMAIL_COLORS,
    emailDetailRows,
    emailSectionTitle,
    escapeHtml,
    isRtl,
    renderSchoolEmailShell,
} from '../helpers/schoolEmailShell.js';

const EMAIL_FIELDS = [
    { email: 'parentInfo.fatherEmail', name: 'parentInfo.fatherName', type: 'father' },
    { email: 'parentInfo.motherEmail', name: 'parentInfo.motherName', type: 'mother' },
    { email: 'parentInfo.guardianEmail', name: 'parentInfo.guardianName', type: 'guardian' },
    { email: 'studentEmail', type: 'student' },
    { email: 'email', type: 'student' },
    { email: 'user.email', type: 'student' },
];

export const PLP_EMAIL_LANGUAGES = ['en', 'ar', 'both'];

const getValue = (object, path) => path.split('.').reduce((value, key) => value?.[key], object);

const DATE_LOCALES = { en: 'en-GB', ar: 'ar-EG-u-nu-latn' };

// Stored statuses are staff vocabulary. A parent should read what the plan needs
// from them, not an enum value.
const STATUS_LABELS = {
    en: {
        goal: {
            active: 'Still being worked on',
            completed: 'Completed',
            carried_forward: 'Carried on to the next plan',
            archived: 'No longer part of the plan',
        },
        task: {
            assigned: 'Assigned',
            in_progress: 'Being worked on',
            submitted_by_student: 'Waiting for the teacher to review',
            reviewed: 'Reviewed by the teacher',
            completed: 'Completed',
            needs_revision: 'Needs another attempt',
        },
        goalType: {
            character: 'Character',
            academic: 'Academic',
        },
        reviewOutcome: {
            continue: 'Still on track',
            revise: 'Adjusted with the teacher',
            complete: 'Finished',
        },
    },
    ar: {
        goal: {
            active: 'لا يزال قيد العمل',
            completed: 'مكتمل',
            carried_forward: 'انتقل إلى الخطة التالية',
            archived: 'لم يعد ضمن الخطة',
        },
        task: {
            assigned: 'مسندة',
            in_progress: 'قيد العمل',
            submitted_by_student: 'بانتظار مراجعة المعلم',
            reviewed: 'راجعها المعلم',
            completed: 'مكتملة',
            needs_revision: 'تحتاج محاولة أخرى',
        },
        goalType: {
            character: 'سلوكي',
            academic: 'أكاديمي',
        },
        reviewOutcome: {
            continue: 'على مسارها',
            revise: 'عُدّلت مع المعلم',
            complete: 'انتهت',
        },
    },
};

const FAMILY_COPY = {
    en: {
        eyebrow: 'Personal Learning Plan',
        greeting: 'Dear family,',
        intro: ({ studentName, roundTitle, academicYear }) =>
            `Here is ${studentName}'s Personal Learning Plan update for ${roundTitle} (${academicYear}). `
            + 'It shows the goals the school is working on and anything still expected at home.',
        labels: {
            student: 'Student',
            round: 'Reporting period',
            year: 'Academic year',
            teacher: 'Teacher',
            goalStatus: 'Status',
            successCriteria: 'What success looks like',
            target: 'Target date',
            due: 'To be finished by',
            feedback: 'Teacher feedback',
            instructions: 'What to do',
            practice: 'Practice work',
        },
        goals: 'Goals in this plan',
        noGoals: 'No goals are recorded for this reporting period.',
        tasks: 'What is still expected',
        noTasks: 'Nothing is outstanding. Everything on the plan is finished.',
        lineSeparator: '; ',
        practiceSeparator: ' · ',
        practiceMore: (count) => `and ${count} more`,
        subject: ({ studentName, roundTitle }) => `${studentName}: PLP progress update — ${roundTitle}`,
        footer: ({ teacherName, schoolName, date }) => [
            `Shared by ${teacherName}${schoolName ? ` · ${schoolName}` : ''} · ${date}`,
            'Only the progress the school chose to share is included. '
            + 'Reply to this address or contact the school office with any questions.',
        ],
        teacherName: "your child's teacher",
    },
    ar: {
        eyebrow: 'خطة التعلم الشخصية',
        greeting: 'أسرة الطالب/الطالبة،',
        intro: ({ studentName, roundTitle, academicYear }) =>
            `هذا تحديث خطة التعلم الشخصية لـ${studentName} عن ${roundTitle} (${academicYear}). `
            + 'يوصل ما تعمل عليه المدرسة في أهداف الطالب وما هو مطلوب منه في المنزل.',
        labels: {
            student: 'الطالب',
            round: 'فترة المتابعة',
            year: 'العام الدراسي',
            teacher: 'المعلم',
            goalStatus: 'الحالة',
            successCriteria: 'مؤشر النجاح',
            target: 'التاريخ المستهدف',
            due: 'المطلوب إنجازه قبل',
            feedback: 'ملاحظة المعلم',
            instructions: 'المطلوب',
            practice: 'أنشطة التطبيق',
        },
        goals: 'أهداف الخطة',
        noGoals: 'لا توجد أهداف مسجلة لهذه الفترة.',
        tasks: 'المطلوب إنجازه بعد',
        noTasks: 'لا شيء متبقٍ. كل ما في الخطة مكتمل.',
        lineSeparator: '؛ ',
        practiceSeparator: ' · ',
        practiceMore: () => 'وغيرها',
        subject: ({ studentName, roundTitle }) =>
            `تحديث خطة التعلم الشخصية لـ${studentName} — ${roundTitle}`,
        footer: ({ teacherName, schoolName, date }) => [
            `أرسلها ${teacherName}${schoolName ? ` · ${schoolName}` : ''} · ${date}`,
            'يشمل هذا البريد ما اختارت المدرسة مشاركته فقط. '
            + 'لأي سؤال ردّ على هذا العنوان أو تواصل مع إدارة المدرسة.',
        ],
        teacherName: 'معلم/ة الطالب',
    },
};

const statusLabel = (language, group, value) => {
    const key = String(value || '');
    if (!key) return '';
    return STATUS_LABELS[language]?.[group]?.[key]
        ?? STATUS_LABELS.en[group]?.[key]
        ?? key;
};

const formatEmailDate = (value, language) => {
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    try {
        return new Intl.DateTimeFormat(DATE_LOCALES[language] || 'en-GB', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            timeZone: 'UTC',
        }).format(date);
    } catch {
        return '';
    }
};

const monthName = (month, language) => {
    const number = Number(month);
    if (!Number.isInteger(number) || number < 1 || number > 12) return '';
    return new Intl.DateTimeFormat(DATE_LOCALES[language] || 'en-GB', {
        month: 'long',
        timeZone: 'UTC',
    }).format(new Date(Date.UTC(2026, number - 1, 1)));
};

const singleLine = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

const MAX_PRACTICE_LABELS_IN_EMAIL = 3;

const practiceLine = (links, copy) => {
    const labels = (Array.isArray(links) ? links : [])
        .map((link) => singleLine(link?.label, 180))
        .filter(Boolean);
    if (!labels.length) return '';
    const shown = labels.slice(0, MAX_PRACTICE_LABELS_IN_EMAIL).join(copy.practiceSeparator);
    const extra = labels.length > MAX_PRACTICE_LABELS_IN_EMAIL
        ? ` (${copy.practiceMore(labels.length - MAX_PRACTICE_LABELS_IN_EMAIL)})`
        : '';
    return `${copy.labels.practice}: ${shown}${extra}`;
};

const roundTitleFor = (update, language) => {
    const cycleTitle = singleLine(update.roundTitle, 120);
    if (cycleTitle) return cycleTitle;
    const month = monthName(update.month, language);
    if (!month) return `Month ${update.month}`;
    return language === 'ar' ? `شهر ${month}` : month;
};

/**
 * A stacked title/details list. Tables because mail clients ignore flex and grid,
 * and each item keeps its own line breaks instead of collapsing into a paragraph.
 */
const progressList = (items) => {
    if (!items.length) return '';
    const rows = items.map((item, index) => {
        const edge = index < items.length - 1 ? `border-bottom:1px solid ${EMAIL_COLORS.line};` : '';
        const details = item.lines
            .filter((line) => String(line || '').trim())
            .map((line, detailIndex) => `<p style="margin:${detailIndex ? 4 : 0} 0 0;font-size:13px;`
                + `line-height:1.65;color:${EMAIL_COLORS.muted};">${escapeHtml(line)}</p>`)
            .join('');
        return `<tr><td style="${edge}padding:${index ? '14px 0 12px' : '0 0 12px'};">`
            + `<p style="margin:0 0 4px;font-size:15px;line-height:1.5;font-weight:600;color:${EMAIL_COLORS.ink};">`
            + `${escapeHtml(item.title)}</p>${details}</td></tr>`;
    }).join('');
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" `
        + `style="margin:0 0 20px;border-collapse:collapse;">${rows}</table>`;
};

const paragraph = (text) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.75;color:${EMAIL_COLORS.body};">`
    + `${escapeHtml(text)}</p>`;

const buildProgressSection = (language, { update, teacherName, schoolName, sentAt }) => {
    const copy = FAMILY_COPY[language];
    const studentName = singleLine(update.studentName, 120) || (language === 'ar' ? 'الطالب' : 'the student');
    const roundTitle = roundTitleFor(update, language);
    const academicYear = singleLine(update.academicYear, 40);
    const teacher = singleLine(teacherName, 120) || copy.teacherName;
    const date = formatEmailDate(sentAt, language);

    const goals = update.goals.map((goal) => {
        const type = statusLabel(language, 'goalType', goal.goalType);
        const status = statusLabel(language, 'goal', goal.status);
        return {
            title: [type, singleLine(goal.title, 200)].filter(Boolean).join(' — '),
            lines: [
                status && `${copy.labels.goalStatus}: ${status}`,
                goal.successCriteria && `${copy.labels.successCriteria}: ${singleLine(goal.successCriteria, 240)}`,
                goal.targetDate && `${copy.labels.target}: ${formatEmailDate(goal.targetDate, language)}`,
                practiceLine(goal.linkedPractice, copy),
            ].filter(Boolean),
        };
    });

    const tasks = update.nextTasks.map((task) => {
        const status = statusLabel(language, 'task', task.status);
        return {
            title: singleLine(task.title, 200),
            lines: [
                status && `${status}`,
                task.dueDate && `${copy.labels.due}: ${formatEmailDate(task.dueDate, language)}`,
                task.instructions && `${copy.labels.instructions}: ${singleLine(task.instructions, 240)}`,
                task.teacherFeedback && `${copy.labels.feedback}: ${singleLine(task.teacherFeedback, 240)}`,
            ].filter(Boolean),
        };
    });

    const summaryRows = [
        { label: copy.labels.student, value: studentName },
        { label: copy.labels.round, value: roundTitle },
        { label: copy.labels.year, value: academicYear },
        { label: copy.labels.teacher, value: teacher },
    ];

    const listLine = (item) => `- ${item.title}${item.lines.length
        ? ` (${item.lines.join(copy.lineSeparator)})`
        : ''}`;

    const text = [
        copy.greeting,
        '',
        copy.intro({ studentName, roundTitle, academicYear }),
        '',
        `${copy.labels.student}: ${studentName}`,
        `${copy.labels.round}: ${roundTitle}`,
        `${copy.labels.teacher}: ${teacher}`,
        '',
        copy.goals,
        ...(goals.length
            ? goals.map(listLine)
            : [copy.noGoals]),
        '',
        copy.tasks,
        ...(tasks.length
            ? tasks.map(listLine)
            : [copy.noTasks]),
        '',
        ...copy.footer({ teacherName: teacher, schoolName, date }),
    ].join('\n');

    const body = [
        paragraph(copy.intro({ studentName, roundTitle, academicYear })),
        emailDetailRows(summaryRows),
        emailSectionTitle(copy.goals),
        goals.length ? progressList(goals) : paragraph(copy.noGoals),
        emailSectionTitle(copy.tasks),
        tasks.length ? progressList(tasks) : paragraph(copy.noTasks),
    ].join('\n');

    return {
        subject: copy.subject({ studentName, roundTitle }),
        eyebrow: copy.eyebrow,
        footer: copy.footer({ teacherName: teacher, schoolName, date }),
        bodyHtml: `<div dir="${isRtl(language) ? 'rtl' : 'ltr'}" style="text-align:${isRtl(language) ? 'right' : 'left'};">${body}</div>`,
        text,
    };
};

export const normalizePlpEmailLanguage = (language) => {
    const value = String(language || '').trim().toLowerCase();
    return PLP_EMAIL_LANGUAGES.includes(value) ? value : 'en';
};

export const buildPlpEmailRecipientCandidates = (student, consents = []) => {
    const consentByEmail = new Map(
        consents.map((consent) => [String(consent.recipientEmail).trim().toLowerCase(), consent])
    );
    const candidates = new Map();
    for (const { email: emailField, name: nameField, type } of EMAIL_FIELDS) {
        const email = String(getValue(student, emailField) || '').trim().toLowerCase();
        if (!email) continue;
        const consent = consentByEmail.get(email);
        if (consent && !consent.optedIn && consent.revokedAt) continue;
        if (!candidates.has(email)) candidates.set(email, {
            email,
            type,
            name: type === 'student'
                ? `${student.firstName || ''} ${student.lastName || ''}`.trim()
                : String(getValue(student, nameField) || type).trim(),
            optedIn: Boolean(consent?.optedIn),
        });
    }
    return Array.from(candidates.values());
};

const EMAIL_ADDRESS_PATTERN = /<?[\w.+-]+@[\w-]+\.[\w.-]+>?/g;

/**
 * SMTP and provider errors quote the recipient back, and the delivery ledger is a
 * staff-readable record, so addresses never reach it.
 */
export const describeEmailDeliveryError = (error) => {
    const message = String(error?.message || error || '')
        .replace(EMAIL_ADDRESS_PATTERN, '[recipient]')
        .replace(/\s+/g, ' ')
        .trim();
    return (message || 'Email delivery failed').slice(0, 500);
};

export const getPlpEmailDeliveryAttempt = (previous, { resend = false, now = Date.now() } = {}) => {
    if (previous?.status === 'sent' && !resend) {
        return { blocked: true, reason: 'duplicate_blocked', attempt: previous.attempt };
    }
    if (previous?.status === 'sending' && now - new Date(previous.startedAt).getTime() < 10 * 60 * 1000) {
        return { blocked: true, reason: 'sending', attempt: previous.attempt };
    }
    return { blocked: false, reason: '', attempt: (previous?.attempt || 0) + 1 };
};

/**
 * language is 'en', 'ar' or 'both'. "both" is one email with the English section
 * first and the Arabic section below it, each carrying its own direction, so a
 * bilingual household gets one message rather than two deliveries.
 */
export const buildPlpProgressEmail = ({
    student,
    record,
    goals,
    tasks,
    language = 'en',
    school = null,
    teacher = null,
    sentAt = new Date(),
} = {}) => {
    const chosen = normalizePlpEmailLanguage(language);
    const update = buildFamilySafeProgressUpdate({ student, record, goals, tasks });
    const schoolName = singleLine(school?.name, 120);
    const teacherName = singleLine(
        teacher?.fullName || `${teacher?.firstName || ''} ${teacher?.lastName || ''}`.trim(),
        120
    );
    const sections = (chosen === 'both' ? ['en', 'ar'] : [chosen])
        .map((code) => buildProgressSection(code, { update, teacherName, schoolName, sentAt }));

    if (sections.length === 1) {
        const [section] = sections;
        return {
            language: chosen,
            subject: section.subject,
            text: section.text,
            html: renderSchoolEmailShell({
                language: chosen,
                school,
                subject: section.subject,
                eyebrow: section.eyebrow,
                bodyHtml: section.bodyHtml,
                footer: section.footer,
            }),
        };
    }

    const [english, arabic] = sections;
    const subject = `${english.subject} / ${arabic.subject}`;
    // The Arabic sign-off belongs inside the right-to-left block; the footer band
    // itself is laid out left-to-right.
    const arabicSignoff = arabic.footer
        .map((line, index) => `<p style="margin:${index ? '0' : '18px 0 6px'};font-size:12px;line-height:1.6;`
            + `color:${index ? EMAIL_COLORS.faint : EMAIL_COLORS.muted};">${escapeHtml(line)}</p>`)
        .join('\n');
    return {
        language: chosen,
        subject,
        text: `${english.text}\n\n————————\n\n${arabic.text}`,
        html: renderSchoolEmailShell({
            language: 'en',
            school,
            subject,
            eyebrow: english.eyebrow,
            bodyHtml: [
                english.bodyHtml,
                `<div dir="rtl" lang="ar" style="margin-top:26px;padding-top:20px;`
                + `border-top:2px solid ${EMAIL_COLORS.line};text-align:right;">`
                + `${arabic.bodyHtml}${arabicSignoff}</div>`,
            ].join('\n'),
            footer: english.footer,
        }),
    };
};
