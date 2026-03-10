import { HiOutlinePlus, HiOutlineOfficeBuilding, HiOutlinePencil, HiOutlineTrash } from 'react-icons/hi';
import { useTranslation } from 'react-i18next';

const DepartmentsTab = ({
  departments,
  loading,
  error,
  onRetry,
  onOpenModal,
  onEdit,
  onDelete,
  modal
}) => {
  const { t } = useTranslation(['schoolSettings', 'common']);

  return (
    <div className="tab-content">
      <div className="tab-header">
        <span>{t('schoolSettings:departments.helpText')}</span>
        <button className="btn btn-primary" onClick={onOpenModal}>
          <HiOutlinePlus size={20} />
          {t('schoolSettings:departments.actions.addDepartment')}
        </button>
      </div>

      {loading ? (
        <div className="loading-container">
          <div className="spinner"></div>
        </div>
      ) : error ? (
        <div className="error-container">
          <p className="error-message">{error}</p>
          <button className="btn btn-primary" onClick={onRetry}>
            {t('common:actions.retry')}
          </button>
        </div>
      ) : (
        <div className="departments-list">
          {departments.map((dept) => (
            <div key={dept._id} className="department-card card">
              <div className="department-main">
                <div className="department-icon">
                  <HiOutlineOfficeBuilding size={20} />
                </div>
                <div>
                  <h3>{dept.name}</h3>
                  <p className="department-desc">{dept.description || t('schoolSettings:departments.noDescription')}</p>
                  <span className="badge badge-primary">
                    {t(`schoolSettings:departments.type.${String(dept.type || 'academic').toLowerCase()}`, {
                      defaultValue: String(dept.type || 'academic')
                    })}
                  </span>
                </div>
              </div>
              <div className="department-actions">
                <button className="btn btn-sm btn-secondary" onClick={() => onEdit(dept)}>
                  <HiOutlinePencil size={16} />
                  {t('schoolSettings:departments.actions.edit')}
                </button>
                <button className="btn btn-sm btn-danger" onClick={() => onDelete(dept._id)}>
                  <HiOutlineTrash size={16} />
                  {t('schoolSettings:departments.actions.delete')}
                </button>
              </div>
            </div>
          ))}
          {departments.length === 0 && (
            <div className="empty-state">
              <HiOutlineOfficeBuilding size={48} />
              <p>{t('schoolSettings:departments.empty')}</p>
            </div>
          )}
        </div>
      )}

      {modal}
    </div>
  );
};

export default DepartmentsTab;
