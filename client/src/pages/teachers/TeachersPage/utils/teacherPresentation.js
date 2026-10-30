export const getTeacherFullName = (teacher) => {
    const firstName = teacher?.user?.firstName || '';
    const lastName = teacher?.user?.lastName || '';
    return `${firstName} ${lastName}`.trim();
};

export const getTeacherInitials = (teacher) => {
    const first = teacher?.user?.firstName?.charAt(0) || '';
    const last = teacher?.user?.lastName?.charAt(0) || '';
    return `${first}${last}`;
};

export const matchesTeacherSearch = (teacher, rawSearchTerm) => {
    const searchTerm = (rawSearchTerm || '').toLowerCase().trim();
    if (!searchTerm) return true;

    const fullName = getTeacherFullName(teacher).toLowerCase();
    const employeeId = (teacher?.employeeId || '').toLowerCase();

    return fullName.includes(searchTerm) || employeeId.includes(searchTerm);
};

export const mapTeacherToFormData = (teacher) => ({
    firstName: teacher?.user?.firstName || '',
    lastName: teacher?.user?.lastName || '',
    email: teacher?.user?.email || '',
    phone: teacher?.user?.phone || '',
    department: teacher?.department?._id ?? teacher?.department ?? '',
    qualification: teacher?.qualification || '',
    subjects: teacher?.subjects?.map((subject) => subject._id) || []
});

export const sortAssignments = (assignedClasses) => [...(assignedClasses || [])].sort((a, b) => {
    const yearA = a.class?.academicYear || '';
    const yearB = b.class?.academicYear || '';
    if (yearA !== yearB) return yearB.localeCompare(yearA);
    const classA = a.class?.name || '';
    const classB = b.class?.name || '';
    if (classA !== classB) return classA.localeCompare(classB);
    return (a.subject?.name || '').localeCompare(b.subject?.name || '');
});
