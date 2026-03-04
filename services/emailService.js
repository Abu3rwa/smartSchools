import gmailOAuthService from './gmailOAuthService.js';
import { EmailReport } from '../models/EmailReport.js';
import { AITokenUsage } from '../models/AITokenUsage.js';
import Notification from '../models/Notification.js';
import School from '../models/School.js';
import xss from 'xss';

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

const normalizeAiHtml = (content, language) => {
    const isRTL = language === 'arabic';
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
     * Send report email to multiple recipients in one email
     * @param {Object} options - Email sending options
     * @param {String} options.reportId - Token usage record ID
     * @param {Object} options.studentData - Student information
     * @param {String} options.reportContent - Generated report content
     * @param {String} options.language - Report language
     * @param {Object} options.recipients - Recipient configuration
     * @param {Object} options.teacher - Teacher information
     * @returns {Promise<Object>} Email sending results
     */
    async sendReportEmails(options) {
        const {
            reportId,
            studentData,
            reportContent,
            language,
            recipients,
            teacher
        } = options;

        // Prepare recipient list (all in one email)
        const emailList = this.prepareRecipientList({
            studentData,
            recipients,
            teacher
        });

        if (emailList.length === 0) {
            return {
                success: false,
                message: 'No valid email recipients found'
            };
        }

        const schoolName = await this.resolveSchoolName(studentData?.school);

        try {
            // Send ONE email to all recipients
            const result = await this.sendSingleEmailToMultiple({
                reportId,
                recipients: emailList,
                reportContent,
                language,
                studentData,
                teacherId: teacher._id,
                schoolName
            });

            // Log to Notification history so teachers/admins can see sent AI reports in /portal/notifications
            try {
                const subject = sanitizeSubject(this.getEmailSubject(studentData, language));
                const htmlContent = this.formatEmailContent(reportContent, language, { schoolName });

                const notification = new Notification({
                    school: studentData.school,
                    recipientEmail: emailList.map(r => r.email).join(','),
                    student: studentData._id,
                    type: 'ai_report',
                    subject,
                    message: (reportContent || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim(),
                    htmlContent,
                    channels: ['email'],
                    status: result.success ? 'sent' : 'failed',
                    metadata: {
                        reportId,
                        language,
                        reportType: 'advanced_ai',
                        primaryRecipients: result.primaryRecipients,
                        ccRecipients: result.ccRecipients,
                        error: result.success ? undefined : result.error
                    },
                    createdBy: teacher._id
                });

                await notification.save();
                if (result.success) {
                    await notification.markAsSent('email');
                }
            } catch (logError) {
                // Don't fail the main flow if notification logging fails
                console.error('Failed to log advanced report email to notifications:', logError);
            }

            // Update token usage record with email status
            await this.updateEmailStatus(reportId, {
                sent: result.success ? [result] : [],
                failed: result.success ? [] : [result],
                total: 1
            });

            return result;
        } catch (error) {
            return {
                success: false,
                message: error.message,
                recipients: emailList
            };
        }
    }

    /**
     * Prepare list of all recipients for one email
     */
    prepareRecipientList({ studentData, recipients, teacher }) {
        const emailList = [];

        // Add parent emails (primary recipients)
        if (recipients.mother && studentData.parentInfo?.motherEmail) {
            emailList.push({
                email: studentData.parentInfo.motherEmail,
                type: 'mother',
                name: studentData.parentInfo.motherName || `Mother of ${studentData.firstName}`
            });
        }

        if (recipients.father && studentData.parentInfo?.fatherEmail) {
            emailList.push({
                email: studentData.parentInfo.fatherEmail,
                type: 'father', 
                name: studentData.parentInfo.fatherName || `Father of ${studentData.firstName}`
            });
        }

        // Add guardian if no parents
        if (emailList.length === 0 && studentData.parentInfo?.guardianEmail) {
            emailList.push({
                email: studentData.parentInfo.guardianEmail,
                type: 'guardian',
                name: studentData.parentInfo.guardianName || `Guardian of ${studentData.firstName}`
            });
        }

        // Add student email (CC)
        if (recipients.student && studentData.studentEmail) {
            emailList.push({
                email: studentData.studentEmail,
                type: 'student',
                name: `${studentData.firstName} ${studentData.lastName}`
            });
        }

        // Add teacher email (CC)
        if (recipients.teacher && teacher?.email) {
            emailList.push({
                email: teacher.email,
                type: 'teacher',
                name: `${teacher.firstName} ${teacher.lastName}`
            });
        }

        return emailList;
    }

    /**
     * Send single email to multiple recipients using Gmail API
     */
    async sendSingleEmailToMultiple(options) {
        const {
            reportId,
            recipients,
            reportContent,
            language,
            studentData,
            teacherId,
            schoolName
        } = options;

        // Separate primary recipients (parents) from CC recipients
        const primaryRecipients = recipients.filter(r => ['mother', 'father', 'guardian'].includes(r.type));
        const ccRecipients = recipients.filter(r => ['student', 'teacher'].includes(r.type));

        if (primaryRecipients.length === 0) {
            throw new Error('No primary recipients (parents/guardian) found');
        }

        const subject = sanitizeSubject(this.getEmailSubject(studentData, language));
        const htmlContent = this.formatEmailContent(reportContent, language, { schoolName });

        // Prepare recipient list for Gmail API
        const toEmails = primaryRecipients.map(r => r.email).join(', ');
        const ccEmails = ccRecipients.length > 0 ? ccRecipients.map(r => r.email).join(', ') : undefined;

        try {
            // Check if teacher has Gmail connected
            const hasValidTokens = await this.gmailService.hasValidTokens(teacherId);
            if (!hasValidTokens) {
                throw new Error('Gmail not connected. Please authenticate with Google first.');
            }

            // Send email using Gmail OAuth
            const mailOptions = {
                to: toEmails,
                cc: ccEmails,
                subject,
                html: htmlContent
            };

            const result = await this.gmailService.sendEmail(teacherId, mailOptions);

            // Save email record
            const emailRecord = new EmailReport({
                reportId,
                recipientType: 'parents', // Single record for the group email
                email: [...primaryRecipients, ...ccRecipients].map(r => r.email).join(', '),
                subject,
                content: htmlContent,
                language,
                messageId: result.messageId,
                status: 'sent',
                sentAt: new Date()
            });

            await emailRecord.save();

            return {
                success: true,
                messageId: result.messageId,
                threadId: result.threadId,
                recipients: recipients,
                primaryRecipients: primaryRecipients.length,
                ccRecipients: ccRecipients.length
            };
        } catch (error) {
            // Save failed email record
            const emailRecord = new EmailReport({
                reportId,
                recipientType: 'parents',
                email: [...primaryRecipients, ...ccRecipients].map(r => r.email).join(', '),
                subject,
                content: htmlContent,
                language,
                status: 'failed',
                error: error.message
            });

            await emailRecord.save();

            return {
                success: false,
                error: error.message,
                recipients: recipients
            };
        }
    }

    /**
     * Get email subject based on language (plain ASCII text)
     */
    getEmailSubject(studentData, language) {
        const studentName = `${studentData.firstName} ${studentData.lastName}`;
        
        switch (language) {
            case 'arabic':
                return `تقرير التقدم للطالب ${studentName}`;
            case 'bilingual':
                return `Progress Report - ${studentName}`;
            default:
                return `Progress Report for ${studentName}`;
        }
    }

    /**
     * Format email content with proper styling
     */
    formatEmailContent(content, language, { schoolName = 'School' } = {}) {
        const isRTL = language === 'arabic';
        const direction = isRTL ? 'rtl' : 'ltr';

        const normalizedContent = normalizeAiHtml(content, language);

        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body {
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    line-height: 1.6;
                    color: #111827;
                    max-width: 600px;
                    margin: 0 auto;
                    padding: 20px;
                    background-color: #f6f7fb;
                }
                .container {
                    background-color: white;
                    padding: 30px;
                    border-radius: 12px;
                    border: 1px solid #e5e7eb;
                }
            </style>
        </head>
        <body dir="${direction}">
            <div class="container">
                <div class="content">
                    ${normalizedContent}
                </div>
                <p style="margin-top: 18px; font-size: 12px; color: #6b7280;">
                    School: ${escapeHtml(schoolName)}
                </p>
            </div>
        </body>
        </html>
        `;
    }

    /**
     * Update email status in token usage record
     */
    async updateEmailStatus(reportId, results) {
        const updateData = {
            emailRecipients: results.sent.length > 0 ? results.sent[0].recipients?.map(r => r.email) : [],
            emailStatus: {}
        };

        // Initialize email status for all types
        ['student', 'mother', 'father', 'guardian', 'teacher', 'parents'].forEach(type => {
            updateData.emailStatus[type] = {
                sent: false,
                sentAt: null,
                messageId: null
            };
        });

        // If group email was sent successfully, mark 'parents' as sent
        if (results.sent.length > 0) {
            updateData.emailStatus.parents = {
                sent: true,
                sentAt: new Date(),
                messageId: results.sent[0].messageId
            };

            // Also mark individual types as sent based on recipients
            results.sent[0].recipients?.forEach(recipient => {
                if (updateData.emailStatus[recipient.type]) {
                    updateData.emailStatus[recipient.type] = {
                        sent: true,
                        sentAt: new Date(),
                        messageId: results.sent[0].messageId
                    };
                }
            });
        }

        await AITokenUsage.findByIdAndUpdate(reportId, updateData);
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
            details: emails
        };
    }

    /**
     * Retry failed emails
     */
    async retryFailedEmails(reportId) {
        const failedEmails = await EmailReport.find({ 
            reportId, 
            status: 'failed',
            retryCount: { $lt: 3 } // Max 3 retries
        });

        const results = {
            retried: 0,
            successful: 0,
            failed: 0
        };

        for (const emailRecord of failedEmails) {
            try {
                // Resend the email
                const mailOptions = {
                    from: process.env.EMAIL_USER,
                    to: emailRecord.email,
                    subject: emailRecord.subject,
                    html: emailRecord.content
                };

                const info = await this.transporter.sendMail(mailOptions);

                // Update record
                await EmailReport.findByIdAndUpdate(emailRecord._id, {
                    status: 'sent',
                    messageId: info.messageId,
                    sentAt: new Date(),
                    retryCount: emailRecord.retryCount + 1
                });

                results.successful++;
            } catch (error) {
                // Update retry count
                await EmailReport.findByIdAndUpdate(emailRecord._id, {
                    retryCount: emailRecord.retryCount + 1,
                    lastRetryAt: new Date()
                });

                results.failed++;
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
                <td colspan="2" style="padding: 10px; background: #fff3e0;">
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
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 20px;">
        <h2 style="color: #d32f2f; margin-top: 0;">Lesson Plan Requires Revision</h2>
        
        <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Topic:</strong> ${lessonPlan.topic || lessonPlan.title || 'N/A'}</p>
            <p style="margin: 5px 0;"><strong>Class:</strong> ${lessonPlan.class?.name || 'N/A'}</p>
            <p style="margin: 5px 0;"><strong>Subject:</strong> ${lessonPlan.subject?.name || 'N/A'}</p>
            <p style="margin: 5px 0;"><strong>Date:</strong> ${lessonPlan.date ? new Date(lessonPlan.date).toLocaleDateString() : 'N/A'}</p>
            <p style="margin: 5px 0;"><strong>Overall Score:</strong> <span style="color: #d32f2f; font-weight: bold;">${evaluation.overallScore || 0}/100</span></p>
        </div>

        <h3 style="color: #1976d2;">Evaluation Summary</h3>
        
        ${failedCriteria.length > 0 ? `
        <div style="margin: 20px 0;">
            <h4 style="color: #d32f2f;">Criteria Not Meeting Requirements:</h4>
            <table style="width: 100%; border-collapse: collapse;">
                ${failedCriteriaRows}
            </table>
        </div>
        ` : ''}

        ${strengthsList ? `
        <div style="margin: 20px 0;">
            <h4 style="color: #388e3c;">Strengths:</h4>
            <ul style="line-height: 1.6;">
                ${strengthsList}
            </ul>
        </div>
        ` : ''}

        ${improvementsList ? `
        <div style="margin: 20px 0;">
            <h4 style="color: #f57c00;">Areas for Improvement:</h4>
            <ul style="line-height: 1.6;">
                ${improvementsList}
            </ul>
        </div>
        ` : ''}

        ${recommendationsList ? `
        <div style="margin: 20px 0;">
            <h4 style="color: #1976d2;">Recommendations:</h4>
            <ul style="line-height: 1.6;">
                ${recommendationsList}
            </ul>
        </div>
        ` : ''}

        <div style="text-align: center; margin: 30px 0;">
            <p style="margin-bottom: 15px;">Please revise your lesson plan based on the feedback above and resubmit.</p>
        </div>

        <p style="color: #666; font-size: 12px; margin-top: 30px; border-top: 1px solid #ddd; padding-top: 15px;">
            This evaluation was generated by AI based on your school's lesson plan criteria. 
            If you have questions, please contact your department head or academic coordinator.
        </p>
        <p style="color: #666; font-size: 12px;">School: ${escapeHtml(schoolName)}</p>
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
