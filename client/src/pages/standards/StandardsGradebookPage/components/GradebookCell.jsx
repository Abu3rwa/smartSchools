import { useCallback, useEffect, useRef, useState } from 'react';
import { getScaleBgColor, getScaleColor, getScaleLevelInfo } from '../../../../utils/sbrScaleUtils';

const GradebookCell = ({ studentId, standardId, cellData, onChange }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draftValue, setDraftValue] = useState('');
  const cellRef = useRef(null);
  const inputRef = useRef(null);

  const score = cellData?.effectiveScore;
  const isManual = cellData?.isManual || false;
  const isPending = cellData?.isPending || false;
  const hasValue = score !== null && score !== undefined;
  const normalizedScore = hasValue ? Math.max(0, Math.min(4, Math.round(Number(score)))) : null;
  const displayScore = hasValue
    ? (Number.isInteger(Number(score)) ? Number(score) : Number(score).toFixed(1))
    : 'NAN';

  const bgColor = hasValue ? getScaleBgColor(normalizedScore) : 'transparent';
  const textColor = hasValue ? getScaleColor(normalizedScore) : 'var(--text-secondary, #a0aec0)';
  const info = hasValue ? getScaleLevelInfo(normalizedScore) : null;

  useEffect(() => {
    if (!isEditing) {
      setDraftValue(hasValue ? String(score) : '');
    }
  }, [hasValue, isEditing, score]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleClick = useCallback(() => {
    setDraftValue(hasValue ? String(score) : '');
    setIsEditing(true);
  }, [hasValue, score]);

  const commitValue = useCallback(() => {
    const trimmed = String(draftValue || '').trim();
    if (!trimmed) {
      onChange(studentId, standardId, null);
      setIsEditing(false);
      return;
    }

    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      setIsEditing(false);
      return;
    }

    const nextValue = Math.max(0, Math.min(4, parsed));
    onChange(studentId, standardId, Number(nextValue.toFixed(2)));
    setIsEditing(false);
  }, [draftValue, onChange, standardId, studentId]);

  const cancelEditing = useCallback(() => {
    setDraftValue(hasValue ? String(score) : '');
    setIsEditing(false);
  }, [hasValue, score]);

  const handleInputKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitValue();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      cancelEditing();
    }
  }, [cancelEditing, commitValue]);

  const handleBlur = useCallback(() => {
    commitValue();
  }, [commitValue]);

  const handleCellKeyDown = useCallback((e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setDraftValue(hasValue ? String(score) : '');
      setIsEditing(true);
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      onChange(studentId, standardId, null);
    }
  }, [hasValue, onChange, score, standardId, studentId]);

  const tooltipText = info
    ? `${info.label}${cellData?.percentage != null ? ` (${cellData.percentage.toFixed(1)}%)` : ''}${isManual ? ' ✎ Manual' : ''}${isPending ? ' • Unsaved' : ''}`
    : 'Type a manual score';

  return (
    <td
      ref={cellRef}
      className={`gb-cell${isPending ? ' gb-cell--pending' : ''}${isManual ? ' gb-cell--manual' : ''}`}
      style={{ backgroundColor: bgColor, cursor: 'pointer', position: 'relative' }}
      tabIndex={0}
      role="gridcell"
      title={tooltipText}
      onClick={handleClick}
      onKeyDown={handleCellKeyDown}
    >
      {isEditing ? (
        <input
          ref={inputRef}
          type="number"
          min="0"
          max="4"
          step="0.01"
          className="gb-cell__input"
          value={draftValue}
          onChange={(e) => setDraftValue(e.target.value)}
          onKeyDown={handleInputKeyDown}
          onBlur={handleBlur}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="gb-cell__value" style={{ color: textColor, fontWeight: hasValue ? 600 : 400 }}>
          {displayScore}
        </span>
      )}
      {isManual && hasValue && <span className="gb-cell__manual-icon">✎</span>}
    </td>
  );
};

export default GradebookCell;
