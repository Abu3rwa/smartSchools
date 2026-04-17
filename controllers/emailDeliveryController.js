import { google } from 'googleapis';
import { asyncHandler } from '../middleware/errorHandler.js';
import { getPlatformBranding } from '../services/platformBrandingService.js';

/**
 * @desc    Send a test email using stored Gmail tokens (via Gmail API)
 * @route   POST /api/email/test
 * @access  Private
 */
export const sendTestEmail = asyncHandler(async (req, res) => {
    const { subject, message } = req.body;
    const user = req.user;

    // Check if user has Gmail connected
    if (!user.gmailTokens || !user.gmailTokens.isActive) {
        return res.status(400).json({
            success: false,
            message: 'Gmail not connected. Please login with Google first.'
        });
    }

    const userEmail = user.gmailTokens.email;

    // Sanitize subject to prevent header injection (strip CR/LF)
    const sanitizedSubject = (subject || '').replace(/[\r\n]/g, '').substring(0, 200);
    // Sanitize message body to prevent HTML injection
    const sanitizedMessage = (message || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    try {
        // Create OAuth2 client
        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_LOGIN_REDIRECT_URI
        );

        // Set credentials
        oauth2Client.setCredentials({
            access_token: user.gmailTokens.accessToken,
            refresh_token: user.gmailTokens.refreshToken
        });

        // Check if token is expired and refresh if needed
        const now = new Date();
        const expiryDate = new Date(user.gmailTokens.expiryDate);

        if (now >= expiryDate) {
            console.log('Token expired, refreshing...');
            const { credentials } = await oauth2Client.refreshAccessToken();

            user.gmailTokens.accessToken = credentials.access_token;
            user.gmailTokens.expiryDate = new Date(credentials.expiry_date);
            await user.save();

            oauth2Client.setCredentials(credentials);
            console.log('Token refreshed');
        }

        // Create Gmail API client
        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

        const branding = await getPlatformBranding();
        const appName = branding?.appName || 'School Platform';

        // Create email content
        const emailSubject = sanitizedSubject || `Test Email from ${appName}`;
        const emailBody = sanitizedMessage || `This is a test email sent using Gmail API through ${appName}!`;

        // Build the email in RFC 2822 format
        const emailLines = [
            `From: ${userEmail}`,
            `To: ${userEmail}`,
            `Subject: ${emailSubject}`,
            'Content-Type: text/html; charset=utf-8',
            '',
            `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #2c3e50;">✅ Test Email Successful!</h2>
                <p>${emailBody}</p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                <p style="color: #6c757d; font-size: 12px;">
                    Sent from: ${userEmail}<br>
                    Sent via: ${appName} App (Gmail API)
                </p>
            </div>`
        ];

        const email = emailLines.join('\r\n');

        // Base64 encode the email (URL-safe)
        const encodedEmail = Buffer.from(email)
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');

        console.log('Sending email via Gmail API...');

        // Send email using Gmail API
        const result = await gmail.users.messages.send({
            userId: 'me',
            requestBody: {
                raw: encodedEmail
            }
        });

        console.log('Email sent successfully! Message ID:', result.data.id);

        res.json({
            success: true,
            message: 'Test email sent successfully to ' + userEmail,
            data: {
                from: userEmail,
                to: userEmail,
                subject: emailSubject,
                messageId: result.data.id
            }
        });

    } catch (error) {
        console.error('Email send error:', error);

        // Provide more helpful error message
        let errorMessage = error.message;
        if (error.code === 403) {
            errorMessage = 'Gmail API not enabled or insufficient permissions. Please re-login with Google.';
        } else if (error.code === 401) {
            errorMessage = 'Token expired or invalid. Please re-login with Google.';
        }

        res.status(500).json({
            success: false,
            message: 'Failed to send email: ' + errorMessage
        });
    }
});
