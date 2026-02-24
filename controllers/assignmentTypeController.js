import AssignmentType from '../models/AssignmentType.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const DEFAULT_ASSIGNMENT_TYPES = [
    {
        key: 'homework',
        name: 'Homework',
        sortOrder: 10,
        defaults: { maxMarks: 10, allowLateSubmission: true, notifyOnAssign: true, notifyOnGrade: true }
    },
    {
        key: 'classwork',
        name: 'Classwork',
        sortOrder: 20,
        defaults: { maxMarks: 10, allowLateSubmission: false, notifyOnAssign: false, notifyOnGrade: true }
    },
    {
        key: 'quiz',
        name: 'Quiz',
        sortOrder: 30,
        defaults: { maxMarks: 20, allowLateSubmission: false, notifyOnAssign: false, notifyOnGrade: true }
    },
    {
        key: 'test',
        name: 'Test',
        sortOrder: 40,
        defaults: { maxMarks: 100, allowLateSubmission: false, notifyOnAssign: false, notifyOnGrade: true }
    },
    {
        key: 'project',
        name: 'Project',
        sortOrder: 50,
        defaults: { maxMarks: 100, allowLateSubmission: false, notifyOnAssign: true, notifyOnGrade: true }
    },
    {
        key: 'exam',
        name: 'Exam',
        sortOrder: 60,
        defaults: { maxMarks: 100, allowLateSubmission: false, notifyOnAssign: false, notifyOnGrade: true }
    },
    {
        key: 'other',
        name: 'Other',
        sortOrder: 999,
        defaults: { maxMarks: 10, allowLateSubmission: false, notifyOnAssign: false, notifyOnGrade: true }
    }
];

const toKey = (value = '') => String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const toBool = (value, fallback = false) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
        if (['false', '0', 'no', 'off'].includes(normalized)) return false;
    }
    return fallback;
};

const toPositiveNumber = (value, fallback) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return parsed;
};

const normalizeDefaults = (value = {}) => ({
    maxMarks: toPositiveNumber(value.maxMarks, 10),
    allowLateSubmission: toBool(value.allowLateSubmission, false),
    notifyOnAssign: toBool(value.notifyOnAssign, true),
    notifyOnGrade: toBool(value.notifyOnGrade, true)
});

export const ensureDefaultAssignmentTypes = async (schoolId, userId = null) => {
    const operations = DEFAULT_ASSIGNMENT_TYPES.map((item) => ({
        updateOne: {
            filter: { school: schoolId, key: item.key },
            update: {
                $setOnInsert: {
                    school: schoolId,
                    key: item.key,
                    name: item.name,
                    isSystem: true,
                    isActive: true,
                    sortOrder: item.sortOrder,
                    defaults: item.defaults,
                    createdBy: userId
                }
            },
            upsert: true
        }
    }));
    if (operations.length > 0) {
        await AssignmentType.bulkWrite(operations, { ordered: false });
    }
};

const mapType = (row) => ({
    id: row._id,
    key: row.key,
    name: row.name,
    description: row.description || '',
    isSystem: row.isSystem === true,
    isActive: row.isActive !== false,
    sortOrder: Number(row.sortOrder || 0),
    defaults: {
        maxMarks: Number(row.defaults?.maxMarks || 10),
        allowLateSubmission: row.defaults?.allowLateSubmission === true,
        notifyOnAssign: row.defaults?.notifyOnAssign !== false,
        notifyOnGrade: row.defaults?.notifyOnGrade !== false
    }
});

export const getAssignmentTypes = asyncHandler(async (req, res) => {
    await ensureDefaultAssignmentTypes(req.schoolId, req.user._id);

    const includeInactive = toBool(req.query.includeInactive, false);
    const query = { school: req.schoolId };
    if (!includeInactive) query.isActive = true;

    const rows = await AssignmentType.find(query)
        .sort({ sortOrder: 1, name: 1 })
        .lean();

    res.json({
        success: true,
        data: {
            items: rows.map(mapType)
        }
    });
});

export const createAssignmentType = asyncHandler(async (req, res) => {
    await ensureDefaultAssignmentTypes(req.schoolId, req.user._id);

    const body = req.body || {};
    const name = String(body.name || '').trim();
    const requestedKey = toKey(body.key || name);
    if (!name || !requestedKey) {
        return res.status(400).json({
            success: false,
            message: 'name is required'
        });
    }

    const exists = await AssignmentType.findOne({
        school: req.schoolId,
        key: requestedKey
    })
        .select('_id')
        .lean();
    if (exists) {
        return res.status(409).json({
            success: false,
            message: `Assignment type "${requestedKey}" already exists`
        });
    }

    const created = await AssignmentType.create({
        school: req.schoolId,
        key: requestedKey,
        name,
        description: String(body.description || '').trim(),
        isSystem: false,
        isActive: body.isActive === undefined ? true : toBool(body.isActive, true),
        sortOrder: Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : 1000,
        defaults: normalizeDefaults(body.defaults || {}),
        createdBy: req.user._id
    });

    res.status(201).json({
        success: true,
        data: {
            item: mapType(created)
        }
    });
});

export const updateAssignmentType = asyncHandler(async (req, res) => {
    const row = await AssignmentType.findOne({
        _id: req.params.id,
        school: req.schoolId
    });
    if (!row) {
        return res.status(404).json({
            success: false,
            message: 'Assignment type not found'
        });
    }

    const body = req.body || {};
    if (body.name !== undefined) {
        const name = String(body.name || '').trim();
        if (!name) {
            return res.status(400).json({
                success: false,
                message: 'name cannot be empty'
            });
        }
        row.name = name;
    }

    if (body.description !== undefined) {
        row.description = String(body.description || '').trim();
    }

    if (body.isActive !== undefined) {
        row.isActive = toBool(body.isActive, true);
    }

    if (body.sortOrder !== undefined && Number.isFinite(Number(body.sortOrder))) {
        row.sortOrder = Number(body.sortOrder);
    }

    if (body.defaults !== undefined && body.defaults && typeof body.defaults === 'object') {
        row.defaults = normalizeDefaults({
            ...row.defaults?.toObject?.(),
            ...body.defaults
        });
    }

    await row.save();

    res.json({
        success: true,
        data: {
            item: mapType(row)
        }
    });
});
