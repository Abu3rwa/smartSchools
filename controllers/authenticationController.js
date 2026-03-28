import crypto from 'crypto';
import { google } from 'googleapis';
import User from '../models/User.js';
import Teacher from '../models/Teacher.js';
import School from '../models/School.js';
import { uploadFile, deleteFile } from '../services/firebaseStorageService.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
    clearRefreshToken,
    decodeRefreshToken,
    generateAccessToken,
    generateRefreshToken,
    isRefreshTokenValidForUser,
    storeRefreshToken
} from '../services/authTokenService.js';
import { sendTransactionalEmail } from '../services/transactionalEmailService.js';
import { getPlatformBranding } from '../services/platformBrandingService.js';
import { getClientUrl } from '../helpers/portalUrl.js';

const DEFAULT_CLIENT_URL = getClientUrl();

const isLocalLikeUrl = (value = '') => /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(String(value));

const getAllowedClientOrigins = () => (
    [
        process.env.FRONTEND_URL,
        process.env.CLIENT_URL,
        'https://smile3-8c8c5.web.app',
        'http://localhost:5173',
        'https://schoolworkso.onrender.com'
    ]
        .filter(Boolean)
        .map((value) => String(value).trim().replace(/\/$/, ''))
);

const resolveSafeClientUrl = (candidate) => {
    if (!candidate) return DEFAULT_CLIENT_URL;
    try {
        const parsed = new URL(String(candidate));
        const normalizedOrigin = `${parsed.protocol}//${parsed.host}`;
        const allowedOrigins = getAllowedClientOrigins();
        return allowedOrigins.includes(normalizedOrigin) ? normalizedOrigin : DEFAULT_CLIENT_URL;
    } catch {
        return DEFAULT_CLIENT_URL;
    }
};

const resolveGoogleLoginRedirectUri = (req) => {
    const configuredRedirectUri = process.env.GOOGLE_LOGIN_REDIRECT_URI;
    const isProduction = process.env.NODE_ENV === 'production';

    if (configuredRedirectUri && (!isProduction || !isLocalLikeUrl(configuredRedirectUri))) {
        return configuredRedirectUri;
    }

    const host = req.get('host');
    if (host) {
        const protocol = req.get('x-forwarded-proto') || req.protocol || 'https';
        return `${protocol}://${host}/api/auth/google/callback`;
    }

    return 'http://localhost:5000/api/auth/google/callback';
};

const MAX_HEADER_SHORTCUTS = 10;

const normalizeHeaderShortcuts = (raw) => {
    if (!Array.isArray(raw)) return [];

    const seen = new Set();
    const normalized = [];
    for (const value of raw) {
        const path = String(value || '').trim();
        if (!path || !path.startsWith('/portal/')) continue;
        if (seen.has(path)) continue;
        seen.add(path);
        normalized.push(path);
        if (normalized.length >= MAX_HEADER_SHORTCUTS) break;
    }
    return normalized;
};

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
    const token = generateAccessToken(user);

    res.status(201).json({
        success: true,
        message: 'User registered successfully',
        data: {
            user: {
                id: user._id,
                _id: user._id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                fullName: user.fullName,
                role: user.role,
                school: user.school,
                mustChangePassword: user.mustChangePassword
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
    const token = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user._id);
    await storeRefreshToken(user._id, refreshToken);

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
                _id: user._id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                fullName: user.fullName,
                title: user.title,
                titles: user.titles || [],
                role: user.role,
                roles: user.roles?.length ? user.roles : [user.role],
                school: user.school,
                lastLogin: user.lastLogin,
                permissions: user.permissions || [],
                mustChangePassword: user.mustChangePassword,
                permissionScopes: user.permissionScopes || {},
                uiPreferences: {
                    headerShortcuts: normalizeHeaderShortcuts(user.uiPreferences?.headerShortcuts)
                }
            },
            teacherProfile,
            token,
            refreshToken
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
                _id: user._id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                fullName: user.fullName,
                title: user.title,
                titles: user.titles || [],
                role: user.role,
                roles: user.roles?.length ? user.roles : [user.role],
                school: user.school,
                department: user.department,
                phone: user.phone,
                avatar: user.avatar,
                lastLogin: user.lastLogin,
                mustChangePassword: user.mustChangePassword,
                permissions: user.permissions || [],
                permissionScopes: user.permissionScopes || {},
                uiPreferences: {
                    headerShortcuts: normalizeHeaderShortcuts(user.uiPreferences?.headerShortcuts)
                }
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
    const allowedFields = ['firstName', 'lastName', 'phone'];
    const updates = {};
    allowedFields.forEach(field => {
        if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    const submittedHeaderShortcuts = req.body?.uiPreferences?.headerShortcuts;
    if (submittedHeaderShortcuts !== undefined) {
        updates['uiPreferences.headerShortcuts'] = normalizeHeaderShortcuts(submittedHeaderShortcuts);
    }

    const userToUpdate = await User.findById(req.user._id);

    // Handle avatar upload if present
    if (req.file) {
        // Delete old avatar if it exists and is stored in Firebase
        if (userToUpdate.avatar && userToUpdate.avatar.includes('storage.googleapis.com')) {
            await deleteFile(userToUpdate.avatar);
        }

        const destinationPath = `schools/${userToUpdate.school || 'global'}/users/${userToUpdate._id}/avatar-${Date.now()}`;
        const newAvatarUrl = await uploadFile(req.file.buffer, req.file.mimetype, destinationPath);
        updates.avatar = newAvatarUrl;
    } else if (req.body.avatar === null || req.body.avatar === '') {
        // Allow removing avatar safely
        if (userToUpdate.avatar && userToUpdate.avatar.includes('storage.googleapis.com')) {
            await deleteFile(userToUpdate.avatar);
        }
        updates.avatar = null;
    }

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
    user.mustChangePassword = false;
    await user.save();
    await clearRefreshToken(user._id);

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
    const frontendUrl = getClientUrl();
    const resetUrl = `${frontendUrl}/reset-password?token=${encodeURIComponent(resetToken)}`;

    try {
        await sendPasswordResetEmail(user, resetUrl);

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
    user.mustChangePassword = false;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();
    await clearRefreshToken(user._id);

    res.json({
        success: true,
        message: 'Password reset successful'
    });
});

/**
 * @desc    Send password reset email
 * @param   {Object} user - User document
 * @param   {string} resetUrl - Password reset URL
 */
const sendPasswordResetEmail = async (user, resetUrl) => {
    if (!user?.email) {
        throw new Error('Cannot send password reset email without a valid recipient');
    }

    const subject = 'Password Reset Request';
    const text = `You requested a password reset. Use the link below within 10 minutes:\n\n${resetUrl}\n\nIf you did not request this reset, you can ignore this email.`;
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2>Password Reset Request</h2>
            <p>You requested to reset your password. Click the link below to reset it:</p>
            <p style="margin: 24px 0;">
                <a href="${resetUrl}" style="background-color: #0d9488; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
                    Reset Password
                </a>
            </p>
            <p>This link expires in 10 minutes.</p>
            <p>If you did not request this, you can safely ignore this email.</p>
        </div>
    `;

    await sendTransactionalEmail({
        to: user.email,
        subject,
        text,
        html,
        schoolId: user.school,
        preferredUserId: user._id
    });
};

/**
 * @desc    Refresh access token
 * @route   POST /api/auth/refresh
 * @access  Public
 */
export const refresh = asyncHandler(async (req, res) => {
    const { refreshToken } = req.body || {};
    if (!refreshToken || typeof refreshToken !== 'string') {
        return res.status(400).json({
            success: false,
            message: 'Refresh token is required'
        });
    }

    let decoded;
    try {
        decoded = decodeRefreshToken(refreshToken);
    } catch {
        return res.status(401).json({
            success: false,
            message: 'Invalid refresh token'
        });
    }

    const user = await User.findById(decoded.id)
        .select('+refreshTokenHash +refreshTokenExpiresAt')
        .populate('school')
        .setOptions({ skipTenantFilter: true });

    if (!user || !user.isActive) {
        return res.status(401).json({
            success: false,
            message: 'Session is no longer valid'
        });
    }

    if (!isRefreshTokenValidForUser({ user, refreshToken })) {
        await clearRefreshToken(user._id);
        return res.status(401).json({
            success: false,
            message: 'Refresh token expired or revoked'
        });
    }

    const nextAccessToken = generateAccessToken(user);
    const nextRefreshToken = generateRefreshToken(user._id);
    await storeRefreshToken(user._id, nextRefreshToken);

    res.json({
        success: true,
        message: 'Token refreshed',
        data: {
            token: nextAccessToken,
            refreshToken: nextRefreshToken
        }
    });
});

/**
 * @desc    Logout user (client-side token removal)
 * @route   POST /api/auth/logout
 * @access  Private
 */
export const logout = asyncHandler(async (req, res) => {
    await clearRefreshToken(req.user._id);
    res.json({
        success: true,
        message: 'Logged out successfully'
    });
});

/**
 * @desc    Switch active role for the current user
 * @route   POST /api/auth/switch-role
 * @access  Private
 */
export const switchRole = asyncHandler(async (req, res) => {
    const { role } = req.body;

    if (!role) {
        return res.status(400).json({ success: false, message: 'Role is required' });
    }

    const user = await User.findById(req.user._id).populate('school').populate('department', 'name type');

    if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Build the effective roles list (roles array OR fallback to [role])
    const availableRoles = user.roles?.length ? user.roles : [user.role];

    if (!availableRoles.includes(role)) {
        return res.status(403).json({
            success: false,
            message: `Role '${role}' is not assigned to this user`
        });
    }

    // Update active role
    user.role = role;
    await user.save({ validateBeforeSave: false });

    // Reload teacher profile if switching to teacher
    let profile = null;
    if (role === 'teacher') {
        profile = await Teacher.findOne({ user: user._id })
            .populate('subjects', 'name code')
            .populate('assignedClasses.class', 'name grade section')
            .populate('assignedClasses.subject', 'name code');
    }

    // Generate fresh token with updated role context
    const token = generateAccessToken(user);

    res.json({
        success: true,
        message: `Switched to ${role} role`,
        data: {
            user: {
                id: user._id,
                _id: user._id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                fullName: user.fullName,
                title: user.title,
                titles: user.titles || [],
                role: user.role,
                roles: user.roles?.length ? user.roles : [user.role],
                school: user.school,
                department: user.department,
                phone: user.phone,
                avatar: user.avatar,
                lastLogin: user.lastLogin,
                permissions: user.permissions || [],
                permissionScopes: user.permissionScopes || {},
                uiPreferences: {
                    headerShortcuts: normalizeHeaderShortcuts(user.uiPreferences?.headerShortcuts)
                }
            },
            profile,
            token
        }
    });
});

/**
 * @desc    Impersonate a user (Super Admin only)
 * @route   POST /api/auth/impersonate
 * @access  Private (Super Admin)
 */
export const impersonateUser = asyncHandler(async (req, res) => {
    const { userId } = req.body;

    // Allow both super_admin and admin to impersonate
    if (req.user.role !== 'super_admin' && req.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    if (!userId) {
        return res.status(400).json({ success: false, message: 'User ID is required' });
    }

    const userToImpersonate = await User.findById(userId).populate('school');

    if (!userToImpersonate) {
        return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Admin can only impersonate users in their own school
    if (req.user.role === 'admin') {
        const adminSchoolId = req.user.school?._id || req.user.school;
        const targetSchoolId = userToImpersonate.school?._id || userToImpersonate.school;
        if (!adminSchoolId || !targetSchoolId || adminSchoolId.toString() !== targetSchoolId.toString()) {
            return res.status(403).json({ success: false, message: 'Cannot impersonate users from other schools' });
        }
        // Admin cannot impersonate other admins or super_admin
        if (['admin', 'super_admin'].includes(userToImpersonate.role)) {
            return res.status(403).json({ success: false, message: 'Cannot impersonate admin-level users' });
        }
    }

    // Log the impersonation action for auditing
    console.log(`AUDIT: ${req.user.role} '${req.user.email}' is impersonating user '${userToImpersonate.email}' (ID: ${userToImpersonate._id})`);

    // Generate token for the target user
    const token = generateAccessToken(userToImpersonate);

    res.json({
        success: true,
        message: `Successfully impersonating ${userToImpersonate.fullName}`,
        data: {
            user: {
                id: userToImpersonate._id,
                _id: userToImpersonate._id,
                email: userToImpersonate.email,
                firstName: userToImpersonate.firstName,
                lastName: userToImpersonate.lastName,
                fullName: userToImpersonate.fullName,
                role: userToImpersonate.role,
                roles: userToImpersonate.roles?.length ? userToImpersonate.roles : [userToImpersonate.role],
                titles: userToImpersonate.titles || [],
                school: userToImpersonate.school,
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
    const { schoolSlug, frontendOrigin } = req.query;

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
        resolveGoogleLoginRedirectUri(req)
    );

    // Step 2: Define what permissions (scopes) we need
    const scopes = [
        'https://www.googleapis.com/auth/userinfo.email',    // Get user's email
        'https://www.googleapis.com/auth/userinfo.profile',  // Get user's name & picture
        'https://www.googleapis.com/auth/gmail.send'         // Send emails on their behalf
    ];

    // Step 3: Prepare state with school context
    const statePayload = {};
    if (schoolSlug) statePayload.schoolSlug = schoolSlug;
    if (frontendOrigin) statePayload.frontendOrigin = resolveSafeClientUrl(frontendOrigin);
    const state = Object.keys(statePayload).length > 0 ? JSON.stringify(statePayload) : '';

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
    let state = {};
    try {
        state = JSON.parse(req.query.state || '{}');
    } catch {
        state = {};
    }
    const clientUrl = resolveSafeClientUrl(state.frontendOrigin);

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
            resolveGoogleLoginRedirectUri(req)
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
        if (state.schoolSlug) {
            const school = await School.findOne({ slug: state.schoolSlug, isActive: true });
            if (school) schoolId = school._id;
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
        user.mustChangePassword = false;
        await user.save();

        // Step 8: Update last login
        user.lastLogin = new Date();
        await user.save();

        // Step 9: Generate our own JWT token for the app
        const jwtToken = generateAccessToken(user);

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

        const branding = await getPlatformBranding();
        const appName = branding?.appName || 'School Platform';

        // Send email
        const mailOptions = {
            from: `"${user.firstName} via ${appName}" <${user.gmailTokens.email}>`,
            to: to || user.email,
            subject: subject || `Test Email from ${appName}`,
            text: message || `This is a test email sent using your Gmail account through ${appName}.`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h2 style="color: #0f172a;">✅ Test Email Successful!</h2>
                    <p>${message || `This is a test email sent using your Gmail account through ${appName}.`}</p>
                    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                    <p style="color: #334155; font-size: 12px;">
                        Sent from: ${user.gmailTokens.email}<br>
                        Sent via: ${appName} App
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
