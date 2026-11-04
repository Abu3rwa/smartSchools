export const toggleSelectedRuleId = (selectedRuleIds = [], ruleId) => {
    const id = String(ruleId || '');
    if (!id) return selectedRuleIds;
    return selectedRuleIds.includes(id)
        ? selectedRuleIds.filter((value) => value !== id)
        : [...selectedRuleIds, id];
};
