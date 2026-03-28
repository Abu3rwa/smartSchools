export const formatDateValue = (value, locale, notSetLabel) => {
    if (!value) return notSetLabel;
    const parts = String(value).split('-').map((item) => Number(item));
    const date =
        parts.length === 3 && parts.every((part) => Number.isFinite(part))
            ? new Date(parts[0], parts[1] - 1, parts[2])
            : new Date(value);
    if (Number.isNaN(date.getTime())) return notSetLabel;
    return date.toLocaleDateString(locale);
};

export const isArabicOrIslamicSubjectName = (value = '') => {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return false;
    return (
        /\barabic\b/.test(normalized) ||
        /\bislamic\b/.test(normalized) ||
        /\bislamiyat\b/.test(normalized) ||
        /\bquran\b/.test(normalized) ||
        /لغة عربية/.test(normalized) ||
        /عربي/.test(normalized) ||
        /دراسات اسلامية/.test(normalized) ||
        /تربية اسلامية/.test(normalized) ||
        /قرآن/.test(normalized)
    );
};
