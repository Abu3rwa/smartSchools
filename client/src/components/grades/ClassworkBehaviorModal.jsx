import { useEffect, useMemo, useState } from 'react';
import api from '../../config/api';
import {
    buildClassworkRemark,
    calculateClassworkScore,
    DEFAULT_CLASSWORK_RULES,
    normalizeClassworkRules
} from './classworkBehaviorUtils';
import './ClassworkBehaviorModal.css';

const appliedSelections = new Map();

const getStorageKey = (userId) => `classwork_behavior_rules_${userId || 'default'}`;

const loadRules = (userId) => {
    try {
        const saved = window.localStorage.getItem(getStorageKey(userId))
            || window.localStorage.getItem(getStorageKey(null));
        if (!saved) return DEFAULT_CLASSWORK_RULES;
        return migrateRules(JSON.parse(saved));
    } catch {
        return DEFAULT_CLASSWORK_RULES;
    }
};

const migrateRules = (savedRules) => {
    const defaultRulesById = new Map(DEFAULT_CLASSWORK_RULES.map((rule) => [rule.id, rule]));
    const legacyDefaultValues = {
        'active-participation': 1,
        'completed-on-time': 1,
        'followed-rules': 1
    };
    return normalizeClassworkRules(savedRules).map((rule) => {
        const defaultRule = defaultRulesById.get(rule.id);
        const legacyValue = legacyDefaultValues[rule.id];
        return defaultRule
            && rule.label === defaultRule.label
            && rule.value === legacyValue
            ? defaultRule
            : rule;
    });
};

const saveRulesToServer = (rules) => api.put('/auth/profile', {
    uiPreferences: { classworkBehaviorRules: rules }
}).catch(() => {});

const ClassworkBehaviorModal = ({
    student,
    currentRow = {},
    maxMarks,
    userId,
    onApply,
    onClose,
    onApplyNext,
    hasNext = false
}) => {
    const [rules, setRules] = useState(() => loadRules(userId));
    const studentKey = student?._id || student?.id;
    // Restore the previous selection only if the row still holds the remarks it produced
    const [saved] = useState(() => {
        const entry = appliedSelections.get(studentKey);
        return entry && entry.remarks === (currentRow?.remarks || '') ? entry : null;
    });
    const [selectedRuleIds, setSelectedRuleIds] = useState(() => saved?.selectedRuleIds || []);
    const [baseScore, setBaseScore] = useState(() => saved?.baseScore ?? 0);
    const [personalNote, setPersonalNote] = useState(() => (
        saved ? saved.personalNote : (currentRow?.remarks || '')
    ));
    const [configuring, setConfiguring] = useState(false);

    // Server copy follows the teacher across browsers; push local rules up once if none are saved yet
    useEffect(() => {
        let cancelled = false;
        api.get('/auth/me').then((response) => {
            if (cancelled) return;
            const user = response?.data?.data?.user;
            const serverRules = user?.uiPreferences?.classworkBehaviorRules;
            if (Array.isArray(serverRules) && serverRules.length) {
                const next = migrateRules(serverRules);
                setRules(next);
                window.localStorage.setItem(getStorageKey(userId), JSON.stringify(next));
            } else {
                const local = loadRules(userId);
                if (local !== DEFAULT_CLASSWORK_RULES) saveRulesToServer(local);
            }
        }).catch(() => {});
        return () => { cancelled = true; };
    }, [userId]);

    const result = useMemo(() => calculateClassworkScore({
        maxMarks,
        baseScore,
        selectedRuleIds,
        rules
    }), [baseScore, maxMarks, rules, selectedRuleIds]);

    const remarks = useMemo(
        () => buildClassworkRemark(result.selectedRules, personalNote),
        [personalNote, result.selectedRules]
    );

    const toggleRule = (ruleId) => {
        setSelectedRuleIds((current) => current.includes(ruleId)
            ? current.filter((id) => id !== ruleId)
            : [...current, ruleId]);
    };

    const updateRule = (ruleId, field, value) => {
        const nextRules = rules.map((rule) => {
            if (rule.id !== ruleId) return rule;
            const nextDirection = field === 'direction' ? value : rule.direction;
            const nextValue = field === 'value' ? Number(value) : Math.abs(rule.value);
            return {
                ...rule,
                [field]: field === 'value' ? nextValue : value,
                direction: nextDirection,
                value: nextDirection === 'negative' ? -Math.abs(nextValue) : Math.abs(nextValue)
            };
        });
        persistRules(nextRules);
    };

    const persistRules = (nextRules) => {
        setRules(nextRules);
        window.localStorage.setItem(getStorageKey(userId), JSON.stringify(nextRules));
        saveRulesToServer(nextRules);
    };

    const addRule = () => {
        const nextRules = [...rules, {
            id: `classwork-rule-${rules.length + 1}`,
            label: 'New behavior',
            value: 1,
            direction: 'positive'
        }];
        persistRules(nextRules);
    };

    const removeRule = (ruleId) => {
        persistRules(rules.filter((rule) => rule.id !== ruleId));
        setSelectedRuleIds((current) => current.filter((id) => id !== ruleId));
    };

    const resetRules = () => persistRules(DEFAULT_CLASSWORK_RULES);

    const apply = (advance = false) => {
        const payload = { marks: result.score, remarks };
        appliedSelections.set(studentKey, { selectedRuleIds, baseScore, personalNote, remarks });
        if (advance && onApplyNext) {
            onApplyNext(payload);
        } else {
            onApply(payload);
        }
    };

    const studentName = student?.fullName || `${student?.firstName || ''} ${student?.lastName || ''}`.trim();
    const positiveRules = rules.filter((rule) => rule.value > 0);
    const negativeRules = rules.filter((rule) => rule.value < 0);

    return (
        <div className="classwork-behavior-overlay" role="presentation" onMouseDown={onClose}>
            <div className="classwork-behavior-modal" role="dialog" aria-modal="true" aria-labelledby="classwork-behavior-title" onMouseDown={(event) => event.stopPropagation()}>
                <div className="classwork-behavior-header">
                    <div>
                        <span className="classwork-behavior-eyebrow">Classwork behavior</span>
                        <h2 id="classwork-behavior-title">{studentName || 'Student'}</h2>
                    </div>
                    <button type="button" className="classwork-behavior-close" onClick={onClose} aria-label="Close">×</button>
                </div>

                <div className="classwork-behavior-score">
                    <strong>{result.score}</strong><span>/ {result.maxMarks}</span>
                    <div className="classwork-behavior-breakdown">
                        Base {result.base} · Bonus +{result.bonus} · Deductions {result.deductions}
                    </div>
                </div>

                {!configuring ? (
                    <>
                        <div className="classwork-behavior-rule-columns">
                            <RuleColumn title="Positive behaviors" rules={positiveRules} selectedRuleIds={selectedRuleIds} onToggle={toggleRule} />
                            <RuleColumn title="Needs attention" rules={negativeRules} selectedRuleIds={selectedRuleIds} onToggle={toggleRule} negative />
                        </div>
                        <label className="classwork-behavior-field">
                            <span>Base score</span>
                            <input type="number" min="0" max={maxMarks} step="0.01" value={baseScore} onChange={(event) => setBaseScore(event.target.value)} />
                        </label>
                        <label className="classwork-behavior-field">
                            <span>Remark</span>
                            <textarea value={remarks} onChange={(event) => setPersonalNote(event.target.value)} placeholder="Optional teacher note" rows={3} />
                        </label>
                    </>
                ) : (
                    <div className="classwork-behavior-config">
                        <div className="classwork-behavior-config-heading">
                            <h3>Configure rules</h3>
                            <button type="button" className="btn btn-outline btn-sm" onClick={addRule}>Add rule</button>
                        </div>
                        {rules.map((rule) => (
                            <div className="classwork-behavior-config-row" key={rule.id}>
                                <input value={rule.label} onChange={(event) => updateRule(rule.id, 'label', event.target.value)} aria-label="Rule label" />
                                <select value={rule.direction} onChange={(event) => updateRule(rule.id, 'direction', event.target.value)} aria-label="Rule direction">
                                    <option value="positive">Positive</option>
                                    <option value="negative">Negative</option>
                                </select>
                                <input type="number" min="0.01" step="0.01" value={Math.abs(rule.value)} onChange={(event) => updateRule(rule.id, 'value', event.target.value)} aria-label="Rule points" />
                                <button type="button" className="btn btn-outline btn-sm" onClick={() => removeRule(rule.id)}>Delete</button>
                            </div>
                        ))}
                        <button type="button" className="btn btn-outline btn-sm" onClick={resetRules}>Reset defaults</button>
                    </div>
                )}

                <div className="classwork-behavior-footer">
                    <button type="button" className="btn btn-outline" onClick={() => setConfiguring((current) => !current)}>{configuring ? 'Back to scoring' : 'Configure rules'}</button>
                    <div className="classwork-behavior-footer-actions">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
                        {!configuring && <button type="button" className="btn btn-primary" onClick={() => apply(false)}>Apply</button>}
                        {!configuring && hasNext && <button type="button" className="btn btn-primary" onClick={() => apply(true)}>Apply &amp; Next</button>}
                    </div>
                </div>
            </div>
        </div>
    );
};

const RuleColumn = ({ title, rules, selectedRuleIds, onToggle, negative = false }) => (
    <section className={`classwork-behavior-rule-column${negative ? ' negative' : ''}`}>
        <h3>{title}</h3>
        {rules.map((rule) => (
            <label
                className={`classwork-behavior-rule${selectedRuleIds.includes(rule.id) ? ' selected' : ''}`}
                key={rule.id}
            >
                <span className="classwork-behavior-rule-label">
                    <input
                        type="checkbox"
                        checked={selectedRuleIds.includes(rule.id)}
                        onChange={() => onToggle(rule.id)}
                    />
                    {rule.label}
                </span>
                <strong>{rule.value > 0 ? '+' : ''}{rule.value}</strong>
            </label>
        ))}
    </section>
);

export default ClassworkBehaviorModal;