/**
 * Fixture text assembled from the examples in `reading-fluency-plan.md`. It is
 * deliberately awkward in the same ways the real *Creating a Nation* passage
 * is: years, possessives, em dashes and a timeline.
 */
export const PASSAGE = [
    'In 1765, Parliament passed the Stamp Act.',
    'The colonists were angry.',
    'Merchants in Boston refused to sell British goods.',
    'Parliament repealed the law in 1766.',
    'Before long, the situation grew worse.',
    'In 1770, British soldiers fired into a disorderly crowd in Boston.',
    'Five colonists died.',
    'This tragedy is known as the Boston Massacre.',
    "Colonists' anger grew.",
    'They dumped the cargo—tea—overboard.',
    'George III sent soldiers to keep order.',
    'On July 4, 1776, the colonies declared independence.'
].join(' ');

export const SHORT_PASSAGE = 'The colonists were angry. They refused to pay the tax.';

/** Word objects shaped like whisper-1's verbose_json output. */
export const timedWords = (text, { wordSeconds = 0.4, gapSeconds = 0.1, pauses = {} } = {}) => {
    const words = String(text || '').match(/\S+/g) || [];
    let time = 0;
    return words.map((word, index) => {
        time += Number(pauses[index]) || 0;
        const start = Number(time.toFixed(2));
        const end = Number((time + wordSeconds).toFixed(2));
        time = end + gapSeconds;
        return { word, start, end };
    });
};

export const firstWords = (text, count) => (String(text || '').match(/\S+/g) || [])
    .slice(0, count)
    .join(' ');
