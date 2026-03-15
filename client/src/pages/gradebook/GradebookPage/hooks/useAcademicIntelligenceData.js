import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api from '../../../../config/api';

const ACADEMIC_INTELLIGENCE_TIMEOUT_MS = 12000;

const buildMonthDateRange = ({ academicYear, selectedMonth }) => {
    const numericMonth = Number(selectedMonth);
    if (!academicYear || !Number.isInteger(numericMonth) || numericMonth < 1 || numericMonth > 12) {
        return {};
    }

    const [startYear, endYear] = String(academicYear)
        .split('-')
        .map((value) => Number.parseInt(value, 10));

    const targetYear = numericMonth >= 8 ? startYear : endYear;
    if (!Number.isInteger(targetYear)) {
        return {};
    }

    const from = new Date(targetYear, numericMonth - 1, 1);
    const today = new Date();
    const isCurrentMonth = today.getFullYear() === targetYear && (today.getMonth() + 1) === numericMonth;
    const to = isCurrentMonth
        ? new Date(today.getFullYear(), today.getMonth(), today.getDate())
        : new Date(targetYear, numericMonth, 0);

    const toDateParam = (value) => {
        const year = value.getFullYear();
        const month = String(value.getMonth() + 1).padStart(2, '0');
        const day = String(value.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    return {
        from: toDateParam(from),
        to: toDateParam(to)
    };
};

const useAcademicIntelligenceData = ({ classId, subjectId, selectedMonth, academicYear }) => {
    const [classInsights, setClassInsights] = useState(null);
    const [classInsightsLoading, setClassInsightsLoading] = useState(false);
    const [classInsightsError, setClassInsightsError] = useState('');
    const [studentTrace, setStudentTrace] = useState([]);
    const [studentTraceLoading, setStudentTraceLoading] = useState(false);
    const [studentTraceError, setStudentTraceError] = useState('');
    const classInsightsRequestIdRef = useRef(0);
    const studentTraceRequestIdRef = useRef(0);
    const classInsightsAbortControllerRef = useRef(null);
    const studentTraceAbortControllerRef = useRef(null);

    const dateRange = useMemo(
        () => buildMonthDateRange({ academicYear, selectedMonth }),
        [academicYear, selectedMonth]
    );

    const abortClassInsightsRequest = useCallback(() => {
        if (classInsightsAbortControllerRef.current) {
            classInsightsAbortControllerRef.current.abort();
            classInsightsAbortControllerRef.current = null;
        }
    }, []);

    const abortStudentTraceRequest = useCallback(() => {
        if (studentTraceAbortControllerRef.current) {
            studentTraceAbortControllerRef.current.abort();
            studentTraceAbortControllerRef.current = null;
        }
    }, []);

    const fetchClassInsights = useCallback(async () => {
        if (!classId || !subjectId) {
            abortClassInsightsRequest();
            setClassInsights(null);
            setClassInsightsLoading(false);
            setClassInsightsError('');
            return;
        }

        abortClassInsightsRequest();
        const requestId = classInsightsRequestIdRef.current + 1;
        classInsightsRequestIdRef.current = requestId;
        const controller = new AbortController();
        classInsightsAbortControllerRef.current = controller;

        setClassInsightsLoading(true);
        setClassInsightsError('');
        try {
            const response = await api.get(`/classes/${classId}/objective-performance`, {
                params: {
                    subjectId,
                    ...dateRange
                },
                timeout: ACADEMIC_INTELLIGENCE_TIMEOUT_MS,
                signal: controller.signal
            });
            if (classInsightsRequestIdRef.current === requestId) {
                setClassInsights(response.data?.data || null);
            }
        } catch (error) {
            const isCanceled = error?.code === 'ERR_CANCELED';
            if (isCanceled) {
                return;
            }

            if (classInsightsRequestIdRef.current === requestId) {
                setClassInsights(null);
                setClassInsightsError(
                    error?.code === 'ECONNABORTED'
                        ? 'Loading objective performance timed out. Please retry.'
                        : (error.response?.data?.message || 'Failed to load objective performance.')
                );
            }
        } finally {
            if (classInsightsRequestIdRef.current === requestId) {
                setClassInsightsLoading(false);
                classInsightsAbortControllerRef.current = null;
            }
        }
    }, [abortClassInsightsRequest, classId, dateRange, subjectId]);

    useEffect(() => {
        fetchClassInsights();
    }, [fetchClassInsights]);

    const fetchStudentTrace = useCallback(async (studentId) => {
        if (!studentId) {
            abortStudentTraceRequest();
            setStudentTrace([]);
            setStudentTraceLoading(false);
            setStudentTraceError('');
            return;
        }

        abortStudentTraceRequest();
        const requestId = studentTraceRequestIdRef.current + 1;
        studentTraceRequestIdRef.current = requestId;
        const controller = new AbortController();
        studentTraceAbortControllerRef.current = controller;

        setStudentTraceLoading(true);
        setStudentTraceError('');
        try {
            const response = await api.get(`/students/${studentId}/learning-trace`, {
                params: {
                    subjectId,
                    ...dateRange
                },
                timeout: ACADEMIC_INTELLIGENCE_TIMEOUT_MS,
                signal: controller.signal
            });
            if (studentTraceRequestIdRef.current === requestId) {
                setStudentTrace(Array.isArray(response.data?.data) ? response.data.data : []);
            }
        } catch (error) {
            const isCanceled = error?.code === 'ERR_CANCELED';
            if (isCanceled) {
                return;
            }

            if (studentTraceRequestIdRef.current === requestId) {
                setStudentTrace([]);
                setStudentTraceError(
                    error?.code === 'ECONNABORTED'
                        ? 'Loading learning trace timed out. Please retry.'
                        : (error.response?.data?.message || 'Failed to load learning trace.')
                );
            }
        } finally {
            if (studentTraceRequestIdRef.current === requestId) {
                setStudentTraceLoading(false);
                studentTraceAbortControllerRef.current = null;
            }
        }
    }, [abortStudentTraceRequest, dateRange, subjectId]);

    const resetStudentTrace = useCallback(() => {
        abortStudentTraceRequest();
        setStudentTrace([]);
        setStudentTraceLoading(false);
        setStudentTraceError('');
    }, [abortStudentTraceRequest]);

    useEffect(() => {
        return () => {
            abortClassInsightsRequest();
            abortStudentTraceRequest();
        };
    }, [abortClassInsightsRequest, abortStudentTraceRequest]);

    return {
        classInsights,
        classInsightsLoading,
        classInsightsError,
        refreshClassInsights: fetchClassInsights,
        studentTrace,
        studentTraceLoading,
        studentTraceError,
        fetchStudentTrace,
        resetStudentTrace
    };
};

export default useAcademicIntelligenceData;