import gmailOAuthService from './gmailOAuthService.js';
import { EmailReport } from '../models/EmailReport.js';
import { AITokenUsage } from '../models/AITokenUsage.js';
import { ReportDraft } from '../models/ReportDraft.js';
import Notification from '../models/Notification.js';
import School from '../models/School.js';
import xss from 'xss';
import {
    getLanguageLabel,
    isRtlLanguageCode,
    normalizeRequestedLanguages,
    toLegacyLanguageValue
} from '../utils/aiLanguageUtils.js';

/**
 * Sanitize email subject to plain ASCII (remove emojis and special characters)
 */
const sanitizeSubject = (subject) => {
    if (!subject) return 'Progress Report';
    return subject
        .replace(/[\u0000-\u001F\u007F]/g, '')
        .replace(/\p{Extended_Pictographic}/gu, '')
        .trim();
};

const normalizeAiHtml = (content, language, requestedLanguages = []) => {
    const normalizedRequestedLanguages = normalizeRequestedLanguages(
        requestedLanguages && requestedLanguages.length > 0 ? requestedLanguages : language,
        { max: 2, fallback: ['en'] }
    );
    const isRTL = normalizedRequestedLanguages.length === 1 && isRtlLanguageCode(normalizedRequestedLanguages[0]);
    const direction = isRTL ? 'rtl' : 'ltr';

    let html = (content || '').toString().trim();

    // Strip common LLM wrappers
    html = html.replace(/```[a-zA-Z]*\n?/g, '');
    html = html.replace(/```/g, '');

    // Convert simple markdown bold to HTML
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // Remove repeated symbol noise, but avoid breaking emails/urls by only targeting runs
    html = html.replace(/[@#$%^&*]{2,}/g, '');

    // Remove control characters (keep newlines)
    html = html.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');

    // Narrative-only: remove table blocks if model returns any
    html = html.replace(/<table[\s\S]*?<\/table>/gi, '');

    // If model returned plain text, wrap into paragraphs
    const hasTags = /<\s*\w+[\s>]/.test(html);
    if (!hasTags) {
        const safeText = html
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        html = `<p>${safeText.replace(/\n\n+/g, '</p><p>').replace(/\n/g, '<br/>')}</p>`;
    }

    // Ensure single outer wrapper with direction
    html = html.replace(/^<div[^>]*dir\s*=\s*"?(rtl|ltr)"?[^>]*>/i, '<div>');
    if (!/^<div[\s>]/i.test(html)) {
        html = `<div>${html}</div>`;
    }

    // Sanitize HTML to prevent XSS attacks
    const sanitizedHtml = xss(html, {
        whiteList: {
            div: ['dir'],
            p: [],
            strong: [],
            b: [],
            em: [],
            i: [],
            u: [],
            br: [],
            h1: [],
            h2: [],
            h3: [],
            h4: [],
            ul: [],
            ol: [],
            li: [],
            span: []
        }
    });

    return `<div dir="${direction}">${sanitizedHtml.replace(/^<div[\s>]/i, '').replace(/<\/div>\s*$/i, '')}</div>`;
};

const escapeHtml = (value) =>
    String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

// Only real, measured figures reach the email. A source that was not read
// simply does not appear — the email never fills a gap with a guess.
const KPI_DEFINITIONS = [
    { key: 'grades', metric: 'average', en: 'Overall Average', ar: 'المعدل العام' },
    { key: 'attendance', metric: 'attendanceRate', en: 'Attendance', ar: 'نسبة الحضور' },
    { key: 'homework', metric: 'completionRate', en: 'Homework Completed', ar: 'إنجاز الواجبات' },
    { key: 'standards', metric: 'overallPct', en: 'Standards Mastery', ar: 'إتقان المعايير' },
    { key: 'spelling', metric: 'accuracy', en: 'Spelling Accuracy', ar: 'دقة الإملاء' },
    { key: 'liveLessons', metric: 'participationRate', en: 'Live Lesson Participation', ar: 'مشاركة الدروس المباشرة' }
];

const buildKpiHighlights = (evidenceSnapshot, isArabic) => {
    const sources = evidenceSnapshot?.sources || {};
    return KPI_DEFINITIONS
        .map((definition) => {
            const value = sources[definition.key]?.metrics?.[definition.metric];
            if (typeof value !== 'number' || !Number.isFinite(value)) return null;
            return {
                key: definition.key,
                label: isArabic ? definition.ar : definition.en,
                value: `${Math.round(value)}%`
            };
        })
        .filter(Boolean)
        .slice(0, 3);
};

const formatDateRangeLabel = (range) => {
    if (!range?.startDate || !range?.endDate) return '';
    const format = (value) => {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        return date.toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });
    };
    const start = format(range.startDate);
    const end = format(range.endDate);
    return start && end ? `${start} \u2013 ${end}` : '';
};

// Email clients strip <style> and ignore most modern CSS, so the AI body is
// styled attribute-by-attribute on the tags the sanitizer already allows.
const inlineReportContentStyles = (html, direction) => {
    const align = direction === 'rtl' ? 'right' : 'left';
    const edge = direction === 'rtl' ? 'right' : 'left';
    const headingBase = `line-height:1.4;font-weight:700;color:#0f172a;text-align:${align};`;
    return String(html || '')
        .replace(/<h1>/g, `<h1 style="margin:26px 0 10px;font-size:20px;${headingBase}">`)
        .replace(/<h2>/g, `<h2 style="margin:26px 0 10px;padding-${edge}:12px;border-${edge}:4px solid #14b8a6;font-size:17px;${headingBase}">`)
        .replace(/<h3>/g, `<h3 style="margin:22px 0 8px;font-size:15.5px;${headingBase}">`)
        .replace(/<h4>/g, `<h4 style="margin:18px 0 8px;font-size:14.5px;${headingBase}">`)
        .replace(/<p>/g, '<p style="margin:0 0 12px;font-size:15px;line-height:1.75;color:#334155;">')
        .replace(/<ul>/g, `<ul style="margin:8px 0 16px;padding-${edge}:22px;">`)
        .replace(/<ol>/g, `<ol style="margin:8px 0 16px;padding-${edge}:22px;">`)
        .replace(/<li>/g, '<li style="margin:0 0 8px;font-size:14.5px;line-height:1.7;color:#334155;">');
};

const remarkToHtml = (remark) =>
    escapeHtml(remark).replace(/\n/g, '<br />');

// A 4xx from the provider is a definite rejection (nothing was delivered).
// Network errors and 5xx leave acceptance unconfirmed — those must never be
// auto-retried, because the message may already be in the family's inbox.
const isDefiniteProviderFailure = (error) => {
    const status = Number(error?.response?.status ?? error?.code);
    return Number.isFinite(status) && status >= 400 && status < 500;
};

const htmlToPlainText = (html) =>
    String(html || '')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<head[\s\S]*?<\/head>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<div style="display:none[\s\S]*?<\/div>/gi, '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|h[1-6]|li|tr|td)>/gi, '\n')
        .replace(/<li[^>]*>/gi, '- ')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/g, "'")
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

const ARABIC_MONTHS = {
    January: 'يناير',
    February: 'فبراير',
    March: 'مارس',
    April: 'أبريل',
    May: 'مايو',
    June: 'يونيو',
    July: 'يوليو',
    August: 'أغسطس',
    September: 'سبتمبر',
    October: 'أكتوبر',
    November: 'نوفمبر',
    December: 'ديسمبر'
};

const localizePeriod = (label, isArabic) =>
    isArabic
        ? String(label).replace(
            /\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/g,
            (month) => ARABIC_MONTHS[month] || month
        )
        : String(label);


const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const addRecipientToMap = (map, { email, type, name }) => {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) return;

    if (!map.has(normalizedEmail)) {
        map.set(normalizedEmail, {
            email: normalizedEmail,
            type,
            name: String(name || '').trim()
        });
        return;
    }

    const existing = map.get(normalizedEmail);
    if (!existing.name && name) {
        existing.name = String(name).trim();
    }
    if (existing.type === 'student' && type !== 'student') {
        existing.type = type;
    }
};

class EmailService {
    constructor() {
        // Gmail OAuth service handles authentication
        this.gmailService = gmailOAuthService;
    }

    async resolveSchoolName(schoolRef) {
        if (!schoolRef) return 'School';
        if (typeof schoolRef === 'object' && schoolRef.name) {
            return String(schoolRef.name).trim() || 'School';
        }
        try {
            const school = await School.findById(schoolRef).select('name').lean();
            return school?.name || 'School';
        } catch {
            return 'School';
        }
    }

    /**
     * Send a report email to each selected recipient as a separate message.
     *
     * Delivery truthfulness rules:
     * - A pending EmailReport row is written BEFORE the provider call, so a
     *   crash mid-send leaves an auditable trace instead of nothing.
     * - Provider acceptance and bookkeeping are separate steps: if the message
     *   was accepted but the 'sent' update fails, the outcome is 'unknown',
     *   never a retryable 'failed' (a retry could double-send to the family).
     * - A definite 4xx rejection is 'failed'; network/5xx uncertainty is 'unknown'.
     *
     * @param {Object} options
     * @param {String} options.reportId - ReportDraft ID
     * @param {Object} [options.frozen] - Approved snapshot {subject, html, text, recipients};
     *   when present it is delivered verbatim instead of re-rendering live data.
     * @returns {Promise<{success:boolean, sent:number, failed:number, unknown:number, results:Array}>}
     */
    async sendReportEmails(options) {
        const {
            reportId,
            studentData,
            reportContent,
            language,
            requestedLanguages = [],
            recipients,
            teacher,
            teacherRemark = '',
            period = '',
            dateRange = null,
            evidenceSnapshot = null,
            frozen = null
        } = options;

        const emailList = Array.isArray(frozen?.recipients) && frozen.recipients.length > 0
            ? frozen.recipients
                .filter((r) => normalizeEmail(r.email))
                .map((r) => ({ email: normalizeEmail(r.email), name: r.name || '', type: r.type || 'parents' }))
            : this.prepareRecipientList({ studentData, recipients, teacher });

        // A report goes to the family; a teacher-only send is not a delivery.
        const familyRecipients = emailList.filter((r) => r.type !== 'teacher');
        if (familyRecipients.length === 0) {
            return {
                success: false,
                message: 'No valid family email recipients found',
                sent: 0,
                failed: 0,
                unknown: 0,
                results: []
            };
        }

        const hasValidTokens = await this.gmailService.hasValidTokens(teacher._id);
        if (!hasValidTokens) {
            return {
                success: false,
                message: 'Gmail not connected. Please authenticate with Google first.',
                sent: 0,
                failed: 0,
                unknown: 0,
                results: []
            };
        }

        const schoolName = await this.resolveSchoolName(studentData?.school);

        let subject;
        let htmlContent;
        let textContent;
        let normalizedLanguage;
        let normalizedRequestedLanguages;
        if (frozen?.html) {
            subject = frozen.subject;
            htmlContent = frozen.html;
            textContent = frozen.text || htmlToPlainText(frozen.html);
            normalizedRequestedLanguages = normalizeRequestedLanguages(
                frozen.requestedLanguages?.length ? frozen.requestedLanguages : (frozen.language || language),
                { max: 2, fallback: ['en'] }
            );
            normalizedLanguage = frozen.language || toLegacyLanguageValue(normalizedRequestedLanguages);
        } else {
            const rendered = this.renderReportEmail({
                reportContent,
                language,
                requestedLanguages,
                studentData,
                schoolName,
                teacher,
                teacherRemark,
                period,
                dateRange,
                evidenceSnapshot
            });
            subject = rendered.subject;
            htmlContent = rendered.html;
            textContent = rendered.text;
            normalizedLanguage = rendered.language;
            normalizedRequestedLanguages = rendered.requestedLanguages;
        }

        const results = [];
        for (const recipient of emailList) {
            results.push(await this.deliverToRecipient({
                reportId,
                recipient,
                subject,
                htmlContent,
                textContent,
                language: normalizedLanguage,
                requestedLanguages: normalizedRequestedLanguages,
                teacherId: teacher._id
            }));
        }

        const sent = results.filter((r) => r.status === 'sent').length;
        const failed = results.filter((r) => r.status === 'failed').length;
        const unknown = results.filter((r) => r.status === 'unknown').length;
        const success = sent > 0 && failed === 0 && unknown === 0;

        // Notification history is best-effort and must never change the
        // delivery outcome.
        try {
            const notification = new Notification({
                school: studentData.school,
                recipientEmail: emailList.map((r) => r.email).join(','),
                student: studentData._id,
                type: 'ai_report',
                subject,
                message: textContent || (reportContent || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim(),
                htmlContent,
                channels: ['email'],
                status: success ? 'sent' : 'failed',
                metadata: {
                    reportId,
                    language: normalizedLanguage,
                    requestedLanguages: normalizedRequestedLanguages,
                    reportType: 'advanced_ai',
                    delivered: sent,
                    failed,
                    unknown
                },
                createdBy: teacher._id
            });
            await notification.save();
            if (success) {
                await notification.markAsSent('email');
            }
        } catch (logError) {
            console.error('Failed to log advanced report email to notifications:', logError);
        }

        return {
            success,
            message: success ? undefined : 'Delivery incomplete — see per-recipient results',
            sent,
            failed,
            unknown,
            results
        };
    }

    /**
     * Resolve recipients from the teacher's checkbox flags.
     * Flags are applied to each contact role BEFORE addresses are deduplicated:
     * a shared family address must still be delivered when any checked role
     * uses it, even if another role sharing that address was unchecked.
     */
    prepareRecipientList({ studentData, recipients, teacher }) {
        const studentName = `${studentData?.firstName || ''} ${studentData?.lastName || ''}`.trim() || 'Student';
        const parentInfo = studentData?.parentInfo || {};
        const rawContacts = [
            { email: parentInfo.motherEmail, type: 'mother', name: parentInfo.motherName || `Mother of ${studentData?.firstName || 'Student'}` },
            { email: parentInfo.fatherEmail, type: 'father', name: parentInfo.fatherName || `Father of ${studentData?.firstName || 'Student'}` },
            { email: parentInfo.guardianEmail, type: 'guardian', name: parentInfo.guardianName || `Guardian of ${studentData?.firstName || 'Student'}` },
            { email: studentData?.studentEmail, type: 'student', name: studentName },
            { email: studentData?.email, type: 'student', name: studentName },
            { email: studentData?.user?.email, type: 'student', name: studentName }
        ];
        if (recipients?.teacher && teacher?.email) {
            rawContacts.push({
                email: teacher.email,
                type: 'teacher',
                name: `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim()
            });
        }

        const recipientMap = new Map();
        for (const contact of rawContacts) {
            if (recipients && recipients[contact.type] === false) continue;
            addRecipientToMap(recipientMap, contact);
        }
        return Array.from(recipientMap.values());
    }

    /**
     * Deliver one message to one address with truthful outcome bookkeeping.
     */
    async deliverToRecipient({ reportId, recipient, subject, htmlContent, textContent, language, requestedLanguages, teacherId }) {
        const record = new EmailReport({
            reportId,
            sourceModel: 'ReportDraft',
            recipientType: recipient.type,
            email: recipient.email,
            subject,
            content: htmlContent,
            language,
            requestedLanguages,
            status: 'pending'
        });

        try {
            await record.save();
        } catch (saveError) {
            // No audit trail could be created; do not send blind.
            return { email: recipient.email, status: 'failed', error: 'Could not create delivery record; message was not sent.' };
        }

        let providerResult;
        try {
            providerResult = await this.gmailService.sendEmail(teacherId, {
                to: recipient.email,
                subject,
                html: htmlContent,
                text: textContent
            });
        } catch (error) {
            const definite = isDefiniteProviderFailure(error);
            const status = definite ? 'failed' : 'unknown';
            try {
                await EmailReport.findByIdAndUpdate(record._id, {
                    status,
                    error: error.message,
                    lastRetryAt: new Date()
                });
            } catch {
                // Row stays 'pending'; the outcome is still reported truthfully.
            }
            return { email: recipient.email, status, error: error.message };
        }

        // Provider accepted the message. From here on, nothing may be labeled
        // a retryable failure — at worst the outcome is unknown.
        try {
            await EmailReport.findByIdAndUpdate(record._id, {
                status: 'sent',
                messageId: providerResult.messageId,
                sentAt: new Date()
            });
        } catch (persistError) {
            try {
                await EmailReport.findByIdAndUpdate(record._id, {
                    status: 'unknown',
                    messageId: providerResult.messageId,
                    error: 'Provider accepted the message but delivery bookkeeping failed.'
                });
            } catch {
                // Row stays 'pending' with no messageId — still not 'failed'.
            }
            return {
                email: recipient.email,
                status: 'unknown',
                messageId: providerResult.messageId,
                error: 'Provider accepted the message but delivery bookkeeping failed.'
            };
        }

        return { email: recipient.email, status: 'sent', messageId: providerResult.messageId };
    }

    /**
     * Render the subject and body exactly as a real send would deliver them.
     * The teacher's preview and the delivery path both go through here so they
     * cannot drift apart.
     */
    renderReportEmail({
        reportContent,
        language,
        requestedLanguages = [],
        studentData,
        schoolName = 'School',
        teacher = null,
        teacherRemark = '',
        period = '',
        dateRange = null,
        evidenceSnapshot = null
    }) {
        const normalizedRequestedLanguages = normalizeRequestedLanguages(
            requestedLanguages && requestedLanguages.length > 0 ? requestedLanguages : language,
            { max: 2, fallback: ['en'] }
        );
        const normalizedLanguage = toLegacyLanguageValue(normalizedRequestedLanguages);

        const html = this.formatEmailContent(reportContent, normalizedLanguage, {
            schoolName,
            requestedLanguages: normalizedRequestedLanguages,
            studentData,
            teacher,
            teacherRemark,
            period,
            dateRange,
            evidenceSnapshot
        });

        return {
            subject: sanitizeSubject(
                this.getEmailSubject(studentData, normalizedLanguage, normalizedRequestedLanguages)
            ),
            html,
            text: htmlToPlainText(html),
            language: normalizedLanguage,
            requestedLanguages: normalizedRequestedLanguages
        };
    }

    /**
     * Get email subject based on language (plain ASCII text)
     */
    getEmailSubject(studentData, language, requestedLanguages = []) {
        const studentName = `${studentData.firstName} ${studentData.lastName}`;
        const normalizedRequestedLanguages = normalizeRequestedLanguages(
            requestedLanguages && requestedLanguages.length > 0 ? requestedLanguages : language,
            { max: 2, fallback: ['en'] }
        );

        if (normalizedRequestedLanguages.length === 1 && normalizedRequestedLanguages[0] === 'ar') {
            return `تقرير التقدم للطالب ${studentName}`;
        }

        if (normalizedRequestedLanguages.length === 2) {
            const labels = normalizedRequestedLanguages.map((code) => getLanguageLabel(code)).join(' + ');
            return `Progress Report (${labels}) - ${studentName}`;
        }

        const primaryLabel = getLanguageLabel(normalizedRequestedLanguages[0] || 'en');
        return `Progress Report (${primaryLabel}) for ${studentName}`;
    }

    /**
     * Format the full email document.
     *
     * Table-based layout with inline styles: Outlook drops <style> blocks and
     * ignores grid/flex, so every structural style lives on the element itself.
     * The <style> block only carries the mobile tweaks modern clients support.
     */
    formatEmailContent(content, language, {
        schoolName = 'School',
        requestedLanguages = [],
        studentData = null,
        teacher = null,
        teacherRemark = '',
        period = '',
        dateRange = null,
        evidenceSnapshot = null
    } = {}) {
        const normalizedRequestedLanguages = normalizeRequestedLanguages(
            requestedLanguages && requestedLanguages.length > 0 ? requestedLanguages : language,
            { max: 2, fallback: ['en'] }
        );
        const isRTL =
            normalizedRequestedLanguages.length === 1 &&
            isRtlLanguageCode(normalizedRequestedLanguages[0]);
        const direction = isRTL ? 'rtl' : 'ltr';
        // The wrapper follows the PRIMARY language. A bilingual en+ar report
        // must not get Arabic chrome around an English-first body.
        const isArabic = isRtlLanguageCode(normalizedRequestedLanguages[0] || 'en');
        const align = isRTL ? 'right' : 'left';
        const edge = isRTL ? 'right' : 'left';

        const normalizedContent = normalizeAiHtml(content, language, normalizedRequestedLanguages);
        const bodyHtml = inlineReportContentStyles(normalizedContent, direction);
        const highlights = buildKpiHighlights(evidenceSnapshot, isArabic);

        const rawStudentName = studentData
            ? `${studentData.firstName || ''} ${studentData.lastName || ''}`.trim()
            : '';
        const studentName = escapeHtml(rawStudentName);
        const studentClass = escapeHtml(studentData?.currentClass?.name || studentData?.currentClass || '');
        const teacherName = escapeHtml(
            teacher ? `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim() : ''
        );
        const teacherEmail = normalizeEmail(teacher?.email);
        const schoolLabel = escapeHtml(schoolName);
        const periodLabel = localizePeriod(
            String(period || '').trim() || formatDateRangeLabel(dateRange),
            isArabic
        );

        const titleLabel = isArabic ? 'تقرير تقدم الطالب' : 'Student Progress Report';
        const closingLine = isArabic
            ? 'شكرًا لدعمكم المستمر في المنزل. لا تترددوا في التواصل معنا إذا كانت لديكم أي أسئلة.'
            : 'Thank you for your continued support at home. Please feel free to reach out if you have any questions or would like to discuss this report further.';
        const privacyLabel = isArabic
            ? 'هذا التقرير سري ومخصص لولي الأمر فقط.'
            : 'This report is confidential and intended for the parent or guardian only.';
        const noteLabel = isArabic ? 'كلمة من المعلم' : 'A Note from the Teacher';
        const metaLabels = {
            student: isArabic ? 'الطالب' : 'Student',
            class: isArabic ? 'الصف' : 'Class',
            period: isArabic ? 'الفترة' : 'Reporting Period',
            teacher: isArabic ? 'أعدّه' : 'Prepared By'
        };
        const teacherRole = studentClass
            ? (isArabic ? `معلم ${studentClass}` : `${studentClass} Teacher`)
            : (isArabic ? 'المعلم' : 'Teacher');

        const remarkHtml = remarkToHtml(String(teacherRemark || '').trim());
        const preheader = [
            rawStudentName,
            periodLabel,
            isArabic ? 'تقرير التقدم' : 'Progress report'
        ].filter(Boolean).join(' \u00b7 ');

        const metaItems = [
            { label: metaLabels.student, value: studentName },
            { label: metaLabels.class, value: studentClass },
            { label: metaLabels.period, value: escapeHtml(periodLabel) },
            { label: metaLabels.teacher, value: teacherName }
        ].filter((item) => item.value);

        const metaRows = [];
        for (let i = 0; i < metaItems.length; i += 2) {
            metaRows.push(metaItems.slice(i, i + 2));
        }

        const metaHtml = metaRows.map((row) => `
                  <tr>
                    ${row.map((item) => `
                    <td width="50%" valign="top" style="padding:6px 8px;">
                      <div style="font-size:10.5px;line-height:1.4;letter-spacing:.8px;text-transform:uppercase;color:#94a3b8;font-weight:700;">${item.label}</div>
                      <div class="em-meta-value" style="font-size:14px;line-height:1.5;color:#0f172a;font-weight:600;margin-top:2px;">${item.value}</div>
                    </td>`).join('')}
                    ${row.length === 1 ? '<td width="50%">&nbsp;</td>' : ''}
                  </tr>`).join('');

        const kpiHtml = highlights.length > 0 ? `
          <tr>
            <td style="padding:24px 24px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  ${highlights.map((item) => `
                  <td width="${Math.floor(100 / highlights.length)}%" valign="top" style="padding:0 4px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;">
                      <tr>
                        <td align="center" style="padding:16px 8px;">
                          <div class="em-kpi-value" style="font-size:24px;line-height:1.2;font-weight:700;color:#0d9488;">${item.value}</div>
                          <div style="font-size:10.5px;line-height:1.4;letter-spacing:.6px;text-transform:uppercase;color:#64748b;font-weight:700;margin-top:4px;">${escapeHtml(item.label)}</div>
                        </td>
                      </tr>
                    </table>
                  </td>`).join('')}
                </tr>
              </table>
            </td>
          </tr>` : '';

        const noteHtml = remarkHtml ? `
          <tr>
            <td class="em-pad" style="padding:8px 32px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f0fdfa;border:1px solid #99f6e4;border-${edge}:4px solid #14b8a6;border-radius:12px;">
                <tr>
                  <td style="padding:22px 24px;text-align:${align};">
                    <div style="font-size:11px;line-height:1.4;letter-spacing:.9px;text-transform:uppercase;color:#0f766e;font-weight:700;margin-bottom:10px;">${noteLabel}</div>
                    <div style="font-size:15px;line-height:1.8;color:#134e4a;font-style:italic;">${remarkHtml}</div>
                    ${teacherName ? `<div style="margin-top:12px;font-size:13.5px;color:#0f766e;font-weight:600;">&mdash; ${teacherName}</div>` : ''}
                  </td>
                </tr>
              </table>
            </td>
          </tr>` : '';

        return `
<!DOCTYPE html>
<html lang="${normalizedRequestedLanguages[0] || 'en'}" dir="${direction}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta name="color-scheme" content="light" />
  <title>${titleLabel}${studentName ? ' \u2014 ' + studentName : ''}</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td, p, a, h1, h2, h3, h4, li { font-family: Arial, Helvetica, sans-serif !important; }
  </style>
  <![endif]-->
  <style>
    body { margin: 0 !important; padding: 0 !important; width: 100% !important; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, Arial, sans-serif; }
    table { border-collapse: collapse !important; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    td, p, div, li, a { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, Arial, sans-serif; }
    a { color: #0d9488; }
    @media only screen and (max-width: 600px) {
      .em-shell { padding: 16px 8px !important; }
      .em-header { padding: 28px 20px !important; }
      .em-title { font-size: 22px !important; }
      .em-card { padding: 22px 20px 4px !important; }
      .em-pad { padding-inline: 20px !important; }
      .em-kpi-value { font-size: 20px !important; }
      .em-meta-value { font-size: 13px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#eef2f6;font-family:'Segoe UI',Tahoma,Geneva,Verdana,Arial,sans-serif;">
  <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;color:#eef2f6;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="em-shell" bgcolor="#eef2f6" dir="${direction}" style="background-color:#eef2f6;padding:24px 12px;font-family:'Segoe UI',Tahoma,Geneva,Verdana,Arial,sans-serif;">
    <tr>
      <td align="center">
        <table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:640px;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">

          <tr>
            <td class="em-header" bgcolor="#0d9488" style="background-color:#0d9488;background-image:linear-gradient(135deg,#14b8a6 0%,#0d9488 100%);padding:36px 32px;text-align:center;">
              <div style="font-size:12px;line-height:1.4;letter-spacing:1.6px;text-transform:uppercase;color:#ccfbf1;font-weight:700;">${schoolLabel}</div>
              <h1 class="em-title" style="margin:10px 0 0;font-size:26px;line-height:1.25;color:#ffffff;font-weight:700;letter-spacing:-0.3px;">${titleLabel}</h1>
              ${periodLabel ? `<div style="margin-top:14px;"><span style="display:inline-block;padding:6px 16px;border-radius:999px;background-color:#0f766e;color:#ecfeff;font-size:12.5px;line-height:1.6;font-weight:600;">${escapeHtml(periodLabel)}</span></div>` : ''}
              ${studentName ? `<div style="margin-top:12px;font-size:15px;line-height:1.6;color:#ecfeff;">${studentName}</div>` : ''}
            </td>
          </tr>

          ${kpiHtml}

          ${metaHtml ? `
          <tr>
            <td class="em-pad" style="padding:20px 24px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                ${metaHtml}
              </table>
            </td>
          </tr>` : ''}

          <tr>
            <td class="em-card" style="padding:28px 32px 4px;">
              <div dir="${direction}" style="text-align:${align};">${bodyHtml}</div>
            </td>
          </tr>

          ${noteHtml}

          <tr>
            <td class="em-pad" style="padding:26px 32px 0;">
              <p style="margin:0;font-size:15px;line-height:1.75;color:#334155;text-align:${align};">${closingLine}</p>
            </td>
          </tr>

          <tr>
            <td class="em-pad" style="padding:24px 32px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:2px solid #e2e8f0;">
                <tr>
                  <td style="padding-top:20px;text-align:${align};">
                    <div style="font-size:16px;line-height:1.4;font-weight:700;color:#0f172a;">${teacherName || schoolLabel}</div>
                    <div style="font-size:13.5px;line-height:1.5;color:#64748b;margin-top:3px;">${teacherRole}</div>
                    <div style="font-size:13px;line-height:1.5;color:#94a3b8;margin-top:2px;">${schoolLabel}</div>
                    ${teacherEmail ? `<div style="margin-top:10px;font-size:13px;"><a href="mailto:${teacherEmail}" style="color:#0d9488;text-decoration:none;">${teacherEmail}</a></div>` : ''}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td bgcolor="#f8fafc" style="background-color:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 32px;text-align:center;">
              <div style="font-size:13px;line-height:1.5;color:#64748b;font-weight:600;">${schoolLabel}</div>
              <div style="font-size:11.5px;line-height:1.6;color:#94a3b8;margin-top:6px;">${privacyLabel}</div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
        `;
    }

    /**
     * Get email delivery status
     */
    async getEmailStatus(reportId) {
        const emails = await EmailReport.find({ reportId });
        return {
            total: emails.length,
            sent: emails.filter(e => e.status === 'sent').length,
            failed: emails.filter(e => e.status === 'failed').length,
            pending: emails.filter(e => e.status === 'pending').length,
            unknown: emails.filter(e => e.status === 'unknown').length,
            details: emails
        };
    }

    /**
     * Retry only definitely-failed deliveries. 'unknown' and 'pending' rows are
     * never retried automatically — the provider may already have accepted them.
     */
    async retryFailedEmails(reportId) {
        const failedEmails = await EmailReport.find({
            reportId,
            status: 'failed',
            retryCount: { $lt: 3 }
        });

        // Draft sends own the transport; legacy AI-report rows fall back to the
        // token-usage record's teacher.
        let teacherId = (await ReportDraft.findById(reportId).select('teacher'))?.teacher;
        if (!teacherId) {
            const legacy = await AITokenUsage.findById(reportId).select('teacher user');
            teacherId = legacy?.teacher || legacy?.user;
        }

        const results = {
            retried: 0,
            successful: 0,
            failed: 0,
            unknown: 0
        };

        for (const emailRecord of failedEmails) {
            if (!teacherId) {
                results.failed++;
                results.retried++;
                continue;
            }

            let info;
            try {
                info = await this.gmailService.sendEmail(teacherId, {
                    to: emailRecord.email,
                    subject: emailRecord.subject,
                    html: emailRecord.content,
                    text: htmlToPlainText(emailRecord.content)
                });
            } catch (error) {
                const definite = isDefiniteProviderFailure(error);
                await EmailReport.findByIdAndUpdate(emailRecord._id, {
                    status: definite ? 'failed' : 'unknown',
                    error: error.message,
                    retryCount: emailRecord.retryCount + 1,
                    lastRetryAt: new Date()
                });
                if (definite) results.failed++;
                else results.unknown++;
                results.retried++;
                continue;
            }

            // Accepted: bookkeeping failure must not make it retryable again.
            try {
                await EmailReport.findByIdAndUpdate(emailRecord._id, {
                    status: 'sent',
                    messageId: info.messageId || info.id,
                    sentAt: new Date(),
                    retryCount: emailRecord.retryCount + 1,
                    lastRetryAt: new Date()
                });
                results.successful++;
            } catch {
                await EmailReport.findByIdAndUpdate(emailRecord._id, {
                    status: 'unknown',
                    messageId: info.messageId || info.id,
                    error: 'Provider accepted the message but delivery bookkeeping failed.',
                    retryCount: emailRecord.retryCount + 1,
                    lastRetryAt: new Date()
                }).catch(() => {});
                results.unknown++;
            }
            results.retried++;
        }

        return results;
    }

    /**
     * Test Gmail OAuth configuration for a user
     */
    async testEmailConfiguration(userId) {
        try {
            const tokenStatus = await this.gmailService.getTokenStatus(userId);
            
            if (tokenStatus.connected) {
                return { 
                    success: true, 
                    message: `Gmail OAuth is configured and connected to ${tokenStatus.email}`,
                    email: tokenStatus.email,
                    needsRefresh: tokenStatus.needsRefresh
                };
            } else {
                return { 
                    success: false, 
                    message: 'Gmail OAuth not connected. Please authenticate with Google first.' 
                };
            }
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    /**
     * Send lesson plan feedback email to teacher
     * @param {Object} lessonPlan - Lesson plan document
     * @param {Object} teacher - Teacher information
     */
    async sendLessonPlanFeedback(lessonPlan, teacher) {
        if (!teacher?.email) {
            console.error('No teacher email provided for lesson plan feedback');
            return { success: false, message: 'No teacher email provided' };
        }

        try {
            const subject = `Lesson Plan Feedback Required - ${lessonPlan.topic || lessonPlan.title}`;
            const schoolName = await this.resolveSchoolName(lessonPlan?.school);
            const htmlContent = this.formatLessonPlanFeedbackEmail(lessonPlan, schoolName);

            const emailData = {
                to: teacher.email,
                subject: sanitizeSubject(subject),
                html: htmlContent
            };

            const result = await this.gmailService.sendEmail(emailData);

            await Notification.create({
                school: lessonPlan.school,
                user: teacher._id,
                type: 'lesson_plan_feedback',
                title: 'Lesson Plan Requires Revision',
                message: `Your lesson plan "${lessonPlan.topic || lessonPlan.title}" needs revision based on AI evaluation.`,
                metadata: {
                    lessonPlanId: lessonPlan._id.toString(),
                    overallScore: lessonPlan.aiEvaluation?.overallScore,
                    meetsRequirements: lessonPlan.aiEvaluation?.meetsMinimumRequirements
                },
                emailSent: result.success,
                emailSentAt: result.success ? new Date() : null,
                emailError: result.success ? null : result.error
            });

            return result;
        } catch (error) {
            console.error('Error sending lesson plan feedback email:', error);
            
            await Notification.create({
                school: lessonPlan.school,
                user: teacher._id,
                type: 'lesson_plan_feedback',
                title: 'Lesson Plan Requires Revision',
                message: `Your lesson plan "${lessonPlan.topic || lessonPlan.title}" needs revision based on AI evaluation.`,
                metadata: {
                    lessonPlanId: lessonPlan._id.toString(),
                    overallScore: lessonPlan.aiEvaluation?.overallScore,
                    meetsRequirements: lessonPlan.aiEvaluation?.meetsMinimumRequirements
                },
                emailSent: false,
                emailError: error.message
            });

            return { success: false, error: error.message };
        }
    }

    /**
     * Format lesson plan feedback email content
     * @param {Object} lessonPlan - Lesson plan document
     */
    formatLessonPlanFeedbackEmail(lessonPlan, schoolName = 'School') {
        const evaluation = lessonPlan.aiEvaluation || {};
        const failedCriteria = (evaluation.criteriaScores || []).filter(c => !c.metMinimum);
        
        const failedCriteriaRows = failedCriteria.map(c => `
            <tr style="border-bottom: 1px solid #ddd;">
                <td style="padding: 10px;"><strong>${c.criteriaName}</strong></td>
                <td style="padding: 10px;">${c.score}/100</td>
            </tr>
            <tr>
                <td colspan="2" style="padding: 10px; background: #fffbeb;">
                    ${c.feedback}
                </td>
            </tr>
        `).join('');

        const strengthsList = (evaluation.strengths || []).map(s => `<li>${s}</li>`).join('');
        const improvementsList = (evaluation.areasForImprovement || []).map(a => `<li>${a}</li>`).join('');
        const recommendationsList = (evaluation.recommendations || []).map(r => `<li>${r}</li>`).join('');

        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f8fafc;">
    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 20px;">
        <h2 style="color: #ef4444; margin-top: 0;">Lesson Plan Requires Revision</h2>
        
        <div style="background: #f8fafc; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Topic:</strong> ${lessonPlan.topic || lessonPlan.title || 'N/A'}</p>
            <p style="margin: 5px 0;"><strong>Class:</strong> ${lessonPlan.class?.name || 'N/A'}</p>
            <p style="margin: 5px 0;"><strong>Subject:</strong> ${lessonPlan.subject?.name || 'N/A'}</p>
            <p style="margin: 5px 0;"><strong>Date:</strong> ${lessonPlan.date ? new Date(lessonPlan.date).toLocaleDateString() : 'N/A'}</p>
            <p style="margin: 5px 0;"><strong>Overall Score:</strong> <span style="color: #ef4444; font-weight: bold;">${evaluation.overallScore || 0}/100</span></p>
        </div>

        <h3 style="color: #0d9488;">Evaluation Summary</h3>
        
        ${failedCriteria.length > 0 ? `
        <div style="margin: 20px 0;">
            <h4 style="color: #ef4444;">Criteria Not Meeting Requirements:</h4>
            <table style="width: 100%; border-collapse: collapse;">
                ${failedCriteriaRows}
            </table>
        </div>
        ` : ''}

        ${strengthsList ? `
        <div style="margin: 20px 0;">
            <h4 style="color: #10b981;">Strengths:</h4>
            <ul style="line-height: 1.6;">
                ${strengthsList}
            </ul>
        </div>
        ` : ''}

        ${improvementsList ? `
        <div style="margin: 20px 0;">
            <h4 style="color: #f59e0b;">Areas for Improvement:</h4>
            <ul style="line-height: 1.6;">
                ${improvementsList}
            </ul>
        </div>
        ` : ''}

        ${recommendationsList ? `
        <div style="margin: 20px 0;">
            <h4 style="color: #0d9488;">Recommendations:</h4>
            <ul style="line-height: 1.6;">
                ${recommendationsList}
            </ul>
        </div>
        ` : ''}

        <div style="text-align: center; margin: 30px 0;">
            <p style="margin-bottom: 15px;">Please revise your lesson plan based on the feedback above and resubmit.</p>
        </div>

        <p style="color: #334155; font-size: 12px; margin-top: 30px; border-top: 1px solid #ddd; padding-top: 15px;">
            This evaluation was generated by AI based on your school's lesson plan criteria. 
            If you have questions, please contact your department head or academic coordinator.
        </p>
        <p style="color: #334155; font-size: 12px;">${escapeHtml(schoolName)}</p>
    </div>
</body>
</html>
        `.trim();
    }
}

const emailServiceInstance = new EmailService();

export const sendLessonPlanFeedback = (lessonPlan, teacher) => 
    emailServiceInstance.sendLessonPlanFeedback(lessonPlan, teacher);

export default emailServiceInstance;
