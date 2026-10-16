import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import googleClassroomService from '../../../../services/googleClassroomService';

const ERROR_KEYS = {
    missing_scopes: 'assignments:classroom.errors.missingScopes',
    not_available: 'assignments:classroom.errors.notAvailable'
};

/**
 * Google Classroom state for the assignments page: connection, the course mapped to the
 * selected class + subject, and per-assignment sync status. Everything stays inert when the
 * server reports that the integration is disabled.
 */
const useGoogleClassroom = ({ user, selectedClass, selectedSubject, academicYear, assignments }) => {
    const { t } = useTranslation(['assignments']);
    const [searchParams, setSearchParams] = useSearchParams();
    const [enabled, setEnabled] = useState(false);
    const [canManageClassroom, setCanManageClassroom] = useState(false);
    const [statusLoading, setStatusLoading] = useState(true);
    const [statusError, setStatusError] = useState(null);
    const [connection, setConnection] = useState({ connected: false, email: null });
    const [mappingsBySubject, setMappingsBySubject] = useState({});
    const [courses, setCourses] = useState([]);
    const [coursesLoading, setCoursesLoading] = useState(false);
    const [links, setLinks] = useState({});
    const [busy, setBusy] = useState(false);

    const isTeacher = canManageClassroom;
    const canViewPanel = ['teacher', 'admin', 'department_principal'].includes(user?.role);

    const refreshStatus = useCallback(async () => {
        setStatusLoading(true);
        setStatusError(null);
        try {
            const response = await googleClassroomService.getStatus();
            const data = response?.data || {};
            setEnabled(Boolean(data.enabled));
            setCanManageClassroom(Boolean(data.canManageClassroom));
            setConnection({ connected: Boolean(data.connected), email: data.email || null });
        } catch (error) {
            setEnabled(false);
            setCanManageClassroom(false);
            setStatusError({
                httpStatus: error.response?.status || null,
                networkError: !error.response
            });
        } finally {
            setStatusLoading(false);
        }
    }, []);

    useEffect(() => {
        refreshStatus();
    }, [refreshStatus]);

    useEffect(() => {
        window.addEventListener('google-suite-disconnected', refreshStatus);
        return () => window.removeEventListener('google-suite-disconnected', refreshStatus);
    }, [refreshStatus]);

    // Result of the Google consent redirect, delivered as query parameters.
    useEffect(() => {
        const connected = searchParams.get('classroom_connected');
        const error = searchParams.get('classroom_error');
        if (!connected && !error) return;

        if (connected) {
            toast.success(t('assignments:classroom.toasts.connected'));
            refreshStatus();
        } else {
            toast.error(t(ERROR_KEYS[error] || 'assignments:classroom.errors.connectFailed'));
        }
        const next = new URLSearchParams(searchParams);
        next.delete('classroom_connected');
        next.delete('classroom_error');
        setSearchParams(next, { replace: true });
    }, [searchParams, setSearchParams, refreshStatus, t]);

    useEffect(() => {
        if (!enabled || !isTeacher || !connection.connected || !selectedClass) {
            setMappingsBySubject({});
            return undefined;
        }
        let cancelled = false;
        googleClassroomService
            .listMappings({ classId: selectedClass })
            .then((response) => {
                if (cancelled) return;
                const items = response?.data?.items || [];
                setMappingsBySubject(Object.fromEntries(items.map((item) => [item.subjectId, item])));
            })
            .catch(() => {
                if (!cancelled) setMappingsBySubject({});
            });
        return () => { cancelled = true; };
    }, [enabled, isTeacher, connection.connected, selectedClass]);

    const mapping = mappingsBySubject[selectedSubject] || null;

    const assignmentIds = useMemo(
        () => (Array.isArray(assignments) ? assignments.map((item) => item.id).filter(Boolean) : []),
        [assignments]
    );

    const refreshLinks = useCallback(async () => {
        if (!enabled || assignmentIds.length === 0) {
            setLinks({});
            return;
        }
        try {
            const response = await googleClassroomService.getLinks(assignmentIds);
            setLinks(response?.data?.items || {});
        } catch {
            setLinks({});
        }
    }, [enabled, assignmentIds]);

    useEffect(() => {
        refreshLinks();
    }, [refreshLinks]);

    const connect = useCallback(async () => {
        setBusy(true);
        try {
            const response = await googleClassroomService.getAuthUrl();
            if (response?.authUrl) window.location.href = response.authUrl;
        } catch (error) {
            toast.error(error.response?.data?.message || t('assignments:classroom.errors.connectFailed'));
            setBusy(false);
        }
    }, [t]);

    const disconnect = useCallback(async () => {
        setBusy(true);
        try {
            await googleClassroomService.disconnect();
            setConnection({ connected: false, email: null });
            setMappingsBySubject({});
            setCourses([]);
            toast.success(t('assignments:classroom.toasts.disconnected'));
        } catch (error) {
            toast.error(error.response?.data?.message || t('assignments:classroom.errors.disconnectFailed'));
        } finally {
            setBusy(false);
        }
    }, [t]);

    const loadCourses = useCallback(async () => {
        setCoursesLoading(true);
        try {
            const response = await googleClassroomService.listCourses();
            setCourses(response?.data?.courses || []);
        } catch (error) {
            toast.error(error.response?.data?.message || t('assignments:classroom.errors.coursesFailed'));
            if (error.response?.data?.code === 'AUTH_REVOKED') refreshStatus();
        } finally {
            setCoursesLoading(false);
        }
    }, [refreshStatus, t]);

    const saveMappings = useCallback(async (entries) => {
        if (!selectedClass || !Array.isArray(entries) || entries.length === 0) return false;
        setBusy(true);
        const results = await Promise.allSettled(entries.map(async ({ subjectId, courseId }) => {
            const response = await googleClassroomService.saveMapping({
                classId: selectedClass,
                subjectId,
                academicYear,
                courseId
            });
            return response?.data?.mapping;
        }));
        setBusy(false);
        const savedMappings = results
            .filter((result) => result.status === 'fulfilled' && result.value)
            .map((result) => result.value);
        if (savedMappings.length > 0) {
            setMappingsBySubject((current) => ({
                ...current,
                ...Object.fromEntries(savedMappings.map((item) => [item.subjectId, item]))
            }));
        }
        const failures = results.filter((result) => result.status === 'rejected');
        if (failures.length > 0) {
            const message = failures[0].reason?.response?.data?.message;
            toast.error(message || t('assignments:classroom.errors.mappingFailed'));
            return false;
        }
        toast.success(t('assignments:classroom.toasts.mappingSaved'));
        return true;
    }, [academicYear, selectedClass, t]);

    const removeMapping = useCallback(async (subjectId) => {
        const target = mappingsBySubject[subjectId];
        if (!target?.id) return;
        setBusy(true);
        try {
            await googleClassroomService.deleteMapping(target.id);
            setMappingsBySubject((current) => {
                const next = { ...current };
                delete next[subjectId];
                return next;
            });
            toast.success(t('assignments:classroom.toasts.mappingRemoved'));
        } catch (error) {
            toast.error(error.response?.data?.message || t('assignments:classroom.errors.mappingFailed'));
        } finally {
            setBusy(false);
        }
    }, [mappingsBySubject, t]);

    const postAssignment = useCallback(async (assignment, { retry = false, publish = false } = {}) => {
        setBusy(true);
        try {
            if (publish) {
                await googleClassroomService.publishAssignment(assignment.id);
                toast.success(t('assignments:classroom.toasts.published'));
            } else {
                const call = retry ? googleClassroomService.retryAssignment : googleClassroomService.postAssignment;
                await call(assignment.id);
                toast.success(t('assignments:classroom.toasts.posted'));
            }
        } catch (error) {
            toast.error(error.response?.data?.message || t('assignments:classroom.errors.postFailed'));
        } finally {
            setBusy(false);
            await refreshLinks();
        }
    }, [refreshLinks, t]);

    // Reports the Classroom outcome returned alongside an assignment save/publish response.
    const reportOutcome = useCallback((outcome) => {
        if (!outcome) return;
        if (outcome.ok) {
            toast.success(t('assignments:classroom.toasts.posted'));
        } else {
            toast.error(t('assignments:classroom.toasts.savedButNotPosted', { message: outcome.message || '' }));
        }
        refreshLinks();
    }, [refreshLinks, t]);

    return {
        enabled,
        isTeacher,
        canViewPanel,
        statusLoading,
        statusError,
        canUse: enabled && isTeacher,
        connection,
        mapping,
        mappingsBySubject,
        courses,
        coursesLoading,
        links,
        busy,
        ready: enabled && isTeacher && connection.connected && Boolean(mapping),
        connect,
        disconnect,
        loadCourses,
        saveMappings,
        removeMapping,
        postAssignment,
        publishAssignment: (assignment) => postAssignment(assignment, { publish: true }),
        reportOutcome,
        refreshLinks
    };
};

export default useGoogleClassroom;
