import { useCallback, useEffect, useRef, useState } from 'react';
import { buildMessagesRealtimeUrl } from '../../../../api/messagesApi';
import { MessagesRealtimeService } from '../../../../services/messagesRealtimeService';

const useMessagesRealtime = ({ selectedThreadId, loadThreads, refreshThreadDetail }) => {
    const realtimeServiceRef = useRef(null);
    const realtimeSyncTimerRef = useRef(null);
    const realtimeSyncThreadIdsRef = useRef(new Set());
    const selectedThreadIdRef = useRef(null);
    const loadThreadsRef = useRef(null);
    const refreshThreadDetailRef = useRef(null);
    const backgroundListSyncRef = useRef(false);
    const backgroundDetailSyncRef = useRef(false);
    const [realtimeConnected, setRealtimeConnected] = useState(false);

    useEffect(() => {
        selectedThreadIdRef.current = selectedThreadId;
    }, [selectedThreadId]);

    useEffect(() => {
        loadThreadsRef.current = loadThreads;
    }, [loadThreads]);

    useEffect(() => {
        refreshThreadDetailRef.current = refreshThreadDetail;
    }, [refreshThreadDetail]);

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

            if (typeof loadThreadsRef.current === 'function') {
                await loadThreadsRef.current({ page: 1, append: false, silent: true });
            }

            const activeThreadId = selectedThreadIdRef.current;
            if (!activeThreadId) return;
            if (pendingThreadIds.size > 0 && !pendingThreadIds.has(activeThreadId)) return;

            if (typeof refreshThreadDetailRef.current === 'function') {
                await refreshThreadDetailRef.current(activeThreadId);
            }
        }, 350);
    }, []);

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
            if (typeof loadThreadsRef.current === 'function') {
                loadThreadsRef.current({ page: 1, append: false, silent: true });
            }
            const activeThreadId = selectedThreadIdRef.current;
            if (activeThreadId && typeof refreshThreadDetailRef.current === 'function') {
                refreshThreadDetailRef.current(activeThreadId);
            }
        };

        window.addEventListener('focus', handleFocus);
        return () => window.removeEventListener('focus', handleFocus);
    }, []);

    useEffect(() => {
        let cancelled = false;

        const tick = async () => {
            if (cancelled || document.visibilityState !== 'visible') return;

            if (!backgroundListSyncRef.current && typeof loadThreadsRef.current === 'function') {
                backgroundListSyncRef.current = true;
                try {
                    await loadThreadsRef.current({ page: 1, append: false, silent: true });
                } finally {
                    backgroundListSyncRef.current = false;
                }
            }

            const activeThreadId = selectedThreadIdRef.current;
            if (!activeThreadId) return;
            if (backgroundDetailSyncRef.current || typeof refreshThreadDetailRef.current !== 'function') return;

            backgroundDetailSyncRef.current = true;
            try {
                await refreshThreadDetailRef.current(activeThreadId);
            } finally {
                backgroundDetailSyncRef.current = false;
            }
        };

        const intervalMs = 4000;
        const intervalId = window.setInterval(() => {
            void tick();
        }, intervalMs);
        void tick();

        return () => {
            cancelled = true;
            window.clearInterval(intervalId);
        };
    }, [realtimeConnected]);

    return { realtimeConnected };
};

export default useMessagesRealtime;