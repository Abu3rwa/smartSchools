import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import { superAdminOnly } from '../middleware/tenantIsolation.js';
import User from '../models/User.js';
import logger from '../utils/logger.js';

const router = express.Router();

router.use(protect);
router.use(superAdminOnly);

/**
 * @route   GET /api/users
 * @desc    List all users across all schools (super_admin only)
 * @access  Private (super_admin)
 */
router.get('/', async (req, res) => {
    try {
        const users = await User.find()
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

export default router;
