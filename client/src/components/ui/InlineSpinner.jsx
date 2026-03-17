/**
 * InlineSpinner — tiny CSS-only spinner for buttons and row actions
 * Usage: <InlineSpinner /> or <InlineSpinner size="lg" />
 */
import './loaders.css';

const InlineSpinner = ({ size = 'md', className = '', style = {} }) => (
  <span
    className={`inline-spinner inline-spinner--${size} ${className}`}
    role="status"
    aria-label="Loading"
    style={style}
  />
);

export default InlineSpinner;
