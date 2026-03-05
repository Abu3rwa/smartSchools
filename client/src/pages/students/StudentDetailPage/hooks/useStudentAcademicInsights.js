import { useEffect, useMemo, useState } from 'react';
import api from '../../../../config/api';
import {
    toId,
    filterAssignmentsForStudent,
    buildSubjectPerformanceData,
    buildMonthlyTrendData,
    buildAssignmentRows,
    buildOverviewMetrics
} from '../utils/studentDetailPresentation';

const DEFAULT_STATE = {
    loading: false,
    error: '',
    report: null,
    grades: [],
    assignments: [],
    schoolYearStartMonth: 8
};

const shouldIgnoreAssignmentError = (error) => {
    const status = error?.response?.status;
    return status === 401 || status === 403;
};

const getCurrentClassId = (student) => {
    return toId(student?.currentClass?._id || student?.currentClass);
};

export default function useStudentAcademicInsights(student) {
    const [state, setState] = useState(DEFAULT_STATE);

    const studentId = toId(student?._id);
    const academicYear = student?.academicYear || '';
    const currentClassId = getCurrentClassId(student);

    useEffect(() => {
        if (!studentId) return;

        let cancelled = false;

        const fetchInsights = async () => {
            setState((prev) => ({ ...prev, loading: true, error: '' }));

            const gradeParams = academicYear ? { academicYear } : undefined;
            const requests = [
                api.get(`/grades/report/${studentId}`, { params: gradeParams }),
                api.get(`/grades/student/${studentId}`, { params: gradeParams }),
                api.get('/schools/me')
            ];

            const shouldFetchAssignments = Boolean(currentClassId);
            if (shouldFetchAssignments) {
                requests.push(api.get('/assignments', {
                    params: {
                        classId: currentClassId,
                        academicYear: academicYear || undefined,
                        status: 'published',
                        limit: 100
                    }
                }));
            }

            const [reportResult, gradesResult, schoolResult, assignmentsResult] = await Promise.allSettled(requests);
            if (cancelled) return;

            const report = reportResult.status === 'fulfilled'
                ? reportResult.value?.data?.data?.report || null
                : null;

            const grades = gradesResult.status === 'fulfilled'
                ? gradesResult.value?.data?.data?.grades || []
                : [];

            const rawAssignments = assignmentsResult?.status === 'fulfilled'
                ? assignmentsResult.value?.data?.data?.items || []
                : [];
            const assignments = filterAssignmentsForStudent(rawAssignments, studentId);
            const schoolYearStartMonth = schoolResult?.status === 'fulfilled'
                ? Number(schoolResult.value?.data?.data?.school?.settings?.academicYearStartMonth || 8)
                : 8;

            let error = '';
            if (reportResult.status === 'rejected' && gradesResult.status === 'rejected') {
                error = 'Unable to load student performance data right now.';
            } else if (
                assignmentsResult?.status === 'rejected' &&
                !shouldIgnoreAssignmentError(assignmentsResult.reason)
            ) {
                error = 'Unable to load assignment insights.';
            }

            setState({
                loading: false,
                error,
                report,
                grades,
                assignments,
                schoolYearStartMonth
            });
        };

        fetchInsights().catch((error) => {
            if (cancelled) return;
            console.error('Failed to load student insights:', error);
            setState((prev) => ({
                ...prev,
                loading: false,
                error: 'Unable to load student performance data right now.'
            }));
        });

        return () => {
            cancelled = true;
        };
    }, [studentId, academicYear, currentClassId]);

    const subjectPerformanceData = useMemo(
        () => buildSubjectPerformanceData(state.report?.subjects || []),
        [state.report]
    );

    const monthlyTrendData = useMemo(
        () => buildMonthlyTrendData({
            subjects: state.report?.subjects || [],
            academicYear,
            academicYearStartMonth: state.schoolYearStartMonth
        }),
        [state.report, academicYear, state.schoolYearStartMonth]
    );

    const assignmentRows = useMemo(
        () => buildAssignmentRows({ assignments: state.assignments, grades: state.grades }),
        [state.assignments, state.grades]
    );

    const overview = useMemo(
        () => buildOverviewMetrics({
            report: state.report,
            grades: state.grades,
            subjectPerformanceData,
            assignmentRows
        }),
        [state.report, state.grades, subjectPerformanceData, assignmentRows]
    );

    return {
        loading: state.loading,
        error: state.error,
        overview,
        subjectPerformanceData,
        monthlyTrendData,
        assignmentRows,
        grades: state.grades,
        schoolYearStartMonth: state.schoolYearStartMonth
    };
}
