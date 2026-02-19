import crypto from 'crypto';
import { google } from 'googleapis';
import User from '../models/User.js';
import Teacher from '../models/Teacher.js';
import School from '../models/School.js';
import { generateToken } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';

/**
 * @desc    Register a new user
 * @route   POST /api/auth/register
 * @access  Public
 */
export const register = asyncHandler(async (req, res) => {
    const { email, password, firstName, lastName, phone, role } = req.body;

    // super_admin cannot be self-assigned
    if (role === 'super_admin') {
        return res.status(403).json({
            success: false,
            message: 'Cannot self-assign super_admin role'
        });
    }

    // Check if user exists (skip tenant filter - no school context yet)
    const existingUser = await User.findOne({ email }).setOptions({ skipTenantFilter: true });
    if (existingUser) {
        return res.status(400).json({
            success: false,
            message: 'User already exists with this email'
        });
    }

    // School context must come from authenticated admin context only
    const schoolId = req.schoolId;
    if (!schoolId) {
        return res.status(400).json({
            success: false,
            message: 'School context is required to register a user'
        });
    }

    // Create user — role is assigned by the school admin
    const user = await User.create({
        email,
        password,
        firstName,
        lastName,
        phone,
        role: role || 'teacher',
        school: schoolId
    });

    // Generate token
    const token = generateToken(user._id, user.school);

    res.status(201).json({
        success: true,
        message: 'User registered successfully',
        data: {
            user: {
                id: user._id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                fullName: user.fullName,
                role: user.role,
                school: user.school
            },
            token
        }
    });
});

/**
 * @desc    Login user
 * @route   POST /api/auth/login
 * @access  Public
 */
export const login = asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    // Find user and include password (skip tenant filter - no school context yet)
    const user = await User.findOne({ email }).select('+password').setOptions({ skipTenantFilter: true }).populate('school');

    if (!user) {
        return res.status(401).json({
            success: false,
            message: 'Invalid email or password'
        });
    }

    // Check if user is active
    if (!user.isActive) {
        return res.status(401).json({
            success: false,
            message: 'Account is deactivated. Please contact administrator.'
        });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
        return res.status(401).json({
            success: false,
            message: 'Invalid email or password'
        });
    }

    // Update last login
    await user.updateLastLogin();

    // Generate token with school context
    const token = generateToken(user._id, user.school);

    // Get teacher profile if applicable
    let teacherProfile = null;
    if (user.role === 'teacher') {
        teacherProfile = await Teacher.findOne({ user: user._id })
            .populate('subjects', 'name code')
            .populate('assignedClasses.class', 'name grade section')
            .populate('assignedClasses.subject', 'name code');
    }

    res.json({
        success: true,
        message: 'Login successful',
        data: {
            user: {
                id: user._id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                fullName: user.fullName,
                title: user.title,
                role: user.role,
                school: user.school,
                lastLogin: user.lastLogin,
                permissions: user.permissions || [],
                permissionScopes: user.permissionScopes || {}
            },
            teacherProfile,
            token
        }
    });
});

/**
 * @desc    Get current logged in user
 * @route   GET /api/auth/me
 * @access  Private
 */
export const getMe = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id)
        .populate('school')
        .populate('department', 'name type');

    let profile = null;
    if (user.role === 'teacher') {
        profile = await Teacher.findOne({ user: user._id })
            .populate('subjects', 'name code')
            .populate('assignedClasses.class', 'name grade section')
            .populate('assignedClasses.subject', 'name code');
    }

    res.json({
        success: true,
        data: {
            user: {
                id: user._id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                fullName: user.fullName,
                title: user.title,
                role: user.role,
                school: user.school,
                department: user.department,
                phone: user.phone,
                avatar: user.avatar,
                lastLogin: user.lastLogin,
                permissions: user.permissions || [],
                permissionScopes: user.permissionScopes || {}
            },
            profile
        }
    });
});

/**
 * @desc    Update user profile
 * @route   PUT /api/auth/profile
 * @access  Private
 */
export const updateProfile = asyncHandler(async (req, res) => {
    // Whitelist allowed fields to prevent privilege escalation
    const allowedFields = ['firstName', 'lastName', 'phone', 'avatar'];
    const updates = {};
    allowedFields.forEach(field => {
        if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    const user = await User.findByIdAndUpdate(
        req.user._id,
        updates,
        { new: true, runValidators: true }
    );

    res.json({
        success: true,
        message: 'Profile updated successfully',
        data: { user }
    });
});

/**
 * @desc    Change password
 * @route   PUT /api/auth/password
 * @access  Private
 */
export const changePassword = asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    // Get user with password
    const user = await User.findById(req.user._id).select('+password');

    if (!user) {
        return res.status(404).json({
            success: false,
            message: 'User not found'
        });
    }

    // Verify current password
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
        return res.status(400).json({
            success: false,
            message: 'Current password is incorrect'
        });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    res.json({
        success: true,
        message: 'Password updated successfully'
    });
});

/**
 * @desc    Send password reset email
 * @route   POST /api/auth/forgot-password
 * @access  Public
 */
export const forgotPassword = asyncHandler(async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({
            success: false,
            message: 'Email is required'
        });
    }

    // Find user by email (skip tenant filter for password reset)
    const user = await User.findOne({ email }).setOptions({ skipTenantFilter: true });

    if (!user) {
        // Don't reveal if email exists or not for security
        return res.json({
            success: true,
            message: 'If an account with that email exists, a password reset link has been sent.'
        });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    user.passwordResetToken = crypto
        .createHash('sha256')
        .update(resetToken)
        .digest('hex');
    user.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes

    await user.save({ validateBeforeSave: false });

    // Create reset URL
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password/${resetToken}`;

    try {
        // Send email (you'll need to implement email service)
        await sendPasswordResetEmail(user.email, resetUrl);

        res.json({
            success: true,
            message: 'Password reset link sent to your email'
        });
    } catch (error) {
        console.error('Password reset email error:', error);
        
        // Clear reset token on error
        user.passwordResetToken = undefined;
        user.passwordResetExpires = undefined;
        await user.save({ validateBeforeSave: false });

        res.status(500).json({
            success: false,
            message: 'Error sending password reset email'
        });
    }
});

/**
 * @desc    Reset password with token
 * @route   POST /api/auth/reset-password
 * @access  Public
 */
export const resetPassword = asyncHandler(async (req, res) => {
    const { token, password } = req.body;

    if (!token || !password) {
        return res.status(400).json({
            success: false,
            message: 'Token and password are required'
        });
    }

    // Hash token and find user
    const hashedToken = crypto
        .createHash('sha256')
        .update(token)
        .digest('hex');

    const user = await User.findOne({
        passwordResetToken: hashedToken,
        passwordResetExpires: { $gt: Date.now() }
    }).setOptions({ skipTenantFilter: true });

    if (!user) {
        return res.status(400).json({
            success: false,
            message: 'Invalid or expired reset token'
        });
    }

    // Set new password
    user.password = password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    res.json({
        success: true,
        message: 'Password reset successful'
    });
});

/**
 * @desc    Send password reset email
 * @param   {string} email - User email
 * @param   {string} resetUrl - Password reset URL
 */
const sendPasswordResetEmail = async (email, resetUrl) => {
    // TODO: Implement email sending service
    // Do not log reset tokens or reset links in application logs.
    
    // You can integrate with:
    // - Nodemailer with SMTP
    // - SendGrid
    // - AWS SES
    // - Gmail API (if user has Gmail tokens)
    
    // Example with basic email structure:
    const emailContent = {
        to: email,
        subject: 'Password Reset Request',
        html: `
            <h2>Password Reset Request</h2>
            <p>You requested to reset your password. Click the link below to reset it:</p>
            <a href="${resetUrl}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
                Reset Password
            </a>
            <p>This link will expire in 10 minutes.</p>
            <p>If you didn't request this, please ignore this email.</p>
        `
    };
    
    // For now, just return success
    // In production, you would send this email using your email service
    return emailContent;
};

/**
 * @desc    Logout user (client-side token removal)
 * @route   POST /api/auth/logout
 * @access  Private
 */
export const logout = asyncHandler(async (req, res) => {
    res.json({
        success: true,
        message: 'Logged out successfully'
    });
});

/**
 * @desc    Impersonate a user (Super Admin only)
 * @route   POST /api/auth/impersonate
 * @access  Private (Super Admin)
 */
export const impersonateUser = asyncHandler(async (req, res) => {
    const { userId } = req.body;

    // This is a super admin only function, but the authorization is handled in the route middleware.
    // We can add an extra check here for safety.
    if (req.user.role !== 'super_admin') {
        return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    if (!userId) {
        return res.status(400).json({ success: false, message: 'User ID is required' });
    }

    const userToImpersonate = await User.findById(userId).populate('school');

    if (!userToImpersonate) {
        return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Log the impersonation action for auditing
    console.log(`AUDIT: Super Admin '${req.user.email}' is impersonating user '${userToImpersonate.email}' (ID: ${userToImpersonate._id})`);

    // Generate token for the target user
    const token = generateToken(userToImpersonate._id, userToImpersonate.school?._id);

    res.json({
        success: true,
        message: `Successfully impersonating ${userToImpersonate.fullName}`,
        data: {
            user: {
                id: userToImpersonate._id,
                email: userToImpersonate.email,
                firstName: userToImpersonate.firstName,
                lastName: userToImpersonate.lastName,
                fullName: userToImpersonate.fullName,
                role: userToImpersonate.role,
                school: userToImpersonate.school,
                // We don't want to leak sensitive info during impersonation
            },
            token
        }
    });
});

/**
 * @desc    Get Google OAuth URL for login/register (includes Gmail scopes)
 * @route   GET /api/auth/google/url
 * @access  Public
 */
export const getGoogleAuthUrl = asyncHandler(async (req, res) => {
    const { schoolSlug } = req.query;

    // Check if Google OAuth credentials are configured
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
        return res.status(500).json({
            success: false,
            message: 'Google OAuth is not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your environment variables.'
        });
    }

    // Step 1: Create OAuth2 client with your credentials
    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_LOGIN_REDIRECT_URI || 'http://localhost:5000/api/auth/google/callback'
    );

    // Step 2: Define what permissions (scopes) we need
    const scopes = [
        'https://www.googleapis.com/auth/userinfo.email',    // Get user's email
        'https://www.googleapis.com/auth/userinfo.profile',  // Get user's name & picture
        'https://www.googleapis.com/auth/gmail.send'         // Send emails on their behalf
    ];

    // Step 3: Prepare state with school context
    const state = schoolSlug ? JSON.stringify({ schoolSlug }) : '';

    // Step 4: Generate the authorization URL
    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',   // We need refresh_token for long-term access
        scope: scopes,
        prompt: 'consent',         // Always show consent screen to get refresh_token
        state: state               // Pass school context
    });

    res.json({
        success: true,
        authUrl
    });
});

/**
 * @desc    Handle Google OAuth callback - Login/Register + Get Gmail tokens
 * @route   GET /api/auth/google/callback
 * @access  Public
 */
export const googleCallback = asyncHandler(async (req, res) => {
    const { code, error } = req.query;
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';

    // Handle errors from Google
    if (error) {
        return res.redirect(`${clientUrl}/login?error=${encodeURIComponent(error)}`);
    }

    if (!code) {
        return res.redirect(`${clientUrl}/login?error=missing_code`);
    }

    // Check if Google OAuth credentials are configured
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
        return res.redirect(`${clientUrl}/login?error=${encodeURIComponent('Google OAuth is not configured')}`);
    }

    try {
        // Step 1: Create OAuth2 client (same as before)
        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_LOGIN_REDIRECT_URI || 'http://localhost:5000/api/auth/google/callback'
        );

        // Step 2: Exchange the authorization code for tokens
        const { tokens } = await oauth2Client.getToken(code);
        // Tokens received from Google

        // Step 3: Set the tokens on the client to make API calls
        oauth2Client.setCredentials(tokens);

        // Step 4: Get user info from Google
        const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
        const { data: googleUser } = await oauth2.userinfo.get();

        // Step 5: Get school from state parameter
        let schoolId = null;
        try {
            const state = JSON.parse(req.query.state || '{}');
            if (state.schoolSlug) {
                const school = await School.findOne({ slug: state.schoolSlug, isActive: true });
                if (school) schoolId = school._id;
            }
        } catch (e) {
            // No school context in state, proceeding without school
        }

        // Step 6: Find or create user in our database
        let user = await User.findOne({ email: googleUser.email }).setOptions({ skipTenantFilter: true });
        let isNewUser = false;

        if (!user) {
            // New user - create account
            isNewUser = true;
            user = await User.create({
                email: googleUser.email,
                password: crypto.randomBytes(32).toString('hex'), // Random password (they'll use Google to login)
                firstName: googleUser.given_name || googleUser.email.split('@')[0],
                lastName: googleUser.family_name || '',
                role: 'teacher',
                avatar: googleUser.picture || null,
                isActive: true,
                school: schoolId // Assign to school if provided
            });
        } else if (!user.school && schoolId) {
            // Existing user without school - assign to selected school
            user.school = schoolId;
            await user.save();
        }

        // Step 7: Store Gmail tokens on the user for sending emails later
        user.gmailTokens = {
            email: googleUser.email,
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            expiryDate: new Date(tokens.expiry_date),
            isActive: true
        };
        await user.save();

        // Step 8: Update last login
        user.lastLogin = new Date();
        await user.save();

        // Step 9: Generate our own JWT token for the app
        const jwtToken = generateToken(user._id, user.school);

        // Step 10: Redirect back to frontend with the token
        // Put token in fragment instead of query string to reduce leakage via logs/referrers.
        res.redirect(`${clientUrl}/auth/callback#token=${encodeURIComponent(jwtToken)}&isNew=${isNewUser}`);

    } catch (err) {
        console.error('Google OAuth callback error:', err);
        res.redirect(`${clientUrl}/login?error=${encodeURIComponent(err.message)}`);
    }
});

/**
 * @desc    Send a test email using stored Gmail tokens
 * @route   POST /api/auth/test-email
 * @access  Private
 */
export const sendTestEmail = asyncHandler(async (req, res) => {
    const { to, subject, message } = req.body;
    const user = req.user;

    // Check if user has Gmail connected
    if (!user.gmailTokens || !user.gmailTokens.isActive) {
        return res.status(400).json({
            success: false,
            message: 'Gmail not connected. Please login with Google first.'
        });
    }


    try {
        // Import nodemailer
        const nodemailer = await import('nodemailer');

        // Check if token needs refresh
        const now = new Date();
        const expiryDate = new Date(user.gmailTokens.expiryDate);

        if (now >= expiryDate) {
            // Token expired, refreshing

            // Refresh the token
            const oauth2Client = new google.auth.OAuth2(
                process.env.GOOGLE_CLIENT_ID,
                process.env.GOOGLE_CLIENT_SECRET,
                process.env.GOOGLE_LOGIN_REDIRECT_URI
            );

            oauth2Client.setCredentials({
                refresh_token: user.gmailTokens.refreshToken
            });

            const { credentials } = await oauth2Client.refreshAccessToken();

            // Update user's tokens
            user.gmailTokens.accessToken = credentials.access_token;
            user.gmailTokens.expiryDate = new Date(credentials.expiry_date);
            await user.save();

        }

        // Create transporter with OAuth2
        const transporter = nodemailer.default.createTransport({
            service: 'gmail',
            auth: {
                type: 'OAuth2',
                user: user.gmailTokens.email,
                clientId: process.env.GOOGLE_CLIENT_ID,
                clientSecret: process.env.GOOGLE_CLIENT_SECRET,
                refreshToken: user.gmailTokens.refreshToken,
                accessToken: user.gmailTokens.accessToken
            }
        });

        // Send email
        const mailOptions = {
            from: `"${user.firstName} via GradeBook" <${user.gmailTokens.email}>`,
            to: to || user.email,
            subject: subject || 'Test Email from GradeBook',
            text: message || 'This is a test email sent using your Gmail account through GradeBook.',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h2 style="color: #2c3e50;">✅ Test Email Successful!</h2>
                    <p>${message || 'This is a test email sent using your Gmail account through GradeBook.'}</p>
                    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                    <p style="color: #6c757d; font-size: 12px;">
                        Sent from: ${user.gmailTokens.email}<br>
                        Sent via: GradeBook App
                    </p>
                </div>
            `
        };

        const info = await transporter.sendMail(mailOptions);

        res.json({
            success: true,
            message: 'Test email sent successfully!',
            data: {
                to: mailOptions.to,
                subject: mailOptions.subject,
                messageId: info.messageId
            }
        });

    } catch (error) {
        console.error('Email send error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send email: ' + error.message
        });
    }
});
