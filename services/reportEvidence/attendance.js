import Attendance from '../../models/Attendance.js';
import { endOfDay } from './dateRange.js';

/**
 * Evidence collector for attendance.
 * Queries the Attendance model's studentAttendance subdocuments.
 */
export async function collect({ schoolId, studentId, startDate, endDate, classId }) {
    const query = {
        school: schoolId,
        'studentAttendance.student': studentId
    };

    if (classId) query.class = classId;

    const dateFilter = {};
    if (startDate) dateFilter.$gte = new Date(startDate);
    if (endDate) dateFilter.$lte = endOfDay(endDate);
    if (Object.keys(dateFilter).length > 0) query.date = dateFilter;

    const records = await Attendance.find(query).sort({ date: 1 }).lean();

    if (records.length === 0) {
        return {
            source: 'attendance',
            available: false,
            recordCount: 0,
            metrics: {},
            facts: [],
            trend: 'insufficient_data'
        };
    }

    let present = 0;
    let absent = 0;
    let tardy = 0;
    let excused = 0;
    const total = records.length;

    for (const record of records) {
        const entry = record.studentAttendance.find(
            sa => String(sa.student) === String(studentId)
        );
        if (!entry) continue;

        switch (entry.status) {
            case 'present':
                present += 1;
                break;
            case 'absent':
                absent += 1;
                break;
            case 'tardy':
            case 'tardy_excused':
                tardy += 1;
                break;
            case 'absent_excused':
                excused += 1;
                break;
            default:
                break;
        }
    }

    const attendanceRate = total > 0
        ? Math.round(((present + excused) / total) * 100)
        : 0;

    const half = Math.floor(records.length / 2);
    const firstRecords = records.slice(0, half || 1);
    const secondRecords = records.slice(half || 1);

    const countPresent = (recs) => {
        let p = 0;
        for (const r of recs) {
            const e = r.studentAttendance.find(
                sa => String(sa.student) === String(studentId)
            );
            if (e && (e.status === 'present' || e.status === 'absent_excused')) p += 1;
        }
        return p;
    };

    const firstRate = firstRecords.length > 0
        ? Math.round((countPresent(firstRecords) / firstRecords.length) * 100)
        : 0;
    const secondRate = secondRecords.length > 0
        ? Math.round((countPresent(secondRecords) / secondRecords.length) * 100)
        : 0;

    let trend = 'stable';
    if (records.length >= 6) {
        const diff = secondRate - firstRate;
        if (diff > 5) trend = 'improving';
        else if (diff < -5) trend = 'declining';
    }

    const facts = [];
    facts.push(`Attendance days: ${total}. Present: ${present}. Absent: ${absent}. Tardy: ${tardy}. Excused: ${excused}.`);
    facts.push(`Attendance rate: ${attendanceRate}%.`);

    return {
        source: 'attendance',
        available: true,
        recordCount: total,
        metrics: {
            totalDays: total,
            present,
            absent,
            tardy,
            excused,
            attendanceRate
        },
        facts,
        trend
    };
}
