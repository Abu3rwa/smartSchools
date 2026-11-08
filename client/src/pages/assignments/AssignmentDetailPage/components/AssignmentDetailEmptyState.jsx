import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { HiOutlineArrowLeft } from 'react-icons/hi';

const AssignmentDetailEmptyState = ({ isParent = false }) => {
  const { t } = useTranslation(['assignments']);

  return (
    <div className="student-assignment-detail-page">
      <Link
        to={isParent ? '/portal/dashboard' : '/portal/my-assignments'}
        className="btn btn-ghost back-btn"
      >
        <HiOutlineArrowLeft size={18} />
        {isParent ? t('detail.backToDashboard') : t('detail.backToAssignments')}
      </Link>
      <div className="detail-empty">
        <h3>{t('detail.unavailableTitle')}</h3>
        <p>{t('detail.unavailableBody')}</p>
      </div>
    </div>
  );
};

export default AssignmentDetailEmptyState;
