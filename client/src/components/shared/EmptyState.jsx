import { HiOutlineInbox } from 'react-icons/hi';

/**
 * Reusable empty-state placeholder. Uses theme-aware shared-empty-state from index.css.
 *
 * Usage:
 *   <EmptyState message="No students found" />
 *   <EmptyState icon={HiOutlineAcademicCap} message="No classes yet" hint="Click 'Add Class' to create one." />
 */
const EmptyState = ({ icon: Icon = HiOutlineInbox, message = 'Nothing here yet', hint, className = '' }) => {
    return (
        <div className={`shared-empty-state ${className}`.trim()}>
            <Icon size={48} className="shared-empty-icon" />
            <p>{message}</p>
            {hint && <p style={{ fontSize: '0.85rem' }}>{hint}</p>}
        </div>
    );
};

export default EmptyState;
