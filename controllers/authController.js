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

    // School context is required — comes from the logged-in admin's school
    const schoolId = req.schoolId || req.body.school;
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
                role: user.role,
                school: user.school,
                lastLogin: user.lastLogin
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
                role: user.role,
                school: user.school,
                department: user.department,
                phone: user.phone,
                avatar: user.avatar,
                lastLogin: user.lastLogin
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

    const user = await User.findById(req.user._id).select('+password');

    // Check current password
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
        return res.status(401).json({
            success: false,
            message: 'Current password is incorrect'
        });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    res.json({
        success: true,
        message: 'Password changed successfully'
    });
});

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
        res.redirect(`${clientUrl}/auth/callback?token=${jwtToken}&isNew=${isNewUser}`);

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
