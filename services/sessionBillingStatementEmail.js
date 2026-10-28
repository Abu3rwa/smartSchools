import {
    EMAIL_COLORS,
    emailDetailRows,
    emailSectionTitle,
    escapeHtml,
    isRtl,
    renderSchoolEmailShell
} from '../helpers/schoolEmailShell.js';

export const SESSION_BILLING_EMAIL_LANGUAGES = ['en', 'ar', 'both'];

const DATE_LOCALES = { en: 'en-GB', ar: 'ar-EG-u-nu-latn' };

const METHOD_LABELS = {
    en: {
        cash: 'cash',
        'bank-transfer': 'bank transfer',
        cheque: 'cheque',
        online: 'online',
        other: 'other'
    },
    ar: {
        cash: 'نقدًا',
        'bank-transfer': 'تحويل بنكي',
        cheque: 'شيك',
        online: 'عبر الإنترنت',
        other: 'أخرى'
    }
};

const COPY = {
    en: {
        eyebrow: 'Lesson account',
        eyebrowReminder: 'Payment reminder',
        eyebrowReceipt: 'Payment receipt',
        greeting: 'Dear family,',
        intro: ({ studentName }) => `Here is the latest statement for ${studentName}'s lesson account.`,
        reminderIntro: ({ studentName }) => `Our lesson account record for ${studentName} still shows a balance due.`,
        receiptIntro: ({ studentName }) => `Thank you — we have recorded your payment for ${studentName}'s lesson account.`,
        labels: {
            student: 'Student',
            statementDate: 'Statement date',
            receiptDate: 'Payment date',
            balance: 'Balance',
            amountReceived: 'Amount received',
            method: 'Payment method',
            reference: 'Reference',
            charged: 'Charged this period',
            paid: 'Paid this period',
            recent: 'Recent activity',
            paymentInstructions: 'How to pay',
            empty: 'No lesson time or payments have been recorded yet.'
        },
        balanceValue: ({ balance, money }) => {
            if (balance < 0) return `${money(-balance)} owed`;
            if (balance > 0) return `${money(balance)} credit`;
            return 'Settled';
        },
        owed: ({ money }) => `Current balance due: ${money}.`,
        credit: ({ money }) => `Current credit on the account: ${money}.`,
        settled: 'The lesson account is settled.',
        payment: 'Payment',
        lesson: 'Lesson',
        minutes: (value) => `${value} min`,
        voided: 'Voided',
        subject: ({ studentName }) => `${studentName}: lesson account statement`,
        reminderSubject: ({ studentName }) => `${studentName}: lesson account balance due`,
        receiptSubject: ({ studentName }) => `${studentName}: lesson payment receipt`,
        footer: ({ schoolName, date }) => [
            [schoolName, date].filter(Boolean).join(' · '),
            'This statement lists the lesson time and payments the school has recorded. '
            + 'Contact the school office if anything looks wrong.'
        ].filter(Boolean)
    },
    ar: {
        eyebrow: 'حساب الدروس',
        eyebrowReminder: 'تذكير بالدفع',
        eyebrowReceipt: 'إيصال دفع',
        greeting: 'أسرة الطالب/الطالبة،',
        intro: ({ studentName }) => `هذا أحدث كشف حساب لوقت الدروس والمدفوعات الخاص بـ${studentName}.`,
        reminderIntro: ({ studentName }) => `لا يزال حساب دروس ${studentName} يُظهر مبلغًا مستحقًا.`,
        receiptIntro: ({ studentName }) => `شكرًا لكم — تم تسجيل دفعتكم لحساب دروس ${studentName}.`,
        labels: {
            student: 'الطالب',
            statementDate: 'تاريخ الكشف',
            receiptDate: 'تاريخ الدفع',
            balance: 'الرصيد',
            amountReceived: 'المبلغ المستلم',
            method: 'طريقة الدفع',
            reference: 'المرجع',
            charged: 'المستحق عن هذه الفترة',
            paid: 'المدفوع عن هذه الفترة',
            recent: 'آخر الحركات',
            paymentInstructions: 'كيفية الدفع',
            empty: 'لم يُسجَّل أي وقت دروس أو مدفوعات بعد.'
        },
        balanceValue: ({ balance, money }) => {
            if (balance < 0) return `${money(-balance)} مستحق`;
            if (balance > 0) return `${money(balance)} دائن`;
            return 'مسدد';
        },
        owed: ({ money }) => `المبلغ المستحق حاليًا: ${money}.`,
        credit: ({ money }) => `الرصيد الدائن حاليًا: ${money}.`,
        settled: 'حساب الدروس مسدد بالكامل.',
        payment: 'دفعة',
        lesson: 'درس',
        minutes: (value) => `${value} دقيقة`,
        voided: 'ملغى',
        subject: ({ studentName }) => `كشف حساب دروس ${studentName}`,
        reminderSubject: ({ studentName }) => `تذكير برصيد مستحق لدروس ${studentName}`,
        receiptSubject: ({ studentName }) => `إيصال دفع لدروس ${studentName}`,
        footer: ({ schoolName, date }) => [
            [schoolName, date].filter(Boolean).join(' · '),
            'يوضّح هذا الكشف وقت الدروس والمدفوعات المسجلة في المدرسة. '
            + 'تواصل مع إدارة المدرسة إذا كان هناك أي خطأ.'
        ].filter(Boolean)
    }
};

const MAX_ACTIVITY_ITEMS = 6;

const singleLine = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

const formatMoney = (value, currency) => {
    const amount = Math.abs(Number(value) || 0);
    const grouped = amount.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${grouped} ${String(currency || 'USD').toUpperCase()}`;
};

const formatDate = (value, language) => {
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    try {
        return new Intl.DateTimeFormat(DATE_LOCALES[language] || 'en-GB', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            timeZone: 'UTC'
        }).format(date);
    } catch {
        return '';
    }
};

export const normalizeSessionBillingEmailLanguage = (language) => {
    const value = String(language || '').trim().toLowerCase();
    return SESSION_BILLING_EMAIL_LANGUAGES.includes(value) ? value : 'en';
};

const entryDetail = (entry, language) => {
    const copy = COPY[language];
    if (entry.kind === 'payment') {
        const method = METHOD_LABELS[language]?.[entry.method] || entry.method || '';
        return method ? `${copy.payment} (${method})` : copy.payment;
    }
    return singleLine(entry.sessionTitle, 160) || copy.lesson;
};

const periodTotals = (statement, period) => {
    const totals = { charged: 0, paid: 0 };
    if (!period) return totals;
    for (const entry of statement.entries || []) {
        if (entry.status === 'void') continue;
        const occurred = new Date(entry.occurredAt).getTime();
        if (!Number.isFinite(occurred) || occurred < period.from.getTime() || occurred > period.to.getTime()) continue;
        if (entry.kind === 'payment') totals.paid += Number(entry.amount) || 0;
        else totals.charged += Number(entry.amount) || 0;
    }
    return totals;
};

const activityItems = (statement, language) => {
    const copy = COPY[language];
    const currency = statement.currency || 'USD';
    return [...(statement.entries || [])]
        .reverse()
        .slice(0, MAX_ACTIVITY_ITEMS)
        .map((entry) => {
            const isPayment = entry.kind === 'payment';
            const amount = formatMoney(entry.amount, currency);
            const lines = [
                formatDate(entry.occurredAt, language),
                `${isPayment ? '+' : '−'} ${amount}`,
                !isPayment && entry.minutes ? copy.minutes(Math.round(entry.minutes)) : '',
                entry.status === 'void' ? copy.voided : ''
            ].filter(Boolean);
            return { title: entryDetail(entry, language), lines };
        });
};

const activityList = (items) => {
    if (!items.length) return '';
    const rows = items.map((item, index) => {
        const edge = index < items.length - 1 ? `border-bottom:1px solid ${EMAIL_COLORS.line};` : '';
        const details = item.lines
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

const buildSection = (language, {
    studentName,
    statement,
    period,
    schoolName,
    sentAt,
    purpose = 'statement',
    receipt = null,
    opening = '',
    paymentInstructions = ''
}) => {
    const copy = COPY[language];
    const currency = statement.currency || 'USD';
    const balance = Number(statement.totals?.balance) || 0;
    const money = (value) => formatMoney(value, currency);
    const totals = periodTotals(statement, period);
    const dateLabel = formatDate(receipt?.occurredAt || sentAt, language);
    const isReceipt = purpose === 'receipt';
    const isReminder = purpose === 'reminder';

    const balanceLine = balance < 0
        ? copy.owed({ money: money(-balance) })
        : balance > 0
            ? copy.credit({ money: money(balance) })
            : copy.settled;

    const intro = isReceipt
        ? copy.receiptIntro({ studentName })
        : isReminder
            ? copy.reminderIntro({ studentName })
            : copy.intro({ studentName });

    const summaryRows = isReceipt
        ? [
            { label: copy.labels.student, value: studentName },
            { label: copy.labels.receiptDate, value: dateLabel },
            {
                label: copy.labels.amountReceived,
                value: money(receipt?.amount || 0),
                color: EMAIL_COLORS.accent
            },
            { label: copy.labels.method, value: METHOD_LABELS[language]?.[receipt?.method] || receipt?.method || '' },
            { label: copy.labels.reference, value: receipt?.reference || '' },
            { label: copy.labels.balance, value: copy.balanceValue({ balance, money }) }
        ]
        : [
            { label: copy.labels.student, value: studentName },
            { label: copy.labels.statementDate, value: dateLabel },
            { label: copy.labels.balance, value: copy.balanceValue({ balance, money }) },
            ...(period ? [
                { label: copy.labels.charged, value: money(totals.charged) },
                { label: copy.labels.paid, value: money(totals.paid) }
            ] : [])
        ];

    const items = isReceipt ? [] : activityItems(statement, language);
    const textLines = items.map((item) => `- ${item.title} (${item.lines.join(' · ')})`);
    const extra = String(opening || '').trim().slice(0, 600);
    const instructions = String(paymentInstructions || '').trim().slice(0, 600);

    const text = [
        copy.greeting,
        '',
        intro,
        ...(extra ? ['', extra] : []),
        balanceLine,
        '',
        `${copy.labels.student}: ${studentName}`,
        `${copy.labels.statementDate}: ${dateLabel}`,
        `${copy.labels.balance}: ${copy.balanceValue({ balance, money })}`,
        ...(isReceipt ? [
            `${copy.labels.amountReceived}: ${money(receipt?.amount || 0)}`,
            `${copy.labels.method}: ${METHOD_LABELS[language]?.[receipt?.method] || receipt?.method || ''}`,
            ...(receipt?.reference ? [`${copy.labels.reference}: ${receipt.reference}`] : [])
        ] : period ? [
            `${copy.labels.charged}: ${money(totals.charged)}`,
            `${copy.labels.paid}: ${money(totals.paid)}`
        ] : []),
        ...(instructions ? ['', `${copy.labels.paymentInstructions}: ${instructions}`] : []),
        ...(isReceipt ? [] : [
            '',
            copy.labels.recent,
            ...(textLines.length ? textLines : [copy.labels.empty])
        ]),
        '',
        ...copy.footer({ schoolName, date: dateLabel })
    ].join('\n');

    const body = [
        paragraph(intro),
        extra ? paragraph(extra) : '',
        paragraph(balanceLine),
        emailDetailRows(summaryRows),
        instructions ? `${emailSectionTitle(copy.labels.paymentInstructions)}${paragraph(instructions)}` : '',
        ...(isReceipt ? [] : [
            emailSectionTitle(copy.labels.recent),
            items.length ? activityList(items) : paragraph(copy.labels.empty)
        ])
    ].filter(Boolean).join('\n');

    const subject = isReceipt
        ? copy.receiptSubject({ studentName })
        : isReminder
            ? copy.reminderSubject({ studentName })
            : copy.subject({ studentName });

    return {
        subject,
        eyebrow: isReceipt ? copy.eyebrowReceipt : isReminder ? copy.eyebrowReminder : copy.eyebrow,
        footer: copy.footer({ schoolName, date: dateLabel }),
        bodyHtml: `<div dir="${isRtl(language) ? 'rtl' : 'ltr'}" style="text-align:${isRtl(language) ? 'right' : 'left'};">${body}</div>`,
        text
    };
};

/**
 * language is 'en', 'ar' or 'both'. "both" is one email with the English section
 * first and the Arabic section below it, so a bilingual household gets one
 * message rather than two deliveries.
 */
export const buildSessionBillingStatementEmail = ({
    studentName,
    statement,
    period = null,
    language = 'en',
    school = null,
    sentAt = new Date(),
    purpose = 'statement',
    receipt = null,
    opening = '',
    paymentInstructions = '',
    subjectOverride = ''
} = {}) => {
    const chosen = normalizeSessionBillingEmailLanguage(language);
    const name = singleLine(studentName, 120) || (chosen === 'ar' ? 'الطالب' : 'the student');
    const schoolName = singleLine(school?.name, 120);
    const safeStatement = {
        currency: statement?.currency || 'USD',
        totals: statement?.totals || { balance: 0 },
        entries: statement?.entries || []
    };
    const sections = (chosen === 'both' ? ['en', 'ar'] : [chosen])
        .map((code) => buildSection(code, {
            studentName: name,
            statement: safeStatement,
            period,
            schoolName,
            sentAt,
            purpose,
            receipt,
            opening,
            paymentInstructions
        }));
    const override = String(subjectOverride || '').trim().slice(0, 160).replace(/\{student\}/gi, name);
    if (override) {
        for (const section of sections) section.subject = override;
    }

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
                footer: section.footer
            })
        };
    }

    const [english, arabic] = sections;
    const subject = `${english.subject} / ${arabic.subject}`;
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
                + `${arabic.bodyHtml}${arabicSignoff}</div>`
            ].join('\n'),
            footer: english.footer
        })
    };
};

export const filterStatementRecipients = (contacts = [], optedOutEmails = []) => {
    const blocked = new Set((optedOutEmails || []).map((email) => String(email || '').trim().toLowerCase()));
    const seen = new Set();
    const recipients = [];
    for (const contact of contacts) {
        const email = String(contact?.email || '').trim().toLowerCase();
        if (!email || blocked.has(email) || seen.has(email)) continue;
        seen.add(email);
        recipients.push({ email, type: contact.type || 'guardian', name: String(contact.name || '').trim() });
    }
    return recipients;
};

export const getStatementEmailAttempt = (previous, { resend = false, now = Date.now() } = {}) => {
    if (previous?.status === 'sending' && now - new Date(previous.startedAt).getTime() < 10 * 60 * 1000) {
        return { blocked: true, reason: 'sending', attempt: previous.attempt };
    }
    if (previous?.status === 'sent' && !resend) {
        return { blocked: true, reason: 'duplicate_blocked', attempt: previous.attempt };
    }
    return { blocked: false, reason: '', attempt: (previous?.attempt || 0) + 1 };
};
