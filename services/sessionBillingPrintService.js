import mongoose from 'mongoose';
import School from '../models/School.js';
import Student from '../models/Student.js';
import Class from '../models/Class.js';
import SessionBillingEntry from '../models/SessionBillingEntry.js';
import { escapeHtml } from '../helpers/schoolEmailShell.js';
import {
    getBillingSettings,
    getStudentStatement,
    resolveBillingDateRange
} from './sessionBillingService.js';
import { getBillingReport } from './sessionBillingReportService.js';

const notFound = (message) => Object.assign(new Error(message), { statusCode: 404 });

const LOCALES = { en: 'en-GB', ar: 'ar-EG-u-nu-latn' };

const COPY = {
    en: {
        statement: 'Lesson account statement',
        receipt: 'Payment receipt',
        issued: 'Issued',
        period: 'Period',
        student: 'Student',
        class: 'Class',
        balance: 'Current balance',
        charged: 'Charged',
        paid: 'Paid',
        minutes: 'Billable minutes',
        remaining: 'Minutes remaining',
        date: 'Date',
        description: 'Description',
        time: 'Time',
        rate: 'Rate',
        amount: 'Amount',
        running: 'Balance',
        empty: 'No lesson time or payments were recorded in this period.',
        paidLabel: 'Payment',
        lesson: 'Lesson',
        refund: 'Refund',
        adjustment: 'Adjustment',
        voided: 'Voided',
        amountReceived: 'Amount received',
        method: 'Payment method',
        reference: 'Reference',
        howToPay: 'How to pay',
        footer: 'This statement is generated from the school lesson account ledger. Contact the school office if anything looks incorrect.',
        settled: 'Settled',
        owed: 'owed',
        credit: 'credit'
    },
    ar: {
        statement: 'كشف حساب الدروس',
        receipt: 'إيصال دفع',
        issued: 'تاريخ الإصدار',
        period: 'الفترة',
        student: 'الطالب',
        class: 'الصف',
        balance: 'الرصيد الحالي',
        charged: 'المستحق',
        paid: 'المدفوع',
        minutes: 'الدقائق المحتسبة',
        remaining: 'الدقائق المتبقية',
        date: 'التاريخ',
        description: 'البيان',
        time: 'الوقت',
        rate: 'السعر',
        amount: 'المبلغ',
        running: 'الرصيد',
        empty: 'لم يُسجَّل أي وقت دروس أو مدفوعات في هذه الفترة.',
        paidLabel: 'دفعة',
        lesson: 'درس',
        refund: 'استرداد',
        adjustment: 'تسوية',
        voided: 'ملغى',
        amountReceived: 'المبلغ المستلم',
        method: 'طريقة الدفع',
        reference: 'المرجع',
        howToPay: 'كيفية الدفع',
        footer: 'صدر هذا الكشف من سجل حساب الدروس في المدرسة. تواصل مع إدارة المدرسة إذا كان هناك أي خطأ.',
        settled: 'مسدد',
        owed: 'مستحق',
        credit: 'دائن'
    }
};

const formatMoney = (value, currency) => {
    const amount = Math.abs(Number(value) || 0);
    const grouped = amount.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${grouped} ${String(currency || 'USD').toUpperCase()}`;
};

const formatDate = (value, language) => {
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) return '—';
    try {
        return new Intl.DateTimeFormat(LOCALES[language] || 'en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            timeZone: 'UTC'
        }).format(date);
    } catch {
        return date.toISOString().slice(0, 10);
    }
};

const methodLabel = (method, language) => {
    const labels = language === 'ar'
        ? { cash: 'نقدًا', 'bank-transfer': 'تحويل بنكي', cheque: 'شيك', online: 'عبر الإنترنت', other: 'أخرى' }
        : { cash: 'Cash', 'bank-transfer': 'Bank transfer', cheque: 'Cheque', online: 'Online', other: 'Other' };
    return labels[method] || method || '';
};

const schoolAddress = (school) => [
    school?.address?.street,
    school?.address?.city,
    school?.address?.state,
    school?.address?.zipCode,
    school?.address?.country
].filter(Boolean).join(', ');

const pageStyles = (accent) => `
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #eef2f7; color: #0f172a; }
    body { font-family: 'Segoe UI', Roboto, Tahoma, Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .sheet { width: 210mm; min-height: 297mm; margin: 18px auto; background: #fff; padding: 16mm 15mm; box-shadow: 0 18px 50px rgba(15,23,42,.16); }
    .letterhead { display: flex; justify-content: space-between; gap: 20px; border-bottom: 3px solid ${accent}; padding-bottom: 14px; }
    .brand { display: flex; gap: 14px; align-items: flex-start; }
    .logo { width: 60px; height: 60px; object-fit: contain; border-radius: 12px; background: #f8fafc; padding: 6px; }
    .school-name { margin: 0; font-size: 20px; letter-spacing: -.2px; }
    .school-meta { margin: 4px 0 0; font-size: 11px; line-height: 1.6; color: #64748b; }
    .doc-kind { text-align: right; }
    .doc-kind h2 { margin: 0; font-size: 15px; color: ${accent}; text-transform: uppercase; letter-spacing: 1.4px; }
    .doc-kind p { margin: 4px 0 0; font-size: 11px; color: #64748b; }
    .facts { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin: 18px 0 8px; }
    .fact { border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 12px; background: #f8fafc; }
    .fact span { display: block; font-size: 9px; letter-spacing: .8px; text-transform: uppercase; color: #64748b; }
    .fact strong { display: block; margin-top: 4px; font-size: 13px; }
    .totals { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin: 14px 0 18px; }
    .total { padding: 10px 12px; border-radius: 10px; border: 1px solid #e2e8f0; }
    .total span { display: block; font-size: 9px; letter-spacing: .8px; text-transform: uppercase; color: #64748b; }
    .total strong { display: block; margin-top: 4px; font-size: 14px; }
    .total.balance { border-color: ${accent}; background: color-mix(in srgb, ${accent} 7%, #fff); }
    table.ledger { width: 100%; border-collapse: collapse; font-size: 10.5px; }
    table.ledger th { text-align: left; padding: 8px 8px; background: #0f172a; color: #fff; font-size: 9px; text-transform: uppercase; letter-spacing: .6px; }
    table.ledger td { padding: 8px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
    table.ledger tr.void td { color: #94a3b8; text-decoration: line-through; }
    table.ledger td.num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .empty { padding: 24px; text-align: center; color: #64748b; border: 1px dashed #cbd5e1; border-radius: 10px; }
    .note { margin-top: 18px; padding: 12px 14px; border-left: 3px solid ${accent}; background: #f8fafc; font-size: 11px; line-height: 1.7; color: #334155; }
    .note h3 { margin: 0 0 6px; font-size: 10px; text-transform: uppercase; letter-spacing: .8px; color: #64748b; }
    .footer { margin-top: 22px; border-top: 1px solid #e2e8f0; padding-top: 10px; font-size: 9px; line-height: 1.6; color: #94a3b8; }
    .receipt-band { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin: 18px 0; padding: 16px 18px; border-radius: 12px; background: #0f172a; color: #fff; }
    .receipt-band span { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; }
    .receipt-band strong { display: block; font-size: 24px; margin-top: 4px; }
    .receipt-band .ref { text-align: right; font-size: 11px; color: #cbd5e1; }
    @media print {
        html, body { background: #fff; }
        .sheet { width: auto; min-height: 0; margin: 0; padding: 10mm 12mm; box-shadow: none; }
        @page { size: A4; margin: 8mm; }
    }
`;

const detailFact = (label, value) => `<div class="fact"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;

const documentShell = ({ language, school, title, body, accent }) => {
    const rtl = language === 'ar';
    const logo = /^https:\/\/\S+$/i.test(String(school?.branding?.logoUrl || '')) ? school.branding.logoUrl : '';
    return `<!doctype html>
<html dir="${rtl ? 'rtl' : 'ltr'}" lang="${language}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${pageStyles(accent)}</style>
</head>
<body>
<div class="sheet" dir="${rtl ? 'rtl' : 'ltr'}">
    <header class="letterhead">
        <div class="brand">
            ${logo ? `<img class="logo" src="${escapeHtml(logo)}" alt="">` : ''}
            <div>
                <h1 class="school-name">${escapeHtml(school?.name || '')}</h1>
                <p class="school-meta">${escapeHtml([schoolAddress(school), school?.phone, school?.adminEmail].filter(Boolean).join(' · '))}</p>
            </div>
        </div>
        <div class="doc-kind">
            <h2>${escapeHtml(title)}</h2>
            <p>${escapeHtml(school?.name || '')}</p>
        </div>
    </header>
    ${body}
    <footer class="footer">${escapeHtml(COPY[language].footer)}</footer>
</div>
</body>
</html>`;
};

const balanceText = (balance, currency, language, copy) => {
    if (balance < 0) return `${formatMoney(-balance, currency)} ${copy.owed}`;
    if (balance > 0) return `${formatMoney(balance, currency)} ${copy.credit}`;
    return copy.settled;
};

export const renderStatementDocument = async (schoolId, studentId, query = {}) => {
    if (!mongoose.isValidObjectId(String(studentId || ''))) throw notFound('Student not found.');
    const student = await Student.findOne({ _id: studentId, school: schoolId })
        .select('firstName lastName currentClass')
        .lean();
    if (!student) throw notFound('Student not found.');

    const range = resolveBillingDateRange(query);
    const [statement, settings, school] = await Promise.all([
        getStudentStatement(schoolId, student._id),
        getBillingSettings(schoolId),
        School.findById(schoolId).select('name branding address phone adminEmail').lean()
    ]);
    const language = String(query.language || '').toLowerCase() === 'ar' ? 'ar' : 'en';
    const copy = COPY[language];
    const accent = /^#[0-9a-fA-F]{3,6}$/.test(String(school?.branding?.primaryColor || ''))
        ? school.branding.primaryColor
        : '#0f766e';
    const currency = statement.currency || settings.currency;
    const klass = student.currentClass
        ? await Class.findOne({ _id: student.currentClass, school: schoolId }).select('name').lean()
        : null;
    const studentName = `${student.firstName || ''} ${student.lastName || ''}`.trim();
    const rows = (statement.entries || []).filter((entry) => {
        const at = new Date(entry.occurredAt).getTime();
        return Number.isFinite(at) && at >= range.start.getTime() && at <= range.end.getTime();
    });

    let charged = 0;
    let paid = 0;
    for (const entry of rows) {
        if (entry.status === 'void') continue;
        if (entry.kind === 'payment') paid += Number(entry.amount) || 0;
        else if (entry.kind === 'charge') charged += Number(entry.amount) || 0;
        else if (entry.kind === 'refund') paid -= Number(entry.amount) || 0;
    }

    const kindLabel = (entry) => {
        if (entry.status === 'void') return copy.voided;
        if (entry.kind === 'payment') return copy.paidLabel;
        if (entry.kind === 'refund') return copy.refund;
        if (entry.kind === 'adjustment') return copy.adjustment;
        return entry.sessionTitle || copy.lesson;
    };

    const body = `
    <section class="facts">
        ${detailFact(copy.student, studentName)}
        ${detailFact(copy.class, klass?.name || '—')}
        ${detailFact(copy.issued, formatDate(new Date(), language))}
        ${detailFact(copy.period, `${formatDate(range.start, language)} — ${formatDate(range.end, language)}`)}
    </section>
    <section class="totals">
        <div class="total"><span>${escapeHtml(copy.charged)}</span><strong>${escapeHtml(formatMoney(charged, currency))}</strong></div>
        <div class="total"><span>${escapeHtml(copy.paid)}</span><strong>${escapeHtml(formatMoney(paid, currency))}</strong></div>
        <div class="total"><span>${escapeHtml(copy.remaining)}</span><strong>${escapeHtml(String(Math.max(0, Math.floor(statement.totals?.minutesRemaining || 0))))}</strong></div>
        <div class="total balance"><span>${escapeHtml(copy.balance)}</span><strong>${escapeHtml(balanceText(statement.totals?.balance || 0, currency, language, copy))}</strong></div>
    </section>
    ${rows.length
        ? `<table class="ledger">
            <thead>
                <tr>
                    <th>${escapeHtml(copy.date)}</th>
                    <th>${escapeHtml(copy.description)}</th>
                    <th class="num">${escapeHtml(copy.time)}</th>
                    <th class="num">${escapeHtml(copy.rate)}</th>
                    <th class="num">${escapeHtml(copy.amount)}</th>
                    <th class="num">${escapeHtml(copy.running)}</th>
                </tr>
            </thead>
            <tbody>
                ${rows.map((entry) => {
                    const signed = entry.kind === 'payment' || (entry.kind === 'adjustment' && entry.direction === 'credit')
                        ? `+ ${formatMoney(entry.amount, currency)}`
                        : entry.kind === 'refund' || (entry.kind === 'adjustment' && entry.direction === 'debit')
                            ? `− ${formatMoney(entry.amount, currency)}`
                            : entry.kind === 'charge'
                                ? `− ${formatMoney(entry.amount, currency)}`
                                : formatMoney(entry.amount, currency);
                    return `<tr class="${entry.status === 'void' ? 'void' : ''}">
                        <td>${escapeHtml(formatDate(entry.occurredAt, language))}</td>
                        <td>${escapeHtml(kindLabel(entry))}${entry.reference ? ` · ${escapeHtml(entry.reference)}` : ''}</td>
                        <td class="num">${entry.minutes ? escapeHtml(`${Math.round(entry.minutes)} min`) : '—'}</td>
                        <td class="num">${entry.hourlyRate ? escapeHtml(formatMoney(entry.hourlyRate, currency)) : '—'}</td>
                        <td class="num">${escapeHtml(signed)}</td>
                        <td class="num">${escapeHtml(formatMoney(entry.balanceAfter, currency))}</td>
                    </tr>`;
                }).join('')}
            </tbody>
        </table>`
        : `<div class="empty">${escapeHtml(copy.empty)}</div>`}
    ${settings.statement?.paymentInstructions
        ? `<div class="note"><h3>${escapeHtml(copy.howToPay)}</h3>${escapeHtml(settings.statement.paymentInstructions)}</div>`
        : ''}`;

    return documentShell({
        language,
        school,
        title: copy.statement,
        body,
        accent
    });
};

export const renderReceiptDocument = async (schoolId, entryId, query = {}) => {
    if (!mongoose.isValidObjectId(String(entryId || ''))) throw notFound('Payment not found.');
    const entry = await SessionBillingEntry.findOne({
        _id: entryId,
        school: schoolId,
        kind: 'payment',
        status: 'active'
    }).lean();
    if (!entry) throw notFound('Payment not found.');

    const [statement, school, settings] = await Promise.all([
        getStudentStatement(schoolId, entry.student),
        School.findById(schoolId).select('name branding address phone adminEmail').lean(),
        getBillingSettings(schoolId)
    ]);
    const student = await Student.findOne({ _id: entry.student, school: schoolId })
        .select('firstName lastName currentClass')
        .lean();
    if (!student) throw notFound('Student not found.');

    const language = String(query.language || '').toLowerCase() === 'ar' ? 'ar' : 'en';
    const copy = COPY[language];
    const accent = /^#[0-9a-fA-F]{3,6}$/.test(String(school?.branding?.primaryColor || ''))
        ? school.branding.primaryColor
        : '#0f766e';
    const currency = entry.currency || settings.currency;
    const studentName = `${student.firstName || ''} ${student.lastName || ''}`.trim();
    const balance = statement.totals?.balance || 0;

    const body = `
    <section class="facts">
        ${detailFact(copy.student, studentName)}
        ${detailFact(copy.date, formatDate(entry.occurredAt, language))}
        ${detailFact(copy.method, methodLabel(entry.method, language))}
        ${detailFact(copy.reference, entry.reference || '—')}
    </section>
    <section class="receipt-band">
        <div>
            <span>${escapeHtml(copy.amountReceived)}</span>
            <strong>${escapeHtml(formatMoney(entry.amount, currency))}</strong>
        </div>
        <div class="ref">
            <div>${escapeHtml(copy.balance)}</div>
            <div>${escapeHtml(balanceText(balance, currency, language, copy))}</div>
        </div>
    </section>
    ${settings.statement?.paymentInstructions
        ? `<div class="note"><h3>${escapeHtml(copy.howToPay)}</h3>${escapeHtml(settings.statement.paymentInstructions)}</div>`
        : ''}`;

    return documentShell({
        language,
        school,
        title: copy.receipt,
        body,
        accent
    });
};

const reportValue = (value, column, currency) => {
    if (value === null || value === undefined || value === '') return '—';
    if (column.type === 'money') return formatMoney(value, currency);
    if (column.type === 'number') return String(Math.round((Number(value) || 0) * 100) / 100);
    if (column.type === 'date') return formatDate(value, 'en');
    return String(value);
};

export const renderReportDocument = async (schoolId, query = {}) => {
    const [report, school] = await Promise.all([
        getBillingReport(schoolId, query),
        School.findById(schoolId).select('name branding address phone adminEmail').lean()
    ]);
    const accent = /^#[0-9a-fA-F]{3,6}$/.test(String(school?.branding?.primaryColor || ''))
        ? school.branding.primaryColor
        : '#0f766e';
    const currency = report.currency || 'USD';
    const totals = Object.entries(report.totals || {})
        .filter(([key, value]) => key !== 'currency' && typeof value === 'number');
    const periodLabel = `${formatDate(report.range.from, 'en')} — ${formatDate(report.range.to, 'en')}`;

    const body = `
    <section class="facts">
        ${detailFact('Report', report.title)}
        ${detailFact('Period', periodLabel)}
        ${detailFact('Generated', formatDate(report.generatedAt, 'en'))}
        ${detailFact('Rows', String(report.rows.length))}
    </section>
    ${report.description ? `<p class="school-meta" style="margin:0 0 12px;font-size:11px;">${escapeHtml(report.description)}</p>` : ''}
    ${report.rows.length
        ? `<table class="ledger">
            <thead>
                <tr>
                    ${report.columns.map((column) => `<th class="${column.type === 'money' || column.type === 'number' ? 'num' : ''}">${escapeHtml(column.label)}</th>`).join('')}
                </tr>
            </thead>
            <tbody>
                ${report.rows.map((row) => `<tr>
                    ${report.columns.map((column) => `<td class="${column.type === 'money' || column.type === 'number' ? 'num' : ''}">${escapeHtml(reportValue(row[column.key], column, currency))}</td>`).join('')}
                </tr>`).join('')}
            </tbody>
        </table>`
        : `<div class="empty">${escapeHtml('No records match this report for the selected period.')}</div>`}
    ${totals.length ? `<section class="totals" style="margin-top:16px;">
        ${totals.map(([key, value]) => `<div class="total">
            <span>${escapeHtml(key.replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase()))}</span>
            <strong>${escapeHtml(key.toLowerCase().includes('minute') ? String(Math.round(value)) : formatMoney(value, currency))}</strong>
        </div>`).join('')}
    </section>` : ''}`;

    return documentShell({
        language: 'en',
        school,
        title: report.title,
        body,
        accent
    });
};
