import GradingScale from '../models/GradingScale.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { gradingScaleDefaults } from '../services/gradingScaleEngine.js';

const DEFAULT_GRADING_SCALE_KEY = 'default-grading-scale';
const DEFAULT_GRADING_SCALE_BANDS = gradingScaleDefaults.bands;
const DEFAULT_SPECIAL_CODES = gradingScaleDefaults.specialCodes;

const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}){1,2}$/;

const toKey = (value = '') => String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const toBool = (value, fallback = false) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
        if (['false', '0', 'no', 'off'].includes(normalized)) return false;
    }
    return fallback;
};

const toNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};

const normalizeBands = (bandsInput, fallbackBands = DEFAULT_GRADING_SCALE_BANDS) => {
    const source = Array.isArray(bandsInput) && bandsInput.length > 0 ? bandsInput : fallbackBands;
    if (!Array.isArray(source) || source.length === 0) {
        throw new Error('At least one grading band is required');
    }

    const normalized = source.map((band, index) => {
        const grade = String(band?.grade || '').trim().toUpperCase();
        const min = toNumber(band?.min);
        const max = toNumber(band?.max);
        const color = String(band?.color || '').trim();

        if (!grade) throw new Error(`bands[${index}].grade is required`);
        if (min === null) throw new Error(`bands[${index}].min must be numeric`);
        if (max === null) throw new Error(`bands[${index}].max must be numeric`);
        if (min < 0 || min > 100) throw new Error(`bands[${index}].min must be between 0 and 100`);
        if (max < 0 || max > 100) throw new Error(`bands[${index}].max must be between 0 and 100`);
        if (min > max) throw new Error(`bands[${index}] has min greater than max`);
        if (!HEX_COLOR_PATTERN.test(color)) throw new Error(`bands[${index}].color must be a valid hex color`);

        return { grade, min, max, color };
    });

    for (let i = 0; i < normalized.length; i += 1) {
        for (let j = i + 1; j < normalized.length; j += 1) {
            const a = normalized[i];
            const b = normalized[j];
            const overlaps = Math.max(a.min, b.min) <= Math.min(a.max, b.max);
            if (overlaps) {
                throw new Error(`Grade ranges overlap: ${a.grade} (${a.min}-${a.max}) and ${b.grade} (${b.min}-${b.max})`);
            }
        }
    }

    return normalized.sort((a, b) => b.min - a.min || b.max - a.max);
};

const normalizeSpecialCodes = (specialCodesInput, fallbackCodes = DEFAULT_SPECIAL_CODES) => {
    const source = Array.isArray(specialCodesInput) && specialCodesInput.length > 0
        ? specialCodesInput
        : fallbackCodes;

    const normalized = source.map((item, index) => {
        const code = String(item?.code || '').trim().toUpperCase();
        const label = String(item?.label || '').trim();
        if (!code) throw new Error(`specialCodes[${index}].code is required`);
        if (!label) throw new Error(`specialCodes[${index}].label is required`);
        return {
            code,
            label,
            countsAsZero: toBool(item?.countsAsZero, false),
            excludeFromAverage: toBool(item?.excludeFromAverage, true)
        };
    });

    const seen = new Set();
    normalized.forEach((item) => {
        if (seen.has(item.code)) {
            throw new Error(`Duplicate special code: ${item.code}`);
        }
        seen.add(item.code);
    });

    return normalized;
};

const mapScale = (row) => ({
    id: row._id,
    key: row.key,
    name: row.name,
    description: row.description || '',
    isSystem: row.isSystem === true,
    isActive: row.isActive !== false,
    isDefault: row.isDefault === true,
    sortOrder: Number(row.sortOrder || 0),
    bands: (row.bands || []).map((band) => ({
        grade: band.grade,
        min: Number(band.min),
        max: Number(band.max),
        color: band.color
    })),
    specialCodes: (row.specialCodes || []).map((item) => ({
        code: item.code,
        label: item.label,
        countsAsZero: item.countsAsZero === true,
        excludeFromAverage: item.excludeFromAverage !== false
    })),
    updatedAt: row.updatedAt
});

export const ensureDefaultGradingScale = async (schoolId, userId = null) => {
    const existing = await GradingScale.findOne({ school: schoolId, key: DEFAULT_GRADING_SCALE_KEY })
        .select('_id')
        .lean();
    if (existing) return;

    const existingDefault = await GradingScale.findOne({ school: schoolId, isDefault: true })
        .select('_id')
        .lean();

    await GradingScale.create({
        school: schoolId,
        key: DEFAULT_GRADING_SCALE_KEY,
        name: 'Default Grading Scale',
        description: 'System default grading scale',
        isSystem: true,
        isActive: true,
        isDefault: !existingDefault,
        sortOrder: 1,
        bands: DEFAULT_GRADING_SCALE_BANDS,
        specialCodes: DEFAULT_SPECIAL_CODES,
        createdBy: userId
    });
};

export const getGradingScales = asyncHandler(async (req, res) => {
    await ensureDefaultGradingScale(req.schoolId, req.user._id);

    const includeInactive = toBool(req.query.includeInactive, false);
    const query = { school: req.schoolId };
    if (!includeInactive) query.isActive = true;

    const items = await GradingScale.find(query)
        .sort({ isDefault: -1, sortOrder: 1, name: 1 })
        .lean();

    res.json({
        success: true,
        data: {
            items: items.map(mapScale)
        }
    });
});

export const getActiveGradingScale = asyncHandler(async (req, res) => {
    await ensureDefaultGradingScale(req.schoolId, req.user._id);

    let item = await GradingScale.findOne({
        school: req.schoolId,
        isDefault: true,
        isActive: true
    }).lean();

    if (!item) {
        item = await GradingScale.findOne({ school: req.schoolId, isActive: true })
            .sort({ sortOrder: 1, name: 1 })
            .lean();
    }

    res.json({
        success: true,
        data: {
            item: item ? mapScale(item) : null
        }
    });
});

export const createGradingScale = asyncHandler(async (req, res) => {
    await ensureDefaultGradingScale(req.schoolId, req.user._id);

    const body = req.body || {};
    const name = String(body.name || '').trim();
    const key = toKey(body.key || name);
    if (!name || !key) {
        return res.status(400).json({
            success: false,
            message: 'name is required'
        });
    }

    const existing = await GradingScale.findOne({ school: req.schoolId, key }).select('_id').lean();
    if (existing) {
        return res.status(409).json({
            success: false,
            message: `Grading scale "${key}" already exists`
        });
    }

    const bands = normalizeBands(body.bands, DEFAULT_GRADING_SCALE_BANDS);
    const specialCodes = normalizeSpecialCodes(body.specialCodes, DEFAULT_SPECIAL_CODES);
    const isDefault = toBool(body.isDefault, false);

    if (isDefault) {
        await GradingScale.updateMany({ school: req.schoolId, isDefault: true }, { $set: { isDefault: false } });
    }

    const created = await GradingScale.create({
        school: req.schoolId,
        key,
        name,
        description: String(body.description || '').trim(),
        isSystem: false,
        isActive: body.isActive === undefined ? true : toBool(body.isActive, true),
        isDefault,
        sortOrder: Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : 100,
        bands,
        specialCodes,
        createdBy: req.user._id
    });

    res.status(201).json({
        success: true,
        data: {
            item: mapScale(created)
        }
    });
});

export const updateGradingScale = asyncHandler(async (req, res) => {
    await ensureDefaultGradingScale(req.schoolId, req.user._id);

    const row = await GradingScale.findOne({ _id: req.params.id, school: req.schoolId });
    if (!row) {
        return res.status(404).json({
            success: false,
            message: 'Grading scale not found'
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
        const nextIsActive = toBool(body.isActive, true);
        if (!nextIsActive && row.isDefault) {
            return res.status(400).json({
                success: false,
                message: 'Default grading scale cannot be inactive'
            });
        }
        row.isActive = nextIsActive;
    }

    if (body.sortOrder !== undefined && Number.isFinite(Number(body.sortOrder))) {
        row.sortOrder = Number(body.sortOrder);
    }

    if (body.bands !== undefined) {
        row.bands = normalizeBands(body.bands, row.bands || DEFAULT_GRADING_SCALE_BANDS);
    }

    if (body.specialCodes !== undefined) {
        row.specialCodes = normalizeSpecialCodes(body.specialCodes, row.specialCodes || DEFAULT_SPECIAL_CODES);
    }

    if (toBool(body.isDefault, false) && !row.isDefault) {
        await GradingScale.updateMany({ school: req.schoolId, isDefault: true }, { $set: { isDefault: false } });
        row.isDefault = true;
        row.isActive = true;
    }

    await row.save();

    res.json({
        success: true,
        data: {
            item: mapScale(row)
        }
    });
});

export const setDefaultGradingScale = asyncHandler(async (req, res) => {
    await ensureDefaultGradingScale(req.schoolId, req.user._id);

    const row = await GradingScale.findOne({ _id: req.params.id, school: req.schoolId });
    if (!row) {
        return res.status(404).json({
            success: false,
            message: 'Grading scale not found'
        });
    }

    await GradingScale.updateMany({ school: req.schoolId, isDefault: true }, { $set: { isDefault: false } });
    row.isDefault = true;
    row.isActive = true;
    await row.save();

    res.json({
        success: true,
        data: {
            item: mapScale(row)
        }
    });
});

export const deleteGradingScale = asyncHandler(async (req, res) => {
    await ensureDefaultGradingScale(req.schoolId, req.user._id);

    const row = await GradingScale.findOne({ _id: req.params.id, school: req.schoolId });
    if (!row) {
        return res.status(404).json({
            success: false,
            message: 'Grading scale not found'
        });
    }

    if (row.isSystem) {
        return res.status(400).json({
            success: false,
            message: 'System grading scale cannot be deleted'
        });
    }

    if (row.isDefault) {
        return res.status(400).json({
            success: false,
            message: 'Default grading scale cannot be deleted. Set another scale as default first.'
        });
    }

    await row.deleteOne();
    res.json({
        success: true,
        message: 'Grading scale deleted successfully'
    });
});
