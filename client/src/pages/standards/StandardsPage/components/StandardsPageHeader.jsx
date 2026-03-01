import { HiOutlinePlus } from 'react-icons/hi';

const StandardsPageHeader = ({ isAdmin, onAddStandard }) => {
    return (
        <div className="page-header">
            <div>
                <h1>Standards</h1>
                <p className="text-muted">Manage educational standards for student practice</p>
            </div>
            {isAdmin && (
                <div className="header-actions">
                    <button className="btn btn-primary" onClick={onAddStandard}>
                        <HiOutlinePlus size={20} />
                        Add Standard
                    </button>
                </div>
            )}
        </div>
    );
};

export default StandardsPageHeader;
