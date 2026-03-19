import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api from '../../../config/api';
import { MAX_SHORTCUTS, SHORTCUT_CANDIDATES } from './shortcutCandidates';
import {
    getShortcutsStorageKey,
    normalizeShortcutPaths,
    resolveCurrentShortcutPath,
} from './shortcutUtils';

export const useHeaderShortcuts = ({ user, schoolFeatures, locationPathname }) => {
    const [_revision, setRevision] = useState(0);
    const didInitialBackendSyncRef = useRef(false);

    const hasPermission = useCallback((permission) => {
        if (!user) return false;
        if (user.role === 'super_admin' || user.role === 'admin') return true;
        return user.permissions?.includes(permission) ?? false;
    }, [user]);

    const isShortcutAccessible = useCallback((item) => {
        let hasRoleAccess = true;
        if (item.roles) hasRoleAccess = item.roles.includes(user?.role);

        if (item.permissions && item.permissions.length > 0) {
            const hasRequiredPermission = item.permissions.some((permission) => hasPermission(permission));
            if (!hasRoleAccess && !hasRequiredPermission) return false;
        } else if (!hasRoleAccess) {
            return false;
        }

        if (item.feature && schoolFeatures?.[item.feature] === false) return false;
        return true;
    }, [hasPermission, schoolFeatures, user]);

    const availableShortcuts = useMemo(
        () => SHORTCUT_CANDIDATES.filter((item) => isShortcutAccessible(item)),
        [isShortcutAccessible],
    );

    const shortcutsStorageKey = useMemo(() => getShortcutsStorageKey(user), [user]);

    const selectedShortcutPaths = useMemo(() => {
        if (!user) return [];
        void _revision;

        const availablePaths = new Set(availableShortcuts.map((item) => item.path));
        const fallbackPaths = availableShortcuts.slice(0, 3).map((item) => item.path);

        const storageRaw = window.localStorage.getItem(shortcutsStorageKey);
        if (storageRaw) {
            try {
                return normalizeShortcutPaths({
                    rawPaths: JSON.parse(storageRaw),
                    availablePaths,
                    maxShortcuts: MAX_SHORTCUTS,
                    fallbackPaths,
                });
            } catch {
                return fallbackPaths;
            }
        }

        const serverPaths = user?.uiPreferences?.headerShortcuts;
        return normalizeShortcutPaths({
            rawPaths: serverPaths,
            availablePaths,
            maxShortcuts: MAX_SHORTCUTS,
            fallbackPaths,
        });
    }, [availableShortcuts, shortcutsStorageKey, user, _revision]);

    useEffect(() => {
        if (didInitialBackendSyncRef.current) return;
        if (!user?.id && !user?._id) return;

        let parsedLocal;
        const localRaw = window.localStorage.getItem(shortcutsStorageKey);
        if (!localRaw) {
            didInitialBackendSyncRef.current = true;
            return;
        }

        try {
            parsedLocal = JSON.parse(localRaw);
        } catch {
            didInitialBackendSyncRef.current = true;
            return;
        }

        const availablePaths = new Set(availableShortcuts.map((item) => item.path));
        const localNormalized = normalizeShortcutPaths({
            rawPaths: parsedLocal,
            availablePaths,
            maxShortcuts: MAX_SHORTCUTS,
            fallbackPaths: [],
        });
        const serverNormalized = normalizeShortcutPaths({
            rawPaths: user?.uiPreferences?.headerShortcuts,
            availablePaths,
            maxShortcuts: MAX_SHORTCUTS,
            fallbackPaths: [],
        });

        didInitialBackendSyncRef.current = true;
        if (JSON.stringify(localNormalized) === JSON.stringify(serverNormalized)) return;

        api.put('/auth/profile', {
            uiPreferences: {
                headerShortcuts: localNormalized,
            },
        }).catch(() => {});
    }, [availableShortcuts, shortcutsStorageKey, user]);

    const selectedShortcuts = useMemo(() => {
        const byPath = new Map(availableShortcuts.map((item) => [item.path, item]));
        return selectedShortcutPaths.map((path) => byPath.get(path)).filter(Boolean);
    }, [availableShortcuts, selectedShortcutPaths]);

    const currentShortcutPath = useMemo(
        () => resolveCurrentShortcutPath(locationPathname, availableShortcuts),
        [availableShortcuts, locationPathname],
    );

    const persistShortcutPaths = useCallback((nextPaths) => {
        const normalizedPaths = Array.isArray(nextPaths)
            ? nextPaths.slice(0, MAX_SHORTCUTS)
            : [];

        window.localStorage.setItem(shortcutsStorageKey, JSON.stringify(normalizedPaths));
        setRevision((previous) => previous + 1);

        if (user?.id || user?._id) {
            api.put('/auth/profile', {
                uiPreferences: {
                    headerShortcuts: normalizedPaths,
                },
            }).catch(() => {});
        }
    }, [shortcutsStorageKey, user]);

    const toggleShortcut = useCallback((path) => {
        const exists = selectedShortcutPaths.includes(path);
        let nextPaths = [];
        if (exists) {
            nextPaths = selectedShortcutPaths.filter((item) => item !== path);
        } else {
            if (selectedShortcutPaths.length >= MAX_SHORTCUTS) return;
            nextPaths = [...selectedShortcutPaths, path];
        }
        persistShortcutPaths(nextPaths);
    }, [persistShortcutPaths, selectedShortcutPaths]);

    const reorderShortcuts = useCallback((draggedPath, targetPath) => {
        if (!draggedPath || !targetPath || draggedPath === targetPath) return;

        const sourceIndex = selectedShortcutPaths.indexOf(draggedPath);
        const targetIndex = selectedShortcutPaths.indexOf(targetPath);
        if (sourceIndex < 0 || targetIndex < 0) return;

        const nextPaths = [...selectedShortcutPaths];
        nextPaths.splice(sourceIndex, 1);
        nextPaths.splice(targetIndex, 0, draggedPath);
        persistShortcutPaths(nextPaths);
    }, [persistShortcutPaths, selectedShortcutPaths]);

    const canPinCurrentPage = !!currentShortcutPath && !selectedShortcutPaths.includes(currentShortcutPath);

    const pinCurrentPage = useCallback(() => {
        if (!currentShortcutPath) return;
        if (selectedShortcutPaths.includes(currentShortcutPath)) return;
        if (selectedShortcutPaths.length >= MAX_SHORTCUTS) return;

        persistShortcutPaths([...selectedShortcutPaths, currentShortcutPath]);
    }, [currentShortcutPath, persistShortcutPaths, selectedShortcutPaths]);

    return {
        maxShortcuts: MAX_SHORTCUTS,
        availableShortcuts,
        selectedShortcutPaths,
        selectedShortcuts,
        currentShortcutPath,
        canPinCurrentPage,
        pinCurrentPage,
        toggleShortcut,
        reorderShortcuts,
    };
};
