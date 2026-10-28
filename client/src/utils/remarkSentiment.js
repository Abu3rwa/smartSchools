// Remarks written by the classwork behavior panel are joined with "; " and each part
// carries its score as a trailing "(+2)" or "(-1)". Anything without that suffix is
// free-text and has no sentiment, so it belongs to neither group.
const RULE_REMARK_PREFIX = /^Followed (?:the|classroom) rules:\s*/i;

export const splitRemarksBySentiment = (text) => {
    const positives = [];
    const negatives = [];
    const others = [];

    String(text || '').split(';').map((part) => part.trim()).filter(Boolean).forEach((part) => {
        const remark = part.replace(RULE_REMARK_PREFIX, '').trim();
        const scoreMatch = remark.match(/^(.*?)\s*\(([+-])\s*(\d+(?:\.\d+)?)\)\s*$/);
        if (!scoreMatch) {
            others.push(remark);
        } else if (scoreMatch[2] === '+') {
            positives.push(`${scoreMatch[1].trim()} (+${scoreMatch[3]})`);
        } else {
            negatives.push(`${scoreMatch[1].trim()} (-${scoreMatch[3]})`);
        }
    });

    return { positives, negatives, others };
};
