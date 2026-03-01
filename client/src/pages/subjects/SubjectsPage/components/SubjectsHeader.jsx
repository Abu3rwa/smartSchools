import { HiOutlinePlus } from 'react-icons/hi';

const SubjectsHeader = ({ isAdmin, onCreate }) => {
    return (
        <div className="page-header">
            <div>
                <h1>Subjects</h1>
                <p className="text-muted">Manage curriculum subjects and grading criteria</p>
            </div>
            {isAdmin && (
                <button className="btn btn-primary" onClick={onCreate}>
                    <HiOutlinePlus size={20} />
                    Add Subject
                </button>
            )}
        </div>
    );
};

export default SubjectsHeader;
