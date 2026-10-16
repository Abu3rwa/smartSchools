export const parseBooleanEnv = (value) => {
    const raw = String(value ?? '').trim().toLowerCase();
    if (!raw) return false;

    const matches = raw.match(/true|false/g);
    if (!matches || matches.length === 0) return raw === 'true';

    return matches[matches.length - 1] === 'true';
};
