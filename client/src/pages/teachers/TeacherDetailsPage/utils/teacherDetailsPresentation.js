import { TEACHER_DETAILS_MESSAGES } from '../constants';

export const getTeacherFullName = (teacher) => {
    const firstName = teacher?.user?.firstName || '';
    const lastName = teacher?.user?.lastName || '';
    return `${firstName} ${lastName}`.trim();
};

export const getTeacherInitials = (teacher) => {
    const firstInitial = teacher?.user?.firstName?.charAt(0) || '';
    const lastInitial = teacher?.user?.lastName?.charAt(0) || '';
    return `${firstInitial}${lastInitial}`;
};

export const getTeacherSelectorLabel = (teacher) => {
    const fullName = getTeacherFullName(teacher);
    return `${fullName} - ${teacher?.employeeId || ''}`.trim();
};

export const getTeacherDepartmentName = (teacher) => {
    return teacher?.department?.name ?? TEACHER_DETAILS_MESSAGES.NO_DEPARTMENT;
};

export const getTeacherQualification = (teacher) => {
    return teacher?.qualification || TEACHER_DETAILS_MESSAGES.NO_QUALIFICATION;
};
