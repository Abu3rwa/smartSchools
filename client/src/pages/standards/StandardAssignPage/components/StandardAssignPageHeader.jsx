import { HiOutlinePlus } from 'react-icons/hi';

const StandardAssignPageHeader = ({ onCreate }) => {
    return (
        <div className="page-header">
            <div>
                <h1>Assign Standards</h1>
                <p className="text-muted">
                    Assign standards to classes and track student mastery
                </p>
            </div>
            <button className="btn btn-primary" onClick={onCreate}>
                <HiOutlinePlus size={20} />
                New Assignment
            </button>
        </div>
    );
};

export default StandardAssignPageHeader;
