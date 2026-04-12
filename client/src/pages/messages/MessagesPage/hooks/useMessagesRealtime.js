import { useCallback, useEffect, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import { buildMessagesRealtimeUrl } from '../../../../api/messagesApi';
import { MessagesRealtimeService } from '../../../../services/messagesRealtimeService';
import { fetchThreads, fetchThreadDetail } from '../../../../store/slices/messagesSlice';

const useMessagesRealtime = ({ selectedThreadId }) => {
    const dispatch = useDispatch();
    const realtimeServiceRef = useRef(null);
    const realtimeSyncTimerRef = useRef(null);
    const realtimeSyncThreadIdsRef = useRef(new Set());
    const selectedThreadIdRef = useRef(null);
    const backgroundListSyncRef = useRef(false);
    const backgroundDetailSyncRef = useRef(false);
    const [realtimeConnected, setRealtimeConnected] = useState(false);

    useEffect(() => {
        selectedThreadIdRef.current = selectedThreadId;
    }, [selectedThreadId]);

    const scheduleRealtimeSync = useCallback((threadId = '') => {
        const normalizedThreadId = String(threadId || '').trim();
        if (normalizedThreadId) {
            realtimeSyncThreadIdsRef.current.add(normalizedThreadId);
        }

        if (realtimeSyncTimerRef.current) {
            return;
        }

        realtimeSyncTimerRef.current = window.setTimeout(async () => {
            realtimeSyncTimerRef.current = null;
            const pendingThreadIds = new Set(realtimeSyncThreadIdsRef.current);
            realtimeSyncThreadIdsRef.current.clear();

            dispatch(fetchThreads({ page: 1, silent: true }));

            const activeThreadId = selectedThreadIdRef.current;
            if (!activeThreadId) return;
            if (pendingThreadIds.size > 0 && !pendingThreadIds.has(activeThreadId)) return;

            dispatch(fetchThreadDetail({ threadId: activeThreadId, silent: true }));
        }, 350);
    }, [dispatch]);

    useEffect(() => {
        const realtimeService = new MessagesRealtimeService({
            onConnectionChange: (connected) => setRealtimeConnected(connected),
            onEvent: (event) => {
                const eventThreadId = event?.data?.threadId;
                scheduleRealtimeSync(eventThreadId);
            }
        });
        realtimeServiceRef.current = realtimeService;

        const realtimeUrl = buildMessagesRealtimeUrl();
        if (realtimeUrl) {
            realtimeService.connect(realtimeUrl);
        }

        return () => {
            if (realtimeSyncTimerRef.current) {
                window.clearTimeout(realtimeSyncTimerRef.current);
                realtimeSyncTimerRef.current = null;
            }
            realtimeSyncThreadIdsRef.current.clear();
            realtimeService.dispose();
            realtimeServiceRef.current = null;
            setRealtimeConnected(false);
        };
    }, [scheduleRealtimeSync]);

    useEffect(() => {
        const handleFocus = () => {
            const realtimeUrl = buildMessagesRealtimeUrl();
            if (realtimeUrl && realtimeServiceRef.current) {
                realtimeServiceRef.current.connect(realtimeUrl);
            }
            dispatch(fetchThreads({ page: 1, silent: true }));
            const activeThreadId = selectedThreadIdRef.current;
            if (activeThreadId) {
                dispatch(fetchThreadDetail({ threadId: activeThreadId, silent: true }));
            }
        };

        window.addEventListener('focus', handleFocus);
        return () => window.removeEventListener('focus', handleFocus);
    }, [dispatch]);

    useEffect(() => {
        if (realtimeConnected) {
            return undefined;
        }

        let cancelled = false;

        const tick = async () => {
            if (cancelled || document.visibilityState !== 'visible') return;

            if (!backgroundListSyncRef.current) {
                backgroundListSyncRef.current = true;
                try {
                    await dispatch(fetchThreads({ page: 1, silent: true })).unwrap();
                } catch {
                    // silent
                } finally {
                    backgroundListSyncRef.current = false;
                }
            }

            const activeThreadId = selectedThreadIdRef.current;
            if (!activeThreadId || backgroundDetailSyncRef.current) return;

            backgroundDetailSyncRef.current = true;
            try {
                await dispatch(fetchThreadDetail({ threadId: activeThreadId, silent: true })).unwrap();
            } catch {
                // silent
            } finally {
                backgroundDetailSyncRef.current = false;
            }
        };

        const intervalMs = 15000;
        const intervalId = window.setInterval(() => {
            void tick();
        }, intervalMs);
        void tick();

        return () => {
            cancelled = true;
            window.clearInterval(intervalId);
        };
    }, [dispatch, realtimeConnected]);

    return { realtimeConnected };
};

export default useMessagesRealtime;