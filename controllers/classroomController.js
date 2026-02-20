import { asyncHandler } from '../middleware/errorHandler.js';
import Room from '../models/Room.js';

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const ROOM_TYPES = new Set([
    'classroom', 'lab', 'lecture_hall', 'conference_room', 'library', 'gym', 'auditorium', 'office', 'other'
]);
const ROOM_STATUSES = new Set(['active', 'maintenance', 'renovation', 'closed']);
const MAINTENANCE_TYPES = new Set(['cleaning', 'repair', 'renovation', 'inspection']);
const ROOM_EQUIPMENT = new Set([
    'projector', 'smart_board', 'whiteboard', 'blackboard', 'computer', 'laptop',
    'microscope', 'bunsen_burner', 'safety_equipment', 'video_conference',
    'audio_system', 'wifi', 'air_conditioning', 'heating', 'wheelchair_accessible'
]);

const normalizeString = (value, maxLength) => {
    if (value === undefined || value === null) return undefined;
    const normalized = String(value).trim();
    if (!normalized) return '';
    return maxLength ? normalized.slice(0, maxLength) : normalized;
};

const normalizeInteger = (value) => {
    if (value === undefined || value === null || value === '') return undefined;
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) ? parsed : null;
};

const normalizeBoolean = (value) => {
    if (value === undefined) return undefined;
    if (typeof value === 'boolean') return value;
    if (value === 'true') return true;
    if (value === 'false') return false;
    return null;
};

const normalizeAvailabilitySchedule = (value) => {
    if (value === undefined) return { value: undefined, errors: [] };
    if (!Array.isArray(value)) return { value: undefined, errors: ['availabilitySchedule must be an array'] };

    const errors = [];
    const normalized = value.map((entry, index) => {
        const dayOfWeek = normalizeInteger(entry?.dayOfWeek);
        const openTime = normalizeString(entry?.openTime, 5);
        const closeTime = normalizeString(entry?.closeTime, 5);
        const isClosed = normalizeBoolean(entry?.isClosed);

        if (dayOfWeek === null || dayOfWeek < 0 || dayOfWeek > 6) {
            errors.push(`availabilitySchedule[${index}].dayOfWeek must be between 0 and 6`);
        }
        if (openTime && !TIME_PATTERN.test(openTime)) {
            errors.push(`availabilitySchedule[${index}].openTime must be HH:MM`);
        }
        if (closeTime && !TIME_PATTERN.test(closeTime)) {
            errors.push(`availabilitySchedule[${index}].closeTime must be HH:MM`);
        }
        if (!openTime && isClosed !== true) {
            errors.push(`availabilitySchedule[${index}].openTime is required when day is open`);
        }
        if (!closeTime && isClosed !== true) {
            errors.push(`availabilitySchedule[${index}].closeTime is required when day is open`);
        }
        if (isClosed === null) {
            errors.push(`availabilitySchedule[${index}].isClosed must be boolean when provided`);
        }

        return {
            dayOfWeek,
            openTime,
            closeTime,
            isClosed: isClosed === undefined ? false : isClosed
        };
    });

    return {
        value: errors.length > 0 ? undefined : normalized,
        errors
    };
};

const normalizeMaintenanceSchedule = (value) => {
    if (value === undefined) return { value: undefined, errors: [] };
    if (!Array.isArray(value)) return { value: undefined, errors: ['maintenanceSchedule must be an array'] };

    const errors = [];
    const normalized = value.map((entry, index) => {
        const startDate = entry?.startDate ? new Date(entry.startDate) : null;
        const endDate = entry?.endDate ? new Date(entry.endDate) : null;
        const type = normalizeString(entry?.type, 32);
        const description = normalizeString(entry?.description, 500);
        const contractor = normalizeString(entry?.contractor, 200);

        if (!startDate || Number.isNaN(startDate.getTime())) {
            errors.push(`maintenanceSchedule[${index}].startDate is invalid`);
        }
        if (!endDate || Number.isNaN(endDate.getTime())) {
            errors.push(`maintenanceSchedule[${index}].endDate is invalid`);
        }
        if (startDate && endDate && startDate > endDate) {
            errors.push(`maintenanceSchedule[${index}] startDate must be before endDate`);
        }
        if (!type || !MAINTENANCE_TYPES.has(type)) {
            errors.push(`maintenanceSchedule[${index}].type is invalid`);
        }

        return { startDate, endDate, type, description, contractor };
    });

    return {
        value: errors.length > 0 ? undefined : normalized,
        errors
    };
};

const buildRoomPayload = (body = {}, { partial = false } = {}) => {
    const errors = [];
    const payload = {};

    const name = normalizeString(body.name, 100);
    if (!partial || body.name !== undefined) {
        if (!name) errors.push('name is required');
        else payload.name = name;
    }

    const type = normalizeString(body.type, 32);
    if (!partial || body.type !== undefined) {
        if (!type || !ROOM_TYPES.has(type)) errors.push('type is invalid');
        else payload.type = type;
    }

    const capacity = normalizeInteger(body.capacity);
    if (!partial || body.capacity !== undefined) {
        if (capacity === null || capacity < 1 || capacity > 1000) errors.push('capacity must be between 1 and 1000');
        else payload.capacity = capacity;
    }

    const isAvailable = normalizeBoolean(body.isAvailable);
    if (body.isAvailable !== undefined) {
        if (isAvailable === null) errors.push('isAvailable must be boolean');
        else payload.isAvailable = isAvailable;
    } else if (!partial) {
        payload.isAvailable = true;
    }

    const status = normalizeString(body.status, 32);
    if (body.status !== undefined) {
        if (!status || !ROOM_STATUSES.has(status)) errors.push('status is invalid');
        else payload.status = status;
    } else if (!partial) {
        payload.status = 'active';
    }

    const building = normalizeString(body.building, 100);
    if (body.building !== undefined) payload.building = building;
    const floor = normalizeString(body.floor, 50);
    if (body.floor !== undefined) payload.floor = floor;
    const number = normalizeString(body.number, 20);
    if (body.number !== undefined) payload.number = number;
    const notes = normalizeString(body.notes, 1000);
    if (body.notes !== undefined) payload.notes = notes;

    if (body.equipment !== undefined) {
        if (!Array.isArray(body.equipment)) {
            errors.push('equipment must be an array');
        } else {
            const normalizedEquipment = body.equipment
                .map((item) => normalizeString(item, 64))
                .filter(Boolean);
            const invalidEquipment = normalizedEquipment.filter((item) => !ROOM_EQUIPMENT.has(item));
            if (invalidEquipment.length > 0) {
                errors.push(`equipment contains unsupported values: ${invalidEquipment.join(', ')}`);
            } else {
                payload.equipment = normalizedEquipment;
            }
        }
    }

    const availabilitySchedule = normalizeAvailabilitySchedule(body.availabilitySchedule);
    errors.push(...availabilitySchedule.errors);
    if (availabilitySchedule.value !== undefined) payload.availabilitySchedule = availabilitySchedule.value;

    const maintenanceSchedule = normalizeMaintenanceSchedule(body.maintenanceSchedule);
    errors.push(...maintenanceSchedule.errors);
    if (maintenanceSchedule.value !== undefined) payload.maintenanceSchedule = maintenanceSchedule.value;

    return { payload, errors };
};

export const getRooms = asyncHandler(async (req, res) => {
    const rooms = await Room.find({ school: req.schoolId }).sort({ name: 1 });
    res.json({ success: true, data: { rooms } });
});

export const createRoom = asyncHandler(async (req, res) => {
    const { payload, errors } = buildRoomPayload(req.body, { partial: false });
    if (errors.length > 0) {
        return res.status(400).json({ success: false, message: errors[0], errors });
    }

    const room = await Room.create({
        ...payload,
        school: req.schoolId,
        createdBy: req.user._id
    });

    res.status(201).json({ success: true, data: { room } });
});

export const updateRoom = asyncHandler(async (req, res) => {
    const room = await Room.findById(req.params.id);
    if (!room) {
        return res.status(404).json({ success: false, message: 'Room not found' });
    }

    if (room.school.toString() !== req.schoolId.toString()) {
        return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const { payload, errors } = buildRoomPayload(req.body, { partial: true });
    if (errors.length > 0) {
        return res.status(400).json({ success: false, message: errors[0], errors });
    }

    if (Object.keys(payload).length === 0) {
        return res.status(400).json({ success: false, message: 'No updatable room fields were provided' });
    }

    Object.assign(room, payload);

    room.lastModifiedBy = req.user._id;

    await room.save();

    res.json({ success: true, data: { room } });
});

export const deleteRoom = asyncHandler(async (req, res) => {
    const room = await Room.findById(req.params.id);
    if (!room) {
        return res.status(404).json({ success: false, message: 'Room not found' });
    }

    if (room.school.toString() !== req.schoolId.toString()) {
        return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    await room.deleteOne();

    res.json({ success: true, message: 'Room deleted' });
});
