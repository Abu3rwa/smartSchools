import mongoose from 'mongoose';
import SessionBillingEntry from '../models/SessionBillingEntry.js';
import aiService from './aiservice.js';
import {
    getBillingOverview,
    getBillingForecast,
    getReminderCandidates
} from './sessionBillingReportService.js';
import {
    getBillingSettings,
    listIssues,
    listPackagePurchases
} from './sessionBillingService.js';
import {
    CONTENT_RULES,
    PRIVACY_RULES,
    correctivePrompt,
    createStudentRefs,
    fillStudentTokens,
    inspectGeneratedText,
    stripFlaggedFormulas
} from './aiPromptSafety.js';

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;
const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);

const moneyLabel = (value, currency) => `${round2(value).toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
})} ${currency || 'USD'}`;

const duplicatePayments = async (schoolId, range) => {
    const rows = await SessionBillingEntry.aggregate([
        {
            $match: {
                school: new mongoose.Types.ObjectId(String(schoolId)),
                kind: 'payment',
                status: 'active',
                occurredAt: { $gte: range.from, $lte: range.to }
            }
        },
        {
            $group: {
                _id: {
                    student: '$student',
                    amount: '$amount',
                    day: { $dateToString: { format: '%Y-%m-%d', date: '$occurredAt' } }
                },
                count: { $sum: 1 },
                entries: { $push: '$_id' },
                reference: { $first: '$reference' }
            }
        },
        { $match: { count: { $gt: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 }
    ]);
    if (!rows.length) return [];
    const Student = (await import('../models/Student.js')).default;
    const students = await Student.find({
        school: schoolId,
        _id: { $in: rows.map((row) => row._id.student) }
    }).select('firstName lastName').lean();
    const nameById = new Map(students.map((student) => [
        String(student._id),
        `${student.firstName || ''} ${student.lastName || ''}`.trim()
    ]));
    return rows.map((row) => ({
        studentId: String(row._id.student),
        student: nameById.get(String(row._id.student)) || '',
        amount: round2(row._id.amount),
        day: row._id.day,
        count: row.count,
        reference: row.reference || '',
        entryIds: row.entries.map(String)
    }));
};

export const getBillingInsights = async (schoolId, query = {}) => {
    const [overview, forecast, reminders, settings, issues, purchases] = await Promise.all([
        getBillingOverview(schoolId, query),
        getBillingForecast(schoolId),
        getReminderCandidates(schoolId, query),
        getBillingSettings(schoolId),
        listIssues(schoolId, { status: 'open' }),
        listPackagePurchases(schoolId, { status: 'active' })
    ]);
    const openIssues = issues.issues || [];
    const activePurchases = purchases.purchases || [];
    const currency = settings.currency;
    const totals = overview.totals;
    const collectionRate = pct(totals.paid, totals.charged);
    const insights = [];

    if (totals.owed > 0) {
        const oldest = overview.students
            .filter((student) => student.balance < 0 && student.lastPaymentAt)
            .sort((a, b) => new Date(a.lastPaymentAt).getTime() - new Date(b.lastPaymentAt).getTime())[0];
        const oldestDays = oldest
            ? Math.floor((Date.now() - new Date(oldest.lastPaymentAt).getTime()) / 86400000)
            : null;
        insights.push({
            id: 'collections',
            tone: totals.owed > totals.charged * 0.5 && totals.charged > 0 ? 'critical' : 'warning',
            title: `${moneyLabel(totals.owed, currency)} is owed across ${overview.balanceStatus.owed.count} account${overview.balanceStatus.owed.count === 1 ? '' : 's'}`,
            detail: oldest
                ? `The longest-running balance is ${oldest.name}, with no payment for ${oldestDays} day${oldestDays === 1 ? '' : 's'}.`
                : 'No account with an outstanding balance has a recorded payment yet.',
            metric: `${collectionRate}% collected this period`,
            action: { tab: 'students', label: 'Open student accounts', filter: { status: 'owed' } }
        });
    } else if (totals.charged > 0) {
        insights.push({
            id: 'collections',
            tone: 'positive',
            title: 'Every account is settled',
            detail: 'No family currently owes money for lesson time in this period.',
            metric: `${moneyLabel(totals.paid, currency)} received`,
            action: { tab: 'students', label: 'View accounts' }
        });
    }

    if (openIssues.length) {
        const reasons = new Map();
        for (const issue of openIssues) reasons.set(issue.reason, (reasons.get(issue.reason) || 0) + 1);
        const top = [...reasons.entries()].sort((a, b) => b[1] - a[1])[0];
        insights.push({
            id: 'unbilled',
            tone: top && top[1] >= 3 ? 'critical' : 'warning',
            title: `${openIssues.length} lesson${openIssues.length === 1 ? ' is' : 's are'} waiting to be billed`,
            detail: top
                ? `Most common reason: ${top[0].replace(/-/g, ' ')} (${top[1]}). Each one needs a staff decision before it can be charged.`
                : 'Open the unbilled queue to review these lessons.',
            metric: `${Math.round(totals.unbilledMinutes)} unbilled minutes`,
            action: { tab: 'lessons', label: 'Open unbilled queue' }
        });
    }

    if (forecast.history.lessons > 0 && forecast.expectedCharges > 0) {
        const change = forecast.history.charged > 0
            ? Math.round(((forecast.expectedCharges - forecast.history.charged / 3) / (forecast.history.charged / 3 || 1)) * 1000) / 10
            : null;
        insights.push({
            id: 'forecast',
            tone: change !== null && change < -15 ? 'warning' : 'neutral',
            title: `Next 30 days: about ${moneyLabel(forecast.expectedCharges, currency)} in lesson charges`,
            detail: forecast.history.lessons < 30
                ? 'Based on limited history, so treat the range as a rough guide rather than a plan.'
                : 'Based on the last 90 days of billed lesson time.',
            metric: change === null ? 'No comparison yet' : `${change >= 0 ? '+' : ''}${change}% against the 30-day average`,
            action: { tab: 'reports', label: 'Open forecast report' }
        });
    }

    if (reminders.summary.eligible > 0) {
        insights.push({
            id: 'reminders',
            tone: 'neutral',
            title: `${reminders.summary.eligible} famil${reminders.summary.eligible === 1 ? 'y is' : 'ies are'} ready for a balance reminder`,
            detail: `${reminders.summary.owed} account${reminders.summary.owed === 1 ? '' : 's'} owe money; the rest are too new, recently reminded, or have no reachable contact.`,
            metric: `${moneyLabel(reminders.candidates.filter((row) => row.eligible).reduce((sum, row) => sum + row.owed, 0), currency)} eligible`,
            action: { tab: 'messages', label: 'Open messages' }
        });
    }

    const expiringMinutes = activePurchases
        .filter((purchase) => purchase.expiresAt && new Date(purchase.expiresAt).getTime() <= Date.now() + 30 * 86400000)
        .reduce((sum, purchase) => sum + (purchase.minutesRemaining || 0), 0);
    if (expiringMinutes > 0) {
        insights.push({
            id: 'package-expiry',
            tone: 'warning',
            title: `${Math.round(expiringMinutes)} prepaid minutes expire within 30 days`,
            detail: 'Unused package minutes are credit the school has already been paid for. Contact the family before they lapse.',
            metric: `${activePurchases.filter((purchase) => purchase.expiresAt && new Date(purchase.expiresAt).getTime() <= Date.now() + 30 * 86400000).length} package(s)`,
            action: { tab: 'students', label: 'Review packages' }
        });
    }

    if (settings.packagesEnabled && activePurchases.length && totals.credit > 0) {
        insights.push({
            id: 'credit-liability',
            tone: 'neutral',
            title: `${moneyLabel(totals.credit, currency)} of credit is held for families`,
            detail: 'This is money already received that the school still has to deliver as lesson time or refund.',
            metric: `${activePurchases.length} active package${activePurchases.length === 1 ? '' : 's'}`,
            action: { tab: 'reports', label: 'Open liability report' }
        });
    }

    const duplicates = await duplicatePayments(schoolId, {
        from: overview.range.from,
        to: overview.range.to
    });
    if (duplicates.length) {
        insights.push({
            id: 'duplicate-payments',
            tone: 'critical',
            title: 'Possible duplicate payments',
            detail: duplicates
                .map((row) => `${row.student}: ${row.count} payments of ${moneyLabel(row.amount, currency)} on ${row.day}`)
                .join(' · '),
            metric: `${duplicates.length} group${duplicates.length === 1 ? '' : 's'} to check`,
            action: { tab: 'payments', label: 'Check payments' }
        });
    }

    const analysis = {
        generatedAt: new Date(),
        currency,
        range: overview.range,
        collectionRate,
        totals,
        duplicates,
        forecasts: forecast,
        eligibleReminders: reminders.summary.eligible,
        openIssues: openIssues.length,
        insights
    };

    return analysis;
};

const fallbackNarrative = (analysis) => {
    const top = analysis.insights[0];
    if (!top) {
        return {
            summary: 'No lesson billing activity has been recorded for this period yet. Once lessons end or manual time is logged, the account picture and priorities will appear here.',
            priorities: []
        };
    }
    return {
        summary: `${top.title}. ${top.detail}`,
        priorities: analysis.insights.slice(0, 3).map((insight) => ({
            title: insight.title,
            why: insight.detail,
            action: insight.action?.label || ''
        }))
    };
};

export const generateBillingNarrative = async (schoolId, query = {}) => {
    const analysis = await getBillingInsights(schoolId, query);
    const fallback = fallbackNarrative(analysis);
    if (analysis.insights.length === 0) {
        return { ...fallback, source: 'rules', analysis };
    }

    const refs = createStudentRefs(analysis.duplicates, {
        keyOf: (row) => row.studentId,
        labelOf: (row) => row.student
    });

    const facts = {
        period: analysis.range,
        currency: analysis.currency,
        totals: analysis.totals,
        collectionRate: analysis.collectionRate,
        openIssues: analysis.openIssues,
        eligibleReminders: analysis.eligibleReminders,
        duplicateGroups: analysis.duplicates.map((row) => ({
            student: refs.refFor(row.studentId) || 'a student',
            count: row.count,
            amount: row.amount,
            day: row.day
        })),
        signals: analysis.insights.map((insight) => ({
            title: insight.title,
            detail: refs.scrubText(insight.detail),
            metric: insight.metric
        }))
    };

    try {
        const { parsed } = await aiService.generateStructuredJson({
            modelName: process.env.SESSION_BILLING_AI_MODEL || process.env.OPENAI_MODEL || undefined,
            prompt: `You are writing a short internal finance briefing for a school's lesson-billing administrator.

Use ONLY the facts in the JSON below. Do not invent money amounts, names, dates, causes, or actions that are not present. Do not give legal, tax, or accounting advice. Do not claim that anything has been sent, charged, refunded, or fixed. The administrator will decide and act.
Students appear only as short labels (S1, S2 …); refer to them exactly by those labels and never invent a name.

Return one JSON object with:
- "summary": 2 to 3 plain sentences describing the current billing position and the single most important thing to look at.
- "priorities": an array of at most 3 objects, each with "title" (short), "why" (one sentence tied to a fact), and "action" (a short next step for staff).

${PRIVACY_RULES}

Facts:
${JSON.stringify(facts)}`
        });
        const summary = refs.restore(String(parsed?.summary || '').trim().slice(0, 700));
        const priorities = Array.isArray(parsed?.priorities)
            ? parsed.priorities.slice(0, 3).map((row) => ({
                title: refs.restore(String(row?.title || '').trim().slice(0, 140)),
                why: refs.restore(String(row?.why || '').trim().slice(0, 300)),
                action: String(row?.action || '').trim().slice(0, 160)
            })).filter((row) => row.title && row.why)
            : [];
        if (!summary) throw new Error('Empty analysis');
        return { summary, priorities, source: 'ai', analysis };
    } catch {
        return { ...fallback, source: 'rules', analysis };
    }
};

export const generateMessageDraft = async (schoolId, studentId, query = {}) => {
    const preview = await getReminderCandidates(schoolId, { studentId });
    const candidate = preview.candidates.find((row) => row.studentId === String(studentId));
    if (!candidate) {
        const error = new Error('This student does not have an outstanding balance to remind the family about.');
        error.statusCode = 400;
        throw error;
    }
    const language = String(query.language || '').toLowerCase() === 'ar' ? 'ar' : 'en';
    const tone = ['friendly', 'firm', 'neutral'].includes(String(query.tone)) ? String(query.tone) : 'friendly';
    const currency = preview.currency;
    const fallback = language === 'ar'
        ? `نود تذكيركم بأن حساب دروس ${candidate.name} يُظهر مبلغًا مستحقًا قدره ${moneyLabel(candidate.owed, currency)}. يسعدنا مساعدتكم في ترتيب الدفع.`
        : `We wanted to gently remind you that ${candidate.name}'s lesson account currently shows ${moneyLabel(candidate.owed, currency)} due. We are happy to help arrange payment.`;

    try {
        const prompt = `Write one short opening sentence for a school lesson-account payment reminder.

Facts: the account belongs to the student {{student}}, outstanding amount ${moneyLabel(candidate.owed, currency)}, ${candidate.daysSinceActivity ?? 'unknown'} days since the last account activity.
Language: ${language === 'ar' ? 'Arabic' : 'English'}.
Tone: ${tone}.

${CONTENT_RULES}

Rules: plain, respectful, no threats, no legal language, no promises of discounts, no invented payment methods, no shame, no religious phrasing, mention nobody but the account holder, one sentence only, under 40 words. Where the student's name belongs write {{student}} exactly and never invent a name.

Return one JSON object: { "opening": "..." }`;

        const write = async (currentPrompt) => {
            const { parsed } = await aiService.generateStructuredJson({
                modelName: process.env.SESSION_BILLING_AI_MODEL || process.env.OPENAI_MODEL || undefined,
                prompt: currentPrompt
            });
            return String(parsed?.opening || '').trim().slice(0, 400);
        };

        let opening = await write(prompt);
        if (!opening) throw new Error('Empty draft');

        const inspection = inspectGeneratedText(opening, { allowToken: true });
        if (!inspection.ok) {
            opening = await write(correctivePrompt(prompt, inspection.problems));
            if (!opening) throw new Error('Empty draft');
            if (!inspectGeneratedText(opening, { allowToken: true }).ok) {
                opening = stripFlaggedFormulas(opening);
            }
        }

        return {
            opening: fillStudentTokens(opening, candidate.name),
            source: 'ai',
            language,
            tone
        };
    } catch {
        return { opening: fallback, source: 'rules', language, tone };
    }
};
