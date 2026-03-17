/**
 * ProgressBar — determinate, indeterminate, or step-based
 *
 * Usage:
 *   <ProgressBar value={60} max={100} label="Importing… 9 / 15" />
 *   <ProgressBar indeterminate label="Generating with AI…" />
 *   <ProgressBar steps={['Upload','Validate','Import','Done']} currentStep={1} />
 */
import './loaders.css';

const CHECK = '✓';
const CROSS = '✕';

const StepsBar = ({ steps, currentStep }) => (
  <div className="progress-steps" role="list" aria-label="Progress steps">
    {steps.map((label, i) => {
      const status =
        i < currentStep  ? 'done'
        : i === currentStep ? 'active'
        : 'pending';
      return (
        <div key={label} className={`progress-step ${status}`} role="listitem">
          <div className="progress-step__dot">
            {status === 'done'  ? CHECK
             : status === 'error' ? CROSS
             : i + 1}
          </div>
          <span className="progress-step__label">{label}</span>
        </div>
      );
    })}
  </div>
);

const ProgressBar = ({
  value      = 0,
  max        = 100,
  label      = '',
  indeterminate = false,
  steps      = null,
  currentStep = 0,
  color      = 'primary',   // 'primary' | 'success' | 'warning' | 'danger'
  size       = 'md',        // 'sm' | 'md' | 'lg'
  className  = '',
}) => {
  if (steps && steps.length > 0) {
    return (
      <div className={`progress-bar-wrap ${className}`}>
        {label && <span className="progress-bar-label">{label}</span>}
        <StepsBar steps={steps} currentStep={currentStep} />
      </div>
    );
  }

  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const fillClass = [
    'progress-bar-fill',
    color !== 'primary' ? `progress-bar-fill--${color}` : '',
    indeterminate ? 'progress-bar-fill--indeterminate' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={`progress-bar-wrap ${className}`} role="status" aria-live="polite">
      {label && <span className="progress-bar-label">{label}</span>}
      <div className={`progress-bar-track progress-bar-track--${size}`} aria-hidden="true">
        <div
          className={fillClass}
          style={indeterminate ? undefined : { width: `${pct}%` }}
        />
      </div>
    </div>
  );
};

export default ProgressBar;
