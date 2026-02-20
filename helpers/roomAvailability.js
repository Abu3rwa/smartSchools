const HH_MM_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

const parseTimeToMinutes = (value) => {
    if (typeof value !== 'string') return null;
    const match = value.trim().match(HH_MM_PATTERN);
    if (!match) return null;
    return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
};

const toDate = (value) => {
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

const getDayBoundary = (date, endOfDay = false) => {
    const boundary = new Date(date);
    if (endOfDay) {
        boundary.setHours(23, 59, 59, 999);
    } else {
        boundary.setHours(0, 0, 0, 0);
    }
    return boundary;
};

const checkRoomAvailabilitySchedule = (room, startDate, endDate) => {
    const schedules = Array.isArray(room?.availabilitySchedule) ? room.availabilitySchedule : [];
    if (schedules.length === 0) {
        return null;
    }

    const startDay = getDayBoundary(startDate);
    const endDay = getDayBoundary(endDate);

    for (let cursor = new Date(startDay); cursor <= endDay; cursor.setDate(cursor.getDate() + 1)) {
        const dayOfWeek = cursor.getDay();
        const daySchedule = schedules.find((item) => item?.dayOfWeek === dayOfWeek);

        if (!daySchedule || daySchedule.isClosed) {
            return {
                code: 'outside_availability',
                message: 'Room is closed in its availability schedule for part of this time.'
            };
        }

        const openMinutes = parseTimeToMinutes(daySchedule.openTime);
        const closeMinutes = parseTimeToMinutes(daySchedule.closeTime);
        if (openMinutes === null || closeMinutes === null) {
            return {
                code: 'outside_availability',
                message: 'Room availability schedule is not configured correctly.'
            };
        }

        const segmentStart = cursor.toDateString() === startDate.toDateString() ? startDate : getDayBoundary(cursor);
        const segmentEnd = cursor.toDateString() === endDate.toDateString() ? endDate : getDayBoundary(cursor, true);

        const segmentStartMinutes = segmentStart.getHours() * 60 + segmentStart.getMinutes();
        const segmentEndMinutes = segmentEnd.getHours() * 60 + segmentEnd.getMinutes();

        if (segmentStartMinutes < openMinutes || segmentEndMinutes > closeMinutes) {
            return {
                code: 'outside_availability',
                message: 'Room is outside configured open hours for this time.'
            };
        }
    }

    return null;
};

const checkRoomMaintenanceOverlap = (room, startDate, endDate) => {
    const maintenanceItems = Array.isArray(room?.maintenanceSchedule) ? room.maintenanceSchedule : [];
    const overlap = maintenanceItems.find((item) => {
        const maintenanceStart = toDate(item?.startDate);
        const maintenanceEnd = toDate(item?.endDate);
        if (!maintenanceStart || !maintenanceEnd) return false;
        return startDate <= maintenanceEnd && endDate >= maintenanceStart;
    });

    if (!overlap) return null;
    return {
        code: 'maintenance',
        message: 'Room is unavailable due to maintenance for this time.',
        maintenanceType: overlap.type || null
    };
};

export const evaluateRoomOperationalState = (
    room,
    { startTime, endTime, checkAvailabilitySchedule = true } = {}
) => {
    if (!room) {
        return { available: false, code: 'not_found', message: 'Room not found.' };
    }

    if (room.status && room.status !== 'active') {
        return { available: false, code: 'status', message: `Room is currently ${room.status}.` };
    }

    if (room.isAvailable === false) {
        return { available: false, code: 'disabled', message: 'Room is marked unavailable.' };
    }

    const startDate = toDate(startTime);
    const endDate = toDate(endTime);
    if (startDate && endDate) {
        const maintenanceState = checkRoomMaintenanceOverlap(room, startDate, endDate);
        if (maintenanceState) {
            return { available: false, ...maintenanceState };
        }

        if (checkAvailabilitySchedule) {
            const scheduleState = checkRoomAvailabilitySchedule(room, startDate, endDate);
            if (scheduleState) {
                return { available: false, ...scheduleState };
            }
        }
    }

    return { available: true, code: null, message: null };
};
