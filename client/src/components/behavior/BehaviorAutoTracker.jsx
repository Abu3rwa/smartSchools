import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { selectIsAuthenticated } from '../../store/slices/authSlice';
import behaviorTrackingService from '../../services/behaviorTrackingService';

const HEARTBEAT_INTERVAL_MS = 60 * 1000;
const STORAGE_KEY = 'behavior_session_id';
const MAX_CONSECUTIVE_FAILURES = 3;

const BehaviorAutoTracker = () => {
    const location = useLocation();
    const isAuthenticated = useSelector(selectIsAuthenticated);
    const sessionIdRef = useRef(localStorage.getItem(STORAGE_KEY) || null);
    const failCountRef = useRef(0);

    useEffect(() => {
        const clearSession = () => {
            sessionIdRef.current = null;
            localStorage.removeItem(STORAGE_KEY);
        };

        if (!isAuthenticated) {
            clearSession();
            return;
        }

        let intervalId;
        let isDisposed = false;

        const isServerDown = () => failCountRef.current >= MAX_CONSECUTIVE_FAILURES;

        const recordSuccess = () => { failCountRef.current = 0; };
        const recordFailure = () => { failCountRef.current += 1; };

        const startNewSession = async () => {
            if (isServerDown()) return;
            try {
                const response = await behaviorTrackingService.startSession({
                    source: 'web_client'
                });
                const nextSessionId = response?.data?.data?.sessionId;
                if (nextSessionId && !isDisposed) {
                    sessionIdRef.current = nextSessionId;
                    localStorage.setItem(STORAGE_KEY, nextSessionId);
                }
                recordSuccess();
            } catch {
                recordFailure();
            }
        };

        const sendHeartbeat = async () => {
            if (!sessionIdRef.current || isServerDown()) return;
            try {
                await behaviorTrackingService.heartbeatSession(sessionIdRef.current);
                recordSuccess();
            } catch (error) {
                const status = error?.response?.status;
                if (status === 404 || status === 401) {
                    clearSession();
                    await startNewSession();
                } else {
                    recordFailure();
                }
            }
        };

        const initializeSession = async () => {
            if (!sessionIdRef.current) {
                await startNewSession();
            } else {
                await sendHeartbeat();
            }

            if (!sessionIdRef.current || isDisposed) return;
            intervalId = setInterval(() => {
                sendHeartbeat().catch(() => {});
            }, HEARTBEAT_INTERVAL_MS);
        };

        initializeSession();

        const handleBeforeUnload = () => {
            if (sessionIdRef.current) {
                behaviorTrackingService.endSession(sessionIdRef.current).catch(() => {});
                clearSession();
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => {
            isDisposed = true;
            window.removeEventListener('beforeunload', handleBeforeUnload);
            if (intervalId) clearInterval(intervalId);
            if (sessionIdRef.current) {
                behaviorTrackingService.endSession(sessionIdRef.current).catch(() => {});
                clearSession();
            }
        };
    }, [isAuthenticated]);

    useEffect(() => {
        if (!isAuthenticated) return;
        if (failCountRef.current >= MAX_CONSECUTIVE_FAILURES) return;
        behaviorTrackingService.trackEvent({
            eventType: 'page_view',
            action: 'view_page',
            description: `Viewed ${location.pathname}`,
            resourceType: 'system',
            metadata: {
                path: location.pathname,
                search: location.search
            }
        }).catch(() => { failCountRef.current += 1; });
    }, [isAuthenticated, location.pathname, location.search]);

    return null;
};

export default BehaviorAutoTracker;
