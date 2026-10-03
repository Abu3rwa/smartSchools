export const DEFAULT_CLASSWORK_RULES = [
    { id: 'active-participation', label: 'Active participation & focus', value: 2, direction: 'positive' },
    { id: 'completed-on-time', label: 'Completed classwork on time', value: 4, direction: 'positive' },
    { id: 'followed-rules', label: 'Followed classroom rules', value: 2, direction: 'positive' },
    { id: 'helpful-teamwork', label: 'Helpful to peers / Teamwork', value: 1, direction: 'positive' },
    { id: 'exceptional-effort', label: 'Exceptional effort', value: 1, direction: 'positive' },
    { id: 'talking-out-of-turn', label: 'Disruptive / Talking out of turn', value: -1, direction: 'negative' },
    { id: 'off-task', label: 'Off-task / Not working', value: -1, direction: 'negative' },
    { id: 'incomplete-classwork', label: 'Incomplete classwork', value: -2, direction: 'negative' },
    { id: 'missing-materials', label: 'Unprepared / Missing materials', value: -1, direction: 'negative' },
    { id: 'refusal-to-follow-rules', label: 'Disrespectful / Refusal to follow rules', value: -2, direction: 'negative' }
];

const normalizeNumber = (value, fallback = 0) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
};

export const normalizeClassworkRule = (rule, index = 0) => {
    const direction = rule?.direction === 'negative' ? 'negative' : 'positive';
    const absoluteValue = Math.abs(normalizeNumber(rule?.value, 1));

    return {
        id: String(rule?.id || `classwork-rule-${index + 1}`),
        label: String(rule?.label || '').trim(),
        value: direction === 'negative' ? -absoluteValue : absoluteValue,
        direction
    };
};

export const normalizeClassworkRules = (rules) => {
    const source = Array.isArray(rules) ? rules : DEFAULT_CLASSWORK_RULES;
    return source
        .map(normalizeClassworkRule)
        .filter((rule) => rule.label && rule.value !== 0);
};

export const isClassworkAssignment = (assignment) => {
    const key = assignment?.assignmentTypeKey || assignment?.assignmentType?.key;
    const name = assignment?.assignmentTypeName || assignment?.assignmentType?.name;
    return [key, name].some((value) => String(value || '').trim().toLowerCase() === 'classwork');
};

export const calculateClassworkScore = ({
    maxMarks,
    baseScore = 0,
    selectedRuleIds = [],
    rules = DEFAULT_CLASSWORK_RULES,
    mode = 'base'
}) => {
    const maximum = Math.max(0, normalizeNumber(maxMarks, 10));
    const normalizedRules = normalizeClassworkRules(rules);
    const selectedIds = new Set(selectedRuleIds);
    const selectedRules = normalizedRules.filter((rule) => selectedIds.has(rule.id));
    const base = mode === 'additive' ? 0 : Math.min(maximum, Math.max(0, normalizeNumber(baseScore, 0)));
    const bonus = selectedRules
        .filter((rule) => rule.value > 0)
        .reduce((total, rule) => total + rule.value, 0);
    const deductions = selectedRules
        .filter((rule) => rule.value < 0)
        .reduce((total, rule) => total + rule.value, 0);
    const score = Math.max(0, Math.min(maximum, base + bonus + deductions));

    return {
        score,
        maxMarks: maximum,
        base,
        bonus,
        deductions,
        net: bonus + deductions,
        selectedRules
    };
};

export const buildClassworkRemark = (selectedRules = [], personalNote = '') => {
    const ruleRemarks = selectedRules
        .map((rule) => `${rule.label} (${rule.value > 0 ? '+' : ''}${rule.value})`)
        .filter(Boolean);
    const note = String(personalNote || '').trim();
    return [...ruleRemarks, ...(note ? [note] : [])].join('; ');
};
