const VALID_MILESTONE_STATUSES = new Set(['pending', 'achieved', 'adjusted']);

export const normalizeGoalMilestones = (milestones) => {
    if (!Array.isArray(milestones)) {
        throw Object.assign(new Error('Milestones must be a list'), { statusCode: 400 });
    }
    if (milestones.length > 10) {
        throw Object.assign(new Error('A goal can have no more than 10 milestones'), { statusCode: 400 });
    }

    return milestones.map((milestone) => {
        const title = String(milestone?.title || '').trim();
        if (!title || title.length > 200) {
            throw Object.assign(new Error('Each milestone needs a title of 1 to 200 characters'), { statusCode: 400 });
        }
        const status = milestone.status || 'pending';
        if (!VALID_MILESTONE_STATUSES.has(status)) {
            throw Object.assign(new Error('Milestone status is invalid'), { statusCode: 400 });
        }
        let targetDate = null;
        if (milestone.targetDate) {
            targetDate = new Date(milestone.targetDate);
            if (Number.isNaN(targetDate.getTime())) {
                throw Object.assign(new Error('Milestone target date is invalid'), { statusCode: 400 });
            }
        }
        return {
            title,
            targetDate,
            status,
            completedAt: status === 'achieved' ? (milestone.completedAt || new Date()) : null,
        };
    });
};

export const parseOptionalPlpDate = (value, label) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        throw Object.assign(new Error(`${label} is invalid`), { statusCode: 400 });
    }
    return date;
};
