import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { useSelector } from 'react-redux';
import { selectUser } from '../../../../store/slices/authSlice';
import { fetchStudents } from '../../../../store/slices/studentSlice';
import { fetchDashboardStats } from '../../../../store/slices/dashboardSlice';

const useDashboardData = ({ academicYear }) => {
    const dispatch = useDispatch();
    const user = useSelector(selectUser);

    useEffect(() => {
        const role = user?.role;
        const canAccessSchoolLists = ['admin', 'department_principal', 'teacher'].includes(role);
        const canAccessSummaryStats = ['admin', 'department_principal', 'teacher'].includes(role);

        if (!role) return;

        if (canAccessSchoolLists) {
            dispatch(fetchStudents({ limit: 5 }));
        }

        if (canAccessSummaryStats) {
            dispatch(fetchDashboardStats(academicYear));
        }
    }, [dispatch, academicYear, user?.role]);

    const retryDashboardStats = () => {
        const role = user?.role;
        if (['admin', 'department_principal', 'teacher'].includes(role)) {
            dispatch(fetchDashboardStats(academicYear));
        }
    };

    return {
        retryDashboardStats
    };
};

export default useDashboardData;
