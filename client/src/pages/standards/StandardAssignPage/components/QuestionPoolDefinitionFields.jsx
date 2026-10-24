import {
    OPTION_LABELS,
    NUMERIC_MODES,
    getBlankRows
} from '../utils/questionPoolDefinitions';
import {
    PRACTICE_MAX_OPTIONS,
    PRACTICE_MIN_OPTIONS,
    PRACTICE_MIN_PAIRS,
    PRACTICE_MIN_ORDER_ITEMS,
    PRACTICE_MAX_ORDER_ITEMS
} from '../../../../constants/practiceQuestionTypes';

const relabel = (rows) => rows.map((row, index) => ({ ...row, label: OPTION_LABELS[index] }));

const RowActions = ({ index, length, onMove, onRemove, t }) => (
    <span className="question-pool-row-actions">
        <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => onMove(index, -1)}
            disabled={index === 0}
        >
            {t('standardAssign:questionPool.actions.moveUp')}
        </button>
        <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => onMove(index, 1)}
            disabled={index === length - 1}
        >
            {t('standardAssign:questionPool.actions.moveDown')}
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onRemove}>
            {t('standardAssign:actions.remove')}
        </button>
    </span>
);

/**
 * The authoring controls for the five types that carry their own answer definition.
 * Everything here is stored as an authored definition; the graded key is derived on the server.
 */
const QuestionPoolDefinitionFields = ({ question, onChange, t }) => {
    const patchRow = (key, index, patch) =>
        onChange({ [key]: question[key].map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)) });

    const removeRow = (key, index) => onChange({ [key]: question[key].filter((_, rowIndex) => rowIndex !== index) });

    const moveRow = (key, index, direction) => {
        const target = index + direction;
        if (target < 0 || target >= question[key].length) return;
        const rows = [...question[key]];
        [rows[index], rows[target]] = [rows[target], rows[index]];
        onChange({ [key]: rows });
    };

    const rowProps = (key) => ({
        t,
        onMove: (index, direction) => moveRow(key, index, direction)
    });

    if (question.questionType === 'multiple_select') {
        const toggleCorrect = (label, checked) => {
            const next = new Set(question.correctOptionIds);
            if (checked) next.add(label);
            else next.delete(label);
            onChange({ correctOptionIds: OPTION_LABELS.filter((entry) => next.has(entry)) });
        };
        return (
            <div className="question-pool-rows">
                <p className="question-pool-hint">{t('standardAssign:questionPool.hints.multipleSelect')}</p>
                {question.optionRows.map((row, index) => (
                    <div className="question-pool-row" key={row.label}>
                        <label className="question-pool-check">
                            <input
                                type="checkbox"
                                checked={question.correctOptionIds.includes(row.label)}
                                onChange={(event) => toggleCorrect(row.label, event.target.checked)}
                            />
                            <span>{t('standardAssign:questionPool.labels.optionCorrect')}</span>
                        </label>
                        <input
                            type="text"
                            className="form-input"
                            value={row.text}
                            placeholder={t('standardAssign:questionPool.labels.optionLabel', { label: row.label })}
                            onChange={(event) => patchRow('optionRows', index, { text: event.target.value })}
                        />
                        <span className="question-pool-row-actions">
                            <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => {
                                    const rows = relabel(question.optionRows.filter((_, rowIndex) => rowIndex !== index));
                                    const kept = new Set(rows.map((row) => row.label));
                                    onChange({
                                        optionRows: rows,
                                        correctOptionIds: question.correctOptionIds.filter((label) => kept.has(label))
                                    });
                                }}
                                disabled={question.optionRows.length <= PRACTICE_MIN_OPTIONS}
                            >
                                {t('standardAssign:actions.remove')}
                            </button>
                        </span>
                    </div>
                ))}
                <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() =>
                        onChange({
                            optionRows: relabel([...question.optionRows, { label: '', text: '' }])
                        })
                    }
                    disabled={question.optionRows.length >= PRACTICE_MAX_OPTIONS}
                >
                    {t('standardAssign:questionPool.actions.addOption')}
                </button>
            </div>
        );
    }

    if (question.questionType === 'matching') {
        return (
            <div className="question-pool-rows">
                <p className="question-pool-hint">
                    {t('standardAssign:questionPool.hints.matching', { min: PRACTICE_MIN_PAIRS })}
                </p>
                {question.matchingPairs.map((pair, index) => (
                    <div className="question-pool-row" key={`pair-${index}`}>
                        <input
                            type="text"
                            className="form-input"
                            value={pair.left}
                            placeholder={t('standardAssign:questionPool.labels.pairLeft')}
                            onChange={(event) => patchRow('matchingPairs', index, { left: event.target.value })}
                        />
                        <input
                            type="text"
                            className="form-input"
                            value={pair.right}
                            placeholder={t('standardAssign:questionPool.labels.pairRight')}
                            onChange={(event) => patchRow('matchingPairs', index, { right: event.target.value })}
                        />
                        <RowActions
                            {...rowProps('matchingPairs')}
                            index={index}
                            length={question.matchingPairs.length}
                            onRemove={() => removeRow('matchingPairs', index)}
                        />
                    </div>
                ))}
                <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => onChange({ matchingPairs: [...question.matchingPairs, { left: '', right: '' }] })}
                >
                    {t('standardAssign:questionPool.actions.addPair')}
                </button>
            </div>
        );
    }

    if (question.questionType === 'ordering') {
        return (
            <div className="question-pool-rows">
                <p className="question-pool-hint">
                    {t('standardAssign:questionPool.hints.ordering', {
                        min: PRACTICE_MIN_ORDER_ITEMS,
                        max: PRACTICE_MAX_ORDER_ITEMS
                    })}
                </p>
                {question.orderingItems.map((item, index) => (
                    <div className="question-pool-row" key={`order-${index}`}>
                        <span className="question-pool-row-position">{index + 1}</span>
                        <input
                            type="text"
                            className="form-input"
                            value={item.text}
                            placeholder={t('standardAssign:questionPool.labels.orderStep', { index: index + 1 })}
                            onChange={(event) => patchRow('orderingItems', index, { text: event.target.value })}
                        />
                        <RowActions
                            {...rowProps('orderingItems')}
                            index={index}
                            length={question.orderingItems.length}
                            onRemove={() => removeRow('orderingItems', index)}
                        />
                    </div>
                ))}
                <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => onChange({ orderingItems: [...question.orderingItems, { id: '', text: '' }] })}
                    disabled={question.orderingItems.length >= PRACTICE_MAX_ORDER_ITEMS}
                >
                    {t('standardAssign:questionPool.actions.addStep')}
                </button>
            </div>
        );
    }

    if (question.questionType === 'fill_in_blank') {
        const rows = getBlankRows(question, question.questionText);
        const setAnswer = (id, value) => {
            const others = question.blanks.filter((blank) => blank.id !== id);
            onChange({ blanks: [...others, { id, acceptsText: value }] });
        };
        if (!rows.length) {
            return <p className="question-pool-hint">{t('standardAssign:questionPool.hints.blankTokens')}</p>;
        }
        return (
            <div className="question-pool-rows">
                <p className="question-pool-hint">{t('standardAssign:questionPool.hints.fillInBlank')}</p>
                {rows.map((row) => (
                    <div className="form-group" key={row.id}>
                        <label>
                            {t('standardAssign:questionPool.labels.blankAnswers', { id: row.id })}
                        </label>
                        <input
                            type="text"
                            className="form-input"
                            value={row.acceptsText}
                            placeholder={t('standardAssign:questionPool.placeholders.blankAnswers')}
                            onChange={(event) => setAnswer(row.id, event.target.value)}
                        />
                    </div>
                ))}
            </div>
        );
    }

    if (question.questionType === 'numeric_response') {
        const rule = question.numericRule;
        const patchRule = (patch) => onChange({ numericRule: { ...rule, ...patch } });
        const isRange = rule.mode === 'range';
        return (
            <div className="question-pool-grid">
                <div className="form-group">
                    <label>{t('standardAssign:questionPool.labels.numericMode')}</label>
                    <select
                        className="form-input"
                        value={rule.mode}
                        onChange={(event) => patchRule({ mode: event.target.value })}
                    >
                        {NUMERIC_MODES.map((mode) => (
                            <option key={mode} value={mode}>
                                {t(`standardAssign:questionPool.numericModes.${mode}`)}
                            </option>
                        ))}
                    </select>
                </div>
                {isRange ? (
                    <>
                        <div className="form-group">
                            <label>{t('standardAssign:questionPool.labels.numericMin')}</label>
                            <input
                                type="text"
                                className="form-input"
                                value={rule.min}
                                onChange={(event) => patchRule({ min: event.target.value })}
                            />
                        </div>
                        <div className="form-group">
                            <label>{t('standardAssign:questionPool.labels.numericMax')}</label>
                            <input
                                type="text"
                                className="form-input"
                                value={rule.max}
                                onChange={(event) => patchRule({ max: event.target.value })}
                            />
                        </div>
                    </>
                ) : (
                    <>
                        <div className="form-group">
                            <label>{t('standardAssign:questionPool.labels.numericValue')}</label>
                            <input
                                type="text"
                                className="form-input"
                                value={rule.value}
                                onChange={(event) => patchRule({ value: event.target.value })}
                            />
                        </div>
                        {(rule.mode === 'tolerance' || rule.mode === 'relative') && (
                            <div className="form-group">
                                <label>
                                    {t(
                                        `standardAssign:questionPool.labels.${
                                            rule.mode === 'relative' ? 'numericPercentValue' : 'numericTolerance'
                                        }`
                                    )}
                                </label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={rule.tolerance}
                                    onChange={(event) => patchRule({ tolerance: event.target.value })}
                                />
                            </div>
                        )}
                    </>
                )}
                <div className="form-group">
                    <label>{t('standardAssign:questionPool.labels.numericUnit')}</label>
                    <input
                        type="text"
                        className="form-input"
                        value={rule.unit}
                        onChange={(event) => patchRule({ unit: event.target.value })}
                    />
                </div>
                <div className="form-group">
                    <label>{t('standardAssign:questionPool.labels.numericDecimals')}</label>
                    <input
                        type="text"
                        className="form-input"
                        value={rule.decimalPlaces}
                        onChange={(event) => patchRule({ decimalPlaces: event.target.value })}
                    />
                </div>
                <label className="question-pool-check">
                    <input
                        type="checkbox"
                        checked={rule.allowFractions}
                        onChange={(event) => patchRule({ allowFractions: event.target.checked })}
                    />
                    <span>{t('standardAssign:questionPool.labels.allowFractions')}</span>
                </label>
                <label className="question-pool-check">
                    <input
                        type="checkbox"
                        checked={rule.allowPercent}
                        onChange={(event) => patchRule({ allowPercent: event.target.checked })}
                    />
                    <span>{t('standardAssign:questionPool.labels.allowPercent')}</span>
                </label>
            </div>
        );
    }

    return null;
};

export default QuestionPoolDefinitionFields;
