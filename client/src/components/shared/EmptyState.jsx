import { HiOutlineInbox } from 'react-icons/hi';

/**
 * Reusable empty-state placeholder.
 *
 * Usage:
 *   <EmptyState message="No students found" />
 *   <EmptyState icon={HiOutlineAcademicCap} message="No classes yet" hint="Click 'Add Class' to create one." />
 */
const EmptyState = ({ icon: Icon = HiOutlineInbox, message = 'Nothing here yet', hint }) => {
    return (
        <div style={{
            textAlign: 'center',
            padding: 'var(--spacing-2xl) var(--spacing-md)',
            color: 'var(--text-muted)'
        }}>
            <Icon size={48} style={{ opacity: 0.4, marginBottom: 'var(--spacing-md)' }} />
            <p style={{ fontSize: '1rem', fontWeight: 500, marginBottom: hint ? 6 : 0 }}>{message}</p>
            {hint && <p style={{ fontSize: '0.85rem' }}>{hint}</p>}
        </div>
    );
};

export default EmptyState;
