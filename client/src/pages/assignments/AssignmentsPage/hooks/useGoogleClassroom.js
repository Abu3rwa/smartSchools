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
    const [connection, setConnection] = useState({ connected: false, email: null });
    const [mapping, setMapping] = useState(null);
    const [courses, setCourses] = useState([]);
    const [coursesLoading, setCoursesLoading] = useState(false);
    const [links, setLinks] = useState({});
    const [busy, setBusy] = useState(false);

    const isTeacher = user?.role === 'teacher';

    const refreshStatus = useCallback(async () => {
        try {
            const response = await googleClassroomService.getStatus();
            const data = response?.data || {};
            setEnabled(Boolean(data.enabled));
            setConnection({ connected: Boolean(data.connected), email: data.email || null });
        } catch {
            setEnabled(false);
        }
    }, []);

    useEffect(() => {
        refreshStatus();
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
        if (!enabled || !isTeacher || !connection.connected || !selectedClass || !selectedSubject) {
            setMapping(null);
            return undefined;
        }
        let cancelled = false;
        googleClassroomService
            .listMappings({ classId: selectedClass, subjectId: selectedSubject, academicYear })
            .then((response) => {
                if (!cancelled) setMapping(response?.data?.items?.[0] || null);
            })
            .catch(() => {
                if (!cancelled) setMapping(null);
            });
        return () => { cancelled = true; };
    }, [enabled, isTeacher, connection.connected, selectedClass, selectedSubject, academicYear]);

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
            setMapping(null);
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

    const saveMapping = useCallback(async (courseId) => {
        if (!selectedClass || !selectedSubject || !courseId) return false;
        setBusy(true);
        try {
            const response = await googleClassroomService.saveMapping({
                classId: selectedClass,
                subjectId: selectedSubject,
                academicYear,
                courseId
            });
            setMapping(response?.data?.mapping || null);
            toast.success(t('assignments:classroom.toasts.mappingSaved'));
            return true;
        } catch (error) {
            toast.error(error.response?.data?.message || t('assignments:classroom.errors.mappingFailed'));
            return false;
        } finally {
            setBusy(false);
        }
    }, [academicYear, selectedClass, selectedSubject, t]);

    const removeMapping = useCallback(async () => {
        if (!mapping?.id) return;
        setBusy(true);
        try {
            await googleClassroomService.deleteMapping(mapping.id);
            setMapping(null);
            toast.success(t('assignments:classroom.toasts.mappingRemoved'));
        } catch (error) {
            toast.error(error.response?.data?.message || t('assignments:classroom.errors.mappingFailed'));
        } finally {
            setBusy(false);
        }
    }, [mapping, t]);

    const postAssignment = useCallback(async (assignment, { retry = false } = {}) => {
        setBusy(true);
        try {
            const call = retry ? googleClassroomService.retryAssignment : googleClassroomService.postAssignment;
            await call(assignment.id);
            toast.success(t('assignments:classroom.toasts.posted'));
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
        canUse: enabled && isTeacher,
        connection,
        mapping,
        courses,
        coursesLoading,
        links,
        busy,
        ready: enabled && isTeacher && connection.connected && Boolean(mapping),
        connect,
        disconnect,
        loadCourses,
        saveMapping,
        removeMapping,
        postAssignment,
        reportOutcome,
        refreshLinks
    };
};

export default useGoogleClassroom;
