import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import toast from 'react-hot-toast';
import { fetchStudent } from '../../../../store/slices/studentSlice';
import { fetchStudentGradeReport } from '../../../../store/slices/gradeSlice';
import { sendMonthlyReport } from '../../../../store/slices/notificationSlice';

const useGradeReportPageData = ({ studentId, academicYear }) => {
    const dispatch = useDispatch();

    useEffect(() => {
        dispatch(fetchStudent(studentId));
        dispatch(fetchStudentGradeReport({ studentId, academicYear }));
    }, [academicYear, dispatch, studentId]);

    const handleSendReport = async () => {
        const currentMonth = new Date().getMonth() + 1;
        const result = await dispatch(sendMonthlyReport({
            studentId,
            month: currentMonth,
            academicYear
        }));

        if (sendMonthlyReport.fulfilled.match(result)) {
            toast.success('Report sent to parent successfully!');
        } else {
            toast.error(result.payload || 'Failed to send report');
        }
    };

    return {
        handleSendReport
    };
};

export default useGradeReportPageData;
