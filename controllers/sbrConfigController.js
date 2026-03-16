import SBRScale from '../models/SBRScale.js';
import SBRReportCard from '../models/SBRReportCard.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { ensureDefaultSBRScale } from '../services/sbrService.js';

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

const normalizeLevels = (inputLevels = []) => {
    if (!Array.isArray(inputLevels) || inputLevels.length === 0) {
        throw new Error('levels is required and must contain at least one level');
    }

    const normalized = inputLevels.map((level, index) => {
        const value = toNumber(level?.value);
        const minPercent = toNumber(level?.minPercent);
        const maxPercent = toNumber(level?.maxPercent);
        const label = String(level?.label || '').trim();

        if (value === null) throw new Error(`levels[${index}].value must be numeric`);
        if (!label) throw new Error(`levels[${index}].label is required`);
        if (minPercent === null || minPercent < 0 || minPercent > 100) {
            throw new Error(`levels[${index}].minPercent must be between 0 and 100`);
        }
        if (maxPercent === null || maxPercent < 0 || maxPercent > 100) {
            throw new Error(`levels[${index}].maxPercent must be between 0 and 100`);
        }
        if (minPercent > maxPercent) {
            throw new Error(`levels[${index}] has minPercent greater than maxPercent`);
        }

        return {
            value,
            label,
            labelAr: String(level?.labelAr || '').trim(),
            description: String(level?.description || '').trim(),
            minPercent,
            maxPercent,
            color: String(level?.color || '').trim()
        };
    });

    const seenValues = new Set();
    for (const level of normalized) {
        if (seenValues.has(level.value)) {
            throw new Error(`Duplicate level value: ${level.value}`);
        }
        seenValues.add(level.value);
    }

    return normalized.sort((a, b) => b.value - a.value);
};

const normalizeSpecialCodes = (inputCodes = []) => {
    if (!Array.isArray(inputCodes) || inputCodes.length === 0) {
        return [{ code: 'NA', label: 'Not Assessed', labelAr: '' }];
    }

    const normalized = inputCodes.map((row, index) => {
        const code = String(row?.code || '').trim().toUpperCase();
        const label = String(row?.label || '').trim();

        if (!code) throw new Error(`specialCodes[${index}].code is required`);
        if (!label) throw new Error(`specialCodes[${index}].label is required`);

        return {
            code,
            label,
            labelAr: String(row?.labelAr || '').trim()
        };
    });

    const seenCodes = new Set();
    for (const item of normalized) {
        if (seenCodes.has(item.code)) {
            throw new Error(`Duplicate special code: ${item.code}`);
        }
        seenCodes.add(item.code);
    }

    return normalized;
};

const mapScale = (item) => ({
    id: item._id,
    name: item.name,
    description: item.description || '',
    isDefault: item.isDefault === true,
    isActive: item.isActive !== false,
    levels: (item.levels || []).map((level) => ({
        value: Number(level.value),
        label: level.label,
        labelAr: level.labelAr || '',
        description: level.description || '',
        minPercent: Number(level.minPercent),
        maxPercent: Number(level.maxPercent),
        color: level.color || ''
    })),
    specialCodes: (item.specialCodes || []).map((code) => ({
        code: code.code,
        label: code.label,
        labelAr: code.labelAr || ''
    })),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
});

export const getScales = asyncHandler(async (req, res) => {
    await ensureDefaultSBRScale(req.schoolId, req.user?._id || null);

    const includeInactive = toBool(req.query.includeInactive, false);
    const query = { school: req.schoolId };
    if (!includeInactive) query.isActive = true;

    const items = await SBRScale.find(query)
        .sort({ isDefault: -1, updatedAt: -1 })
        .lean();

    res.json({
        success: true,
        data: {
            items: items.map(mapScale)
        }
    });
});

export const createScale = asyncHandler(async (req, res) => {
    await ensureDefaultSBRScale(req.schoolId, req.user?._id || null);

    const body = req.body || {};
    const name = String(body.name || '').trim();
    if (!name) {
        return res.status(400).json({ success: false, message: 'name is required' });
    }

    const levels = normalizeLevels(body.levels);
    const specialCodes = normalizeSpecialCodes(body.specialCodes);
    const isDefault = toBool(body.isDefault, false);

    if (isDefault) {
        await SBRScale.updateMany({ school: req.schoolId, isDefault: true }, { $set: { isDefault: false } });
    }

    const created = await SBRScale.create({
        school: req.schoolId,
        name,
        description: String(body.description || '').trim(),
        isDefault,
        isActive: body.isActive === undefined ? true : toBool(body.isActive, true),
        createdBy: req.user?._id || null,
        levels,
        specialCodes
    });

    res.status(201).json({
        success: true,
        data: {
            item: mapScale(created)
        }
    });
});

export const updateScale = asyncHandler(async (req, res) => {
    const scale = await SBRScale.findOne({ _id: req.params.id, school: req.schoolId });
    if (!scale) {
        return res.status(404).json({ success: false, message: 'Scale not found' });
    }

    const body = req.body || {};

    if (body.name !== undefined) {
        const name = String(body.name || '').trim();
        if (!name) {
            return res.status(400).json({ success: false, message: 'name cannot be empty' });
        }
        scale.name = name;
    }

    if (body.description !== undefined) {
        scale.description = String(body.description || '').trim();
    }

    if (body.isActive !== undefined) {
        const nextIsActive = toBool(body.isActive, true);
        if (scale.isDefault && !nextIsActive) {
            return res.status(400).json({ success: false, message: 'Default scale cannot be inactive' });
        }
        scale.isActive = nextIsActive;
    }

    if (body.levels !== undefined) {
        scale.levels = normalizeLevels(body.levels);
    }

    if (body.specialCodes !== undefined) {
        scale.specialCodes = normalizeSpecialCodes(body.specialCodes);
    }

    if (toBool(body.isDefault, false) && !scale.isDefault) {
        await SBRScale.updateMany({ school: req.schoolId, isDefault: true }, { $set: { isDefault: false } });
        scale.isDefault = true;
        scale.isActive = true;
    }

    await scale.save();

    res.json({
        success: true,
        data: {
            item: mapScale(scale)
        }
    });
});

export const deleteScale = asyncHandler(async (req, res) => {
    const scale = await SBRScale.findOne({ _id: req.params.id, school: req.schoolId });
    if (!scale) {
        return res.status(404).json({ success: false, message: 'Scale not found' });
    }

    if (scale.isDefault) {
        return res.status(400).json({ success: false, message: 'Default scale cannot be deleted' });
    }

    const usage = await SBRReportCard.countDocuments({ school: req.schoolId, scale: scale._id });
    if (usage > 0) {
        return res.status(400).json({
            success: false,
            message: 'Scale cannot be deleted because it is already used in report cards'
        });
    }

    await scale.deleteOne();

    res.json({ success: true, message: 'Scale deleted successfully' });
});

export const setDefaultScale = asyncHandler(async (req, res) => {
    const scale = await SBRScale.findOne({ _id: req.params.id, school: req.schoolId });
    if (!scale) {
        return res.status(404).json({ success: false, message: 'Scale not found' });
    }

    await SBRScale.updateMany({ school: req.schoolId, isDefault: true }, { $set: { isDefault: false } });

    scale.isDefault = true;
    scale.isActive = true;
    await scale.save();

    res.json({
        success: true,
        data: {
            item: mapScale(scale)
        }
    });
});
