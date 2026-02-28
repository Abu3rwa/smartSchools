import { HiOutlinePlus, HiOutlineOfficeBuilding, HiOutlinePencil, HiOutlineTrash } from 'react-icons/hi';

const DepartmentsTab = ({
  departments,
  loading,
  error,
  onRetry,
  onOpenModal,
  onEdit,
  onDelete,
  modal
}) => (
  <div className="tab-content">
    <div className="tab-header">
      <span>Create and manage departments (e.g. Middle School, IT, HR).</span>
      <button className="btn btn-primary" onClick={onOpenModal}>
        <HiOutlinePlus size={20} />
        Add department
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
          Retry
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
                <p className="department-desc">{dept.description || 'No description'}</p>
                <span className="badge badge-primary">{dept.type || 'academic'}</span>
              </div>
            </div>
            <div className="department-actions">
              <button className="btn btn-sm btn-secondary" onClick={() => onEdit(dept)}>
                <HiOutlinePencil size={16} />
                Edit
              </button>
              <button className="btn btn-sm btn-danger" onClick={() => onDelete(dept._id)}>
                <HiOutlineTrash size={16} />
                Delete
              </button>
            </div>
          </div>
        ))}
        {departments.length === 0 && (
          <div className="empty-state">
            <HiOutlineOfficeBuilding size={48} />
            <p>No departments yet. Add one to get started.</p>
          </div>
        )}
      </div>
    )}

    {modal}
  </div>
);

export default DepartmentsTab;