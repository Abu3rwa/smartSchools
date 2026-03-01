export const createTodayDate = () => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
};

export const formatDateAsYmd = (value, fallback = new Date()) => {
    if (!value) return new Date(fallback).toISOString().slice(0, 10);
    return new Date(value).toISOString().slice(0, 10);
};

export const createDefaultPeriod = () => ({
    periodNumber: 1,
    startTime: '08:00',
    endTime: '09:00',
    isActive: true
});

export const createDefaultAssignment = (today = createTodayDate()) => {
    const start = new Date(today);
    const end = new Date(today);
    end.setMonth(end.getMonth() + 3);

    return {
        teacher: '',
        class: '',
        subject: '',
        room: '',
        period: '',
        daysOfWeek: [1, 2, 3, 4, 5],
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
        isActive: true
    };
};

export const createDefaultRoom = () => ({
    name: '',
    type: 'classroom',
    capacity: 40,
    building: '',
    floor: '',
    number: '',
    status: 'active',
    isAvailable: true
});
