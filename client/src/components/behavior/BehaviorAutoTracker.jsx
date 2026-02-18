import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { selectIsAuthenticated } from '../../store/slices/authSlice';
import behaviorTrackingService from '../../services/behaviorTrackingService';

const HEARTBEAT_INTERVAL_MS = 60 * 1000;
const STORAGE_KEY = 'behavior_session_id';

const BehaviorAutoTracker = () => {
    const location = useLocation();
    const isAuthenticated = useSelector(selectIsAuthenticated);
    const sessionIdRef = useRef(localStorage.getItem(STORAGE_KEY) || null);

    useEffect(() => {
        if (!isAuthenticated) return;

        let intervalId;
        const initializeSession = async () => {
            try {
                if (!sessionIdRef.current) {
                    const response = await behaviorTrackingService.startSession({
                        source: 'web_client'
                    });
                    const nextSessionId = response?.data?.data?.sessionId;
                    if (nextSessionId) {
                        sessionIdRef.current = nextSessionId;
                        localStorage.setItem(STORAGE_KEY, nextSessionId);
                    }
                }

                if (sessionIdRef.current) {
                    intervalId = setInterval(() => {
                        behaviorTrackingService.heartbeatSession(sessionIdRef.current).catch(() => {});
                    }, HEARTBEAT_INTERVAL_MS);
                }
            } catch {
                // best-effort tracking
            }
        };

        initializeSession();

        const handleBeforeUnload = () => {
            if (sessionIdRef.current) {
                behaviorTrackingService.endSession(sessionIdRef.current).catch(() => {});
                localStorage.removeItem(STORAGE_KEY);
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
            if (intervalId) clearInterval(intervalId);
        };
    }, [isAuthenticated]);

    useEffect(() => {
        if (!isAuthenticated) return;
        behaviorTrackingService.trackEvent({
            eventType: 'page_view',
            action: 'view_page',
            description: `Viewed ${location.pathname}`,
            resourceType: 'system',
            metadata: {
                path: location.pathname,
                search: location.search
            }
        }).catch(() => {});
    }, [isAuthenticated, location.pathname, location.search]);

    return null;
};

export default BehaviorAutoTracker;