const parseNumber = (text, label) => {
    const match = String(text || '').match(new RegExp(`${label}[^\\d]{0,20}(\\d+(?:\\.\\d+)?)`, 'i'));
    return match ? Number(match[1]) : null;
};

export const extractMapFields = (text) => ({
    ritScore: parseNumber(text, 'RIT'),
    percentile: parseNumber(text, 'percentile'),
    growthPercentile: parseNumber(text, 'growth percentile')
});

export default { extractMapFields };
