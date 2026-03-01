export const filterSubjects = (subjects = [], searchTerm = '') => {
    const normalized = searchTerm.toLowerCase().trim();
    if (!normalized) return subjects;

    return subjects.filter((subject) => {
        const name = subject?.name?.toLowerCase() || '';
        const code = subject?.code?.toLowerCase() || '';
        return name.includes(normalized) || code.includes(normalized);
    });
};

export const mapSubjectToFormData = (subject) => ({
    name: subject?.name || '',
    code: subject?.code || '',
    description: subject?.description || '',
    dailyMaxMarks: subject?.dailyMaxMarks ?? 10,
    maxMarks: subject?.maxMarks ?? 100,
    passingMarks: subject?.passingMarks ?? 40,
    type: subject?.type || 'core'
});

export const getSubjectTypeBadge = (type) => (type === 'core' ? 'primary' : 'info');
