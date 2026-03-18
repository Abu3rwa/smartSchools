import { useCallback, useRef, useState } from 'react';
import { getScaleBgColor, getScaleColor, getScaleLevelInfo, SCALE_OPTIONS } from '../../../../utils/sbrScaleUtils';

const GradebookCell = ({ studentId, standardId, cellData, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const cellRef = useRef(null);

  const score = cellData?.effectiveScore;
  const isManual = cellData?.isManual || false;
  const isPending = cellData?.isPending || false;
  const hasValue = score !== null && score !== undefined;

  const bgColor = hasValue ? getScaleBgColor(score) : 'transparent';
  const textColor = hasValue ? getScaleColor(score) : '#a0aec0';
  const info = hasValue ? getScaleLevelInfo(score) : null;

  const handleClick = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const handleSelect = useCallback((value) => {
    onChange(studentId, standardId, value);
    setIsOpen(false);
  }, [studentId, standardId, onChange]);

  const handleKeyDown = useCallback((e) => {
    const num = Number(e.key);
    if (Number.isInteger(num) && num >= 0 && num <= 4) {
      e.preventDefault();
      onChange(studentId, standardId, num);
      setIsOpen(false);
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      onChange(studentId, standardId, null);
      setIsOpen(false);
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setIsOpen((prev) => !prev);
    }
    if (e.key === 'Escape') {
      setIsOpen(false);
    }
  }, [studentId, standardId, onChange]);

  const tooltipText = info
    ? `${info.label}${cellData?.percentage != null ? ` (${cellData.percentage.toFixed(1)}%)` : ''}${isManual ? ' ✎ Manual' : ''}${isPending ? ' • Unsaved' : ''}`
    : 'Click to enter grade (0–4)';

  return (
    <td
      ref={cellRef}
      className={`gb-cell${isPending ? ' gb-cell--pending' : ''}${isManual ? ' gb-cell--manual' : ''}`}
      style={{ backgroundColor: bgColor, cursor: 'pointer', position: 'relative' }}
      tabIndex={0}
      role="gridcell"
      title={tooltipText}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      <span className="gb-cell__value" style={{ color: textColor, fontWeight: hasValue ? 600 : 400 }}>
        {hasValue ? score : ''}
      </span>
      {isManual && hasValue && <span className="gb-cell__manual-icon">✎</span>}

      {isOpen && (
        <div className="gb-cell__dropdown">
          {SCALE_OPTIONS.map((opt) => (
            <button
              key={opt}
              type="button"
              className={`gb-cell__option${opt === score ? ' gb-cell__option--active' : ''}`}
              style={{ backgroundColor: getScaleBgColor(opt), color: getScaleColor(opt) }}
              onClick={(e) => { e.stopPropagation(); handleSelect(opt); }}
            >
              {opt}
            </button>
          ))}
          <button
            type="button"
            className="gb-cell__option gb-cell__option--clear"
            onClick={(e) => { e.stopPropagation(); handleSelect(null); }}
          >
            ✕
          </button>
        </div>
      )}
    </td>
  );
};

export default GradebookCell;
