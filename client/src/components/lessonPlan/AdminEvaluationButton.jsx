import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';

const AdminEvaluationButton = ({ onClick, loading, hasEvaluation }) => {
  const { t } = useTranslation(['lessonPlan']);

  return (
    <button
      type="button"
      className="lesson-menu-item"
      onClick={onClick}
      disabled={loading}
    >
      {loading ? (
        <>
          <span className="spinner-small" />
          {t('lessonPlan:evaluation.button.evaluating')}
        </>
      ) : (
        <>{hasEvaluation ? t('lessonPlan:evaluation.button.view') : t('lessonPlan:evaluation.button.evaluate')}</>
      )}
    </button>
  );
};

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
