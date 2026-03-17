/**
 * PageLoader — full-area loader with spinning ring and message
 * Usage: <PageLoader message="Loading academic excellence data…" subMessage="This may take a moment" />
 */
import './loaders.css';

const PageLoader = ({ message = 'Loading…', subMessage = '' }) => (
  <div className="page-loader" role="status" aria-live="polite">
    <div className="page-loader__ring" aria-hidden="true" />
    {message   && <p className="page-loader__message">{message}</p>}
    {subMessage && <p className="page-loader__sub">{subMessage}</p>}
  </div>
);

export default PageLoader;
