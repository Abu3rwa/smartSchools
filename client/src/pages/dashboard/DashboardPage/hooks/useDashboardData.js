import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { fetchClasses } from '../../../../store/slices/classSlice';
import { fetchStudents } from '../../../../store/slices/studentSlice';
import { fetchDashboardStats } from '../../../../store/slices/dashboardSlice';

const useDashboardData = ({ academicYear }) => {
    const dispatch = useDispatch();

    useEffect(() => {
        dispatch(fetchClasses({ academicYear }));
        dispatch(fetchStudents({ limit: 5 }));
        dispatch(fetchDashboardStats(academicYear));
    }, [dispatch, academicYear]);

    const retryDashboardStats = () => {
        dispatch(fetchDashboardStats(academicYear));
    };

    return {
        retryDashboardStats
    };
};

export default useDashboardData;
