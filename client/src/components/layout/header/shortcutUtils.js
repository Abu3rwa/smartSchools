export const getShortcutsStorageKey = (user) => (
    `gb:headerShortcuts:${user?.id || user?._id || user?.email || 'anonymous'}`
);

export const normalizeShortcutPaths = ({
    rawPaths,
    availablePaths,
    maxShortcuts,
    fallbackPaths = []
}) => {
    if (!Array.isArray(rawPaths)) {
        return fallbackPaths.slice(0, maxShortcuts);
    }

    const normalized = [];
    const seen = new Set();
    for (const value of rawPaths) {
        const path = String(value || '').trim();
        if (!path || seen.has(path) || !availablePaths.has(path)) continue;
        seen.add(path);
        normalized.push(path);
        if (normalized.length >= maxShortcuts) break;
    }

    return normalized.length > 0
        ? normalized
        : fallbackPaths.slice(0, maxShortcuts);
};

export const resolveCurrentShortcutPath = (pathname, availableShortcuts) => {
    const matches = availableShortcuts.filter((item) => (
        pathname === item.path || pathname.startsWith(`${item.path}/`)
    ));
    if (matches.length === 0) return null;

    matches.sort((left, right) => right.path.length - left.path.length);
    return matches[0].path;
};
