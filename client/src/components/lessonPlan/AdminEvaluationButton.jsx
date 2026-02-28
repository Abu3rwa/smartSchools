import PropTypes from 'prop-types';

const AdminEvaluationButton = ({ onClick, loading, hasEvaluation }) => (
  <button
    type="button"
    className="lesson-menu-item"
    onClick={onClick}
    disabled={loading}
  >
    {loading ? (
      <>
        <span className="spinner-small" />
        Evaluating...
      </>
    ) : (
      <>{hasEvaluation ? 'View AI evaluation' : 'Evaluate with AI'}</>
    )}
  </button>
);

AdminEvaluationButton.propTypes = {
  onClick: PropTypes.func.isRequired,
  loading: PropTypes.bool,
  hasEvaluation: PropTypes.bool
};

AdminEvaluationButton.defaultProps = {
  loading: false,
  hasEvaluation: false
};

export default AdminEvaluationButton;
