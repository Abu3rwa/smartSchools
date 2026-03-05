import { useEffect, useMemo, useState } from 'react';
import api from '../../../../config/api';
import {
    toId,
    filterAssignmentsForStudent,
    buildSubjectPerformanceData,
    buildSubjectPerformanceFromGrades,
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
    schoolYearStartMonth: 8,
    availableAcademicYears: [],
    gradingScale: null
};

const shouldIgnoreAssignmentError = (error) => {
    const status = error?.response?.status;
    return status === 401 || status === 403;
};

const getCurrentClassId = (student) => {
    return toId(student?.currentClass?._id || student?.currentClass);
};

export default function useStudentAcademicInsights(student, options = {}) {
    const fallbackAcademicYear = String(student?.academicYear || localStorage.getItem('currentAcademicYear') || '').trim();
    const requestedSchoolYear = String(options.schoolYear || fallbackAcademicYear || '').trim();
    const selectedSchoolYear = requestedSchoolYear.toLowerCase() === 'all' ? 'all' : requestedSchoolYear;
    const semesterValue = Number(options.semester);
    const effectiveSemester = semesterValue === 1 || semesterValue === 2 ? semesterValue : null;
    const effectiveAcademicYear = selectedSchoolYear && selectedSchoolYear !== 'all'
        ? selectedSchoolYear
        : '';
    const shouldRequestReport = Boolean(effectiveAcademicYear) && !effectiveSemester;
    const [state, setState] = useState(DEFAULT_STATE);
    const studentId = toId(student?._id);
    const currentClassId = getCurrentClassId(student);

    useEffect(() => {
        if (!studentId) return;

        let cancelled = false;

        const fetchInsights = async () => {
            setState((prev) => ({ ...prev, loading: true, error: '' }));

            const gradeParams = {
                academicYear: effectiveAcademicYear || undefined,
                schoolYear: selectedSchoolYear === 'all' ? 'all' : undefined,
                semester: effectiveSemester || undefined
            };
            const shouldFetchAssignments = Boolean(currentClassId && selectedSchoolYear !== 'all');
            const requests = [
                api.get(`/grades/student/${studentId}`, { params: gradeParams }),
                api.get('/schools/me'),
                shouldFetchAssignments
                    ? api.get('/assignments', {
                        params: {
                            classId: currentClassId,
                            academicYear: effectiveAcademicYear || undefined,
                            status: 'published',
                            limit: 100
                        }
                    })
                    : Promise.resolve({ data: { data: { items: [] } } }),
                shouldRequestReport
                    ? api.get(`/grades/report/${studentId}`, {
                        params: { academicYear: effectiveAcademicYear }
                    })
                    : Promise.resolve({ data: { data: { report: null } } })
            ];

            const [gradesResult, schoolResult, assignmentsResult, reportResult] = await Promise.allSettled(requests);
            if (cancelled) return;

            const gradesPayload = gradesResult.status === 'fulfilled'
                ? gradesResult.value?.data?.data || {}
                : {};
            const grades = Array.isArray(gradesPayload?.grades) ? gradesPayload.grades : [];
            const availableAcademicYears = Array.from(new Set([
                ...(Array.isArray(gradesPayload?.availableAcademicYears) ? gradesPayload.availableAcademicYears : []),
                fallbackAcademicYear,
                effectiveAcademicYear
            ].filter(Boolean))).sort();

            const report = reportResult.status === 'fulfilled'
                ? reportResult.value?.data?.data?.report || null
                : null;

            const rawAssignments = assignmentsResult?.status === 'fulfilled'
                ? assignmentsResult.value?.data?.data?.items || []
                : [];
            const assignments = filterAssignmentsForStudent(rawAssignments, studentId);
            const schoolYearStartMonth = schoolResult?.status === 'fulfilled'
                ? Number(schoolResult.value?.data?.data?.school?.settings?.academicYearStartMonth || 8)
                : 8;

            let error = '';
            if (gradesResult.status === 'rejected') {
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
                schoolYearStartMonth,
                availableAcademicYears,
                gradingScale: gradesPayload?.gradingScale || null
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
    }, [
        studentId,
        currentClassId,
        selectedSchoolYear,
        effectiveAcademicYear,
        effectiveSemester,
        shouldRequestReport,
        fallbackAcademicYear
    ]);

    const subjectPerformanceData = useMemo(() => {
        const reportBasedData = buildSubjectPerformanceData(state.report?.subjects || []);
        if (reportBasedData.length && !effectiveSemester) return reportBasedData;
        return buildSubjectPerformanceFromGrades(state.grades);
    }, [state.report, state.grades, effectiveSemester]);

    const monthlyTrendData = useMemo(
        () => buildMonthlyTrendData({
            grades: state.grades,
            academicYear: effectiveAcademicYear,
            academicYearStartMonth: state.schoolYearStartMonth
        }),
        [state.grades, effectiveAcademicYear, state.schoolYearStartMonth]
    );

    const assignmentRows = useMemo(
        () => buildAssignmentRows({
            assignments: state.assignments,
            grades: state.grades,
            semester: effectiveSemester
        }),
        [state.assignments, state.grades, effectiveSemester]
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
        gradingScale: state.gradingScale,
        schoolYearStartMonth: state.schoolYearStartMonth,
        availableAcademicYears: state.availableAcademicYears,
        activeAcademicYear: effectiveAcademicYear || null,
        activeSemester: effectiveSemester
    };
}
