import { useTranslation } from 'react-i18next';
import { HiOutlineBookOpen, HiOutlineSearch } from 'react-icons/hi';

const AssignmentsEmptyState = ({ filtered = false }) => {
  const { t } = useTranslation(['assignments']);
  return (
    <div className="assignments-empty">
      {filtered ? (
        <HiOutlineSearch size={48} className="empty-icon" />
      ) : (
        <HiOutlineBookOpen size={48} className="empty-icon" />
      )}
      <h3>{filtered ? t('student.empty.noMatchesTitle') : t('student.empty.title')}</h3>
      <p>{filtered ? t('student.empty.noMatchesBody') : t('student.empty.body')}</p>
    </div>
  );
};

export default AssignmentsEmptyState;
