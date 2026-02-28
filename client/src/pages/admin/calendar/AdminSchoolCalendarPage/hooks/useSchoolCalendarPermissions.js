import { useSelector } from 'react-redux';
import { selectUser } from '../../../../../store/slices/authSlice';
import { canUserManageCalendar } from '../utils/calendarPresentation';

const useSchoolCalendarPermissions = () => {
    const user = useSelector(selectUser);
    const canManage = canUserManageCalendar(user);

    return { canManage };
};

export default useSchoolCalendarPermissions;
