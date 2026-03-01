import {
    HiOutlineClipboardList,
    HiOutlinePencil,
    HiOutlineTrash
} from 'react-icons/hi';
import LoadingState from './LoadingState';

const StandardsList = ({
    loading,
    filteredStandards,
    isAdmin,
    onEdit,
    onDelete
}) => {
    if (loading) {
        return <LoadingState />;
    }

    if (filteredStandards.length === 0) {
        return (
            <div className="standards-empty">
                <HiOutlineClipboardList size={48} />
                <p>No standards found</p>
                {isAdmin && (
                    <p style={{ fontSize: '0.85rem' }}>
                        Click "Add Standard" or use Import to get started.
                    </p>
                )}
            </div>
        );
    }

    return (
        <div className="standards-table">
            <table>
                <thead>
                    <tr>
                        <th>Code</th>
                        <th>Name</th>
                        <th>Description</th>
                        <th>Subject</th>
                        <th>Grade</th>
                        <th>Category</th>
                        <th>Mastery</th>
                        {isAdmin && <th>Actions</th>}
                    </tr>
                </thead>
                <tbody>
                    {filteredStandards.map((standard) => (
                        <tr key={standard._id}>
                            <td className="standard-code">{standard.code}</td>
                            <td>{standard.name}</td>
                            <td className="standard-description" title={standard.description}>
                                {standard.description}
                            </td>
                            <td>{standard.subject?.name || '-'}</td>
                            <td>{standard.gradeLevel}</td>
                            <td>{standard.category || '-'}</td>
                            <td>
                                {standard.masteryThreshold}% / {standard.masteryMinQuestions}q
                            </td>
                            {isAdmin && (
                                <td>
                                    <div className="standard-actions">
                                        <button
                                            className="btn-icon"
                                            onClick={() => onEdit(standard)}
                                            title="Edit"
                                        >
                                            <HiOutlinePencil />
                                        </button>
                                        <button
                                            className="btn-icon text-danger"
                                            onClick={() => onDelete(standard._id)}
                                            title="Delete"
                                        >
                                            <HiOutlineTrash />
                                        </button>
                                    </div>
                                </td>
                            )}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default StandardsList;
