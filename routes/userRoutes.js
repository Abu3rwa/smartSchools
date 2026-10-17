import express from 'express';
import mongoose from 'mongoose';
import { randomBytes } from 'node:crypto';
import { protect } from '../middleware/auth.js';
import { superAdminOnly } from '../middleware/tenantIsolation.js';
import User from '../models/User.js';
import Student from '../models/Student.js';
import Teacher from '../models/Teacher.js';
import Class from '../models/Class.js';
import TeacherPeriodAssignment from '../models/TeacherPeriodAssignment.js';
import {
    buildStudentAccountRemovalUpdate,
    buildTeacherAccountRemovalUpdate,
} from '../services/accountRemovalService.js';
import logger from '../utils/logger.js';

const router = express.Router();

router.use(protect);
router.use(superAdminOnly);

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * @route   GET /api/users
 * @desc    List all users across all schools (super_admin only)
 * @access  Private (super_admin)
 */
router.get('/', async (req, res) => {
    try {
        const users = await User.find()
            .where({ accountRemovedAt: null })
            .populate('school', 'name slug')
            .select('firstName lastName email role isActive school createdAt')
            .setOptions({ skipTenantFilter: true })
            .sort({ createdAt: -1 });

        res.json({ success: true, data: users });
    } catch (error) {
        logger.error('Error fetching users:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch users' });
    }
});

/**
 * Permanently release an account email while retaining anonymized school
 * profiles and historical records. Cross-school removal is super-admin-only.
 */
router.delete('/:id', async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ success: false, message: 'Invalid user ID.' });
    }

    const transaction = await mongoose.startSession();
    try {
        let removedEmail = '';
        let removedSchoolId = null;
        await transaction.withTransaction(async () => {
            const user = await User.findById(req.params.id)
                .select('+password +accountRemovedAt')
                .setOptions({ skipTenantFilter: true })
                .session(transaction);
            if (!user) {
                const error = new Error('User account not found.');
                error.statusCode = 404;
                throw error;
            }
            if (user.accountRemovedAt) {
                const error = new Error('This account has already been permanently removed.');
                error.statusCode = 409;
                throw error;
            }
            const assignedRoles = Array.isArray(user.roles) ? user.roles : [];
            if (
                user.role === 'super_admin' ||
                assignedRoles.includes('super_admin') ||
                String(user._id) === String(req.user._id)
            ) {
                const error = new Error('Super admin accounts and your own account cannot be removed here.');
                error.statusCode = 400;
                throw error;
            }

            const confirmEmail = String(req.body?.confirmEmail || '').trim().toLowerCase();
            if (!confirmEmail || confirmEmail !== String(user.email || '').toLowerCase()) {
                const error = new Error('Enter the account email exactly to confirm permanent removal.');
                error.statusCode = 400;
                throw error;
            }

            const schoolId = user.school;
            removedSchoolId = schoolId ? String(schoolId) : null;
            removedEmail = user.email;
            const linkedStudents = await Student.find({
                user: user._id,
                ...(schoolId ? { school: schoolId } : {}),
            }).select('_id').session(transaction);
            const linkedTeachers = await Teacher.find({
                user: user._id,
                ...(schoolId ? { school: schoolId } : {}),
            }).select('_id').session(transaction);

            if (linkedStudents.length) {
                await Student.updateMany(
                    { _id: { $in: linkedStudents.map((student) => student._id) } },
                    buildStudentAccountRemovalUpdate(),
                    { session: transaction },
                );
            }

            if (schoolId && removedEmail) {
                await Student.updateMany(
                    {
                        school: schoolId,
                        $or: [
                            { email: removedEmail },
                            { studentEmail: removedEmail },
                            { 'parentInfo.fatherEmail': new RegExp(`^${escapeRegex(removedEmail)}$`, 'i') },
                            { 'parentInfo.motherEmail': new RegExp(`^${escapeRegex(removedEmail)}$`, 'i') },
                            { 'parentInfo.guardianEmail': new RegExp(`^${escapeRegex(removedEmail)}$`, 'i') },
                        ],
                    },
                    {
                        $unset: {
                            email: 1,
                            studentEmail: 1,
                            'parentInfo.fatherEmail': 1,
                            'parentInfo.motherEmail': 1,
                            'parentInfo.guardianEmail': 1,
                        },
                    },
                    { session: transaction },
                );
            }

            if (linkedTeachers.length) {
                const teacherIds = linkedTeachers.map((teacher) => teacher._id);
                for (const teacherId of teacherIds) {
                    await Teacher.updateOne(
                        { _id: teacherId },
                        buildTeacherAccountRemovalUpdate(teacherId),
                        { session: transaction },
                    );
                }
                await Class.updateMany(
                    { classTeacher: { $in: teacherIds } },
                    { $unset: { classTeacher: 1 } },
                    { session: transaction },
                );
                await Class.updateMany(
                    { 'subjects.teacher': { $in: teacherIds } },
                    { $pull: { subjects: { teacher: { $in: teacherIds } } } },
                    { session: transaction },
                );
                await TeacherPeriodAssignment.deleteMany(
                    { teacher: user._id },
                    { session: transaction },
                );
            }

            let replacementEmail = `removed-${user._id}@example.com`;
            if (await User.exists({ email: replacementEmail }).setOptions({ skipTenantFilter: true }).session(transaction)) {
                replacementEmail = `removed-${user._id}-${randomBytes(6).toString('hex')}@example.com`;
            }
            user.email = replacementEmail;
            user.firstName = 'Former';
            user.lastName = 'Account';
            user.password = randomBytes(48).toString('hex');
            user.isActive = false;
            user.mustChangePassword = true;
            user.passwordResetToken = undefined;
            user.passwordResetExpires = undefined;
            user.refreshTokenHash = null;
            user.refreshTokenExpiresAt = null;
            user.failedLoginAttempts = 0;
            user.lockedUntil = null;
            user.lastLogin = undefined;
            user.loginInvite = undefined;
            user.accountRemovedAt = new Date();
            user.accountRemovedBy = req.user._id;
            user.gmailTokens = {
                email: null,
                accessToken: null,
                refreshToken: null,
                grantedScopes: [],
                reauthorizationRequired: false,
                expiryDate: null,
                isActive: false,
            };
            user.googleDriveTokens = {
                email: null,
                accessToken: null,
                refreshToken: null,
                expiryDate: null,
                isActive: false,
            };
            user.googleClassroomTokens = {
                email: null,
                accessToken: null,
                refreshToken: null,
                scopes: [],
                expiryDate: null,
                isActive: false,
            };
            user.googleFormsTokens = {
                email: null,
                accessToken: null,
                refreshToken: null,
                scopes: [],
                oauthClientId: null,
                expiryDate: null,
                isActive: false,
            };
            await user.save({ session: transaction });
        });

        logger.info('super_admin_account_permanently_removed', {
            userId: req.params.id,
            schoolId: removedSchoolId,
            actorUserId: String(req.user._id),
        });
        return res.json({
            success: true,
            message: 'Account login removed and linked profiles anonymized. Historical school records were preserved.',
            data: { releasedEmail: removedEmail },
        });
    } catch (error) {
        logger.error('super_admin_account_removal_failed', {
            userId: req.params.id,
            actorUserId: String(req.user._id),
            error: error.message,
        });
        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.statusCode ? error.message : 'Account could not be permanently removed.',
        });
    } finally {
        await transaction.endSession();
    }
});

export default router;
