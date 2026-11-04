/**
 * The classwork behaviour score, computed on the server from the check's own
 * rule snapshot. It must stay in step with
 * client/src/components/grades/classworkBehaviorUtils.js: the remark text is
 * parsed by remarkSentiment.js and by parent emails.
 */
export const DEFAULT_CLASSWORK_RULES = Object.freeze([
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
]);

const normalizeNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

export const normalizeClassworkRule = (rule, index = 0) => {
  const direction = rule?.direction === 'negative' ? 'negative' : 'positive';
  const absoluteValue = Math.abs(normalizeNumber(rule?.value, 1));

  return {
    id: String(rule?.id || `classwork-rule-${index + 1}`).slice(0, 80),
    label: String(rule?.label || '').trim().slice(0, 200),
    labelAr: String(rule?.labelAr || '').trim().slice(0, 200),
    value: direction === 'negative' ? -absoluteValue : absoluteValue,
    direction
  };
};

export const normalizeClassworkRules = (rules) => {
  const source = Array.isArray(rules) ? rules : DEFAULT_CLASSWORK_RULES;
  return source
    .slice(0, 100)
    .map(normalizeClassworkRule)
    .filter((rule) => rule.label && rule.value !== 0);
};

/** Additive mode from 0, capped at maxMarks, exactly like the client helper. */
export const computeClassworkScore = ({
  maxMarks,
  selectedRuleIds = [],
  rules = DEFAULT_CLASSWORK_RULES
}) => {
  const maximum = Math.max(0, normalizeNumber(maxMarks, 10));
  const normalizedRules = normalizeClassworkRules(rules);
  const selectedIds = new Set(selectedRuleIds);
  const selectedRules = normalizedRules.filter((rule) => selectedIds.has(rule.id));
  const bonus = selectedRules
    .filter((rule) => rule.value > 0)
    .reduce((total, rule) => total + rule.value, 0);
  const deductions = selectedRules
    .filter((rule) => rule.value < 0)
    .reduce((total, rule) => total + rule.value, 0);
  const score = Math.max(0, Math.min(maximum, bonus + deductions));

  return { score, maxMarks: maximum, selectedRules };
};

export const buildClassworkRemark = (selectedRules = []) => selectedRules
  .map((rule) => `${rule.label} (${rule.value > 0 ? '+' : ''}${rule.value})`)
  .filter(Boolean)
  .join('; ');

/** Only ids that exist in the check's snapshot count; the list is capped. */
export const pickSelectedRuleIds = (selectedRuleIds, rules, limit = 100) => {
  if (!Array.isArray(selectedRuleIds)) return [];
  const known = new Set(normalizeClassworkRules(rules).map((rule) => rule.id));
  const picked = [];
  for (const value of selectedRuleIds) {
    const id = String(value || '').trim();
    if (!id || !known.has(id) || picked.includes(id)) continue;
    picked.push(id);
    if (picked.length >= limit) break;
  }
  return picked;
};
