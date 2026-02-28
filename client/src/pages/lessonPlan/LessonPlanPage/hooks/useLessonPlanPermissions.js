import { useSelector } from 'react-redux';
import { selectUser } from '../../../../store/slices/authSlice.js';
import { PERMISSIONS } from '../../../../constants/permissions.js';

export default function useLessonPlanPermissions() {
  const user = useSelector(selectUser);
  const userPermissions = Array.isArray(user?.permissions) ? user.permissions : [];

  const canManageLessonPlans =
    user?.role === 'admin' ||
    user?.role === 'teacher' ||
    userPermissions.includes(PERMISSIONS.EDIT_LESSON_PLANS);

  const canFilterBySubject = canManageLessonPlans;

  const canFilterAsAdmin =
    user?.role === 'admin' ||
    user?.role === 'department_principal' ||
    userPermissions.includes(PERMISSIONS.REVIEW_LESSON_PLANS);

  const canManageLesson = (lesson) => {
    if (!canManageLessonPlans) return false;
    if (user?.role === 'admin') return true;
    const ownerId = lesson?.teacher?._id || lesson?.teacher;
    return Boolean(ownerId && user?._id && String(ownerId) === String(user._id));
  };

  return {
    user,
    canManageLessonPlans,
    canFilterBySubject,
    canFilterAsAdmin,
    canManageLesson,
  };
}
