import { asyncHandler } from '../middleware/errorHandler.js';
import Room from '../models/Room.js';

export const getRooms = asyncHandler(async (req, res) => {
    const rooms = await Room.find({ school: req.schoolId }).sort({ name: 1 });
    res.json({ success: true, data: { rooms } });
});

export const createRoom = asyncHandler(async (req, res) => {
    const { name, type, capacity, isAvailable, status } = req.body;
const newRoom = {
        school: req.schoolId,
        name,
        type,
        capacity,
        isAvailable: isAvailable ?? true,
        status: status ?? 'active',
        createdBy: req.user._id
    }
    const room = await Room.create(newRoom);

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

    const { name, type, capacity, isAvailable, status } = req.body;

    if (name !== undefined) room.name = name;
    if (type !== undefined) room.type = type;
    if (capacity !== undefined) room.capacity = capacity;
    if (isAvailable !== undefined) room.isAvailable = isAvailable;
    if (status !== undefined) room.status = status;

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
