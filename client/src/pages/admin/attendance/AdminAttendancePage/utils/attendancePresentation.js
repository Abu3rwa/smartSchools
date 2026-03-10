export function mapRecordToUI(record) {
    const scheduleDisplay = record.schedule
        ? {
            _id: record.schedule._id,
            title: record.schedule.title,
            class: record.schedule.class || record.class,
            subject: record.schedule.subject || record.subject,
            teacher: record.schedule.teacher || record.teacher,
            startTime: record.schedule.startTime || record.startTime,
            endTime: record.schedule.endTime || record.endTime,
            room: record.schedule.room?.name ?? record.schedule.room ?? record.room ?? '—'
        }
        : {
            _id: record.period?._id || record._id,
            title: record.period?.name || record.period?._id || '—',
            class: record.class,
            subject: record.subject,
            teacher: record.teacher,
            startTime: record.startTime,
            endTime: record.endTime,
            room: record.room || '—'
        };

    return {
        _id: record._id,
        schedule: scheduleDisplay,
        attendanceRecorded: record.status !== 'draft',
        recordedAt: record.recordedAt,
        recordedBy: record.recordedBy,
        totalStudents: record.totalStudents ?? 0,
        present: record.present ?? 0,
        absent: record.absent ?? 0,
        late: record.late ?? 0,
        excused: record.excused ?? 0,
        attendanceRate: record.attendanceRate ?? 0
    };
}

export function getAttendanceStats(attendanceData) {
    const total = attendanceData.length;
    const recorded = attendanceData.filter((item) => item.attendanceRecorded).length;
    const pending = total - recorded;

    const totalStudents = attendanceData.reduce((sum, item) => sum + item.totalStudents, 0);
    const totalPresent = attendanceData.reduce((sum, item) => sum + item.present, 0);
    const totalAbsent = attendanceData.reduce((sum, item) => sum + item.absent, 0);
    const totalLate = attendanceData.reduce((sum, item) => sum + item.late, 0);
    const totalExcused = attendanceData.reduce((sum, item) => sum + item.excused, 0);
    const overallRate = totalStudents > 0 ? ((totalPresent / totalStudents) * 100).toFixed(1) : 0;

    return {
        totalClasses: total,
        recordedClasses: recorded,
        pendingClasses: pending,
        totalStudents,
        totalPresent,
        totalAbsent,
        totalLate,
        totalExcused,
        overallRate
    };
}

export function buildStatusChartData(stats, statusColors) {
    return [
        { key: 'present', value: stats.totalPresent, color: statusColors.present },
        { key: 'absent', value: stats.totalAbsent, color: statusColors.absent },
        { key: 'tardy', value: stats.totalLate, color: statusColors.tardy },
        { key: 'excused', value: stats.totalExcused, color: statusColors.excused }
    ];
}
