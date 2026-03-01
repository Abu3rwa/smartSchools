import { HiOutlinePlus } from 'react-icons/hi';

const TeachersHeader = ({ canManageTeachers, onCreateTeacher }) => {
    return (
        <div className="page-header">
            <div>
                <h1>Teachers</h1>
                <p className="text-muted">Manage teaching staff and class assignments</p>
            </div>
            {canManageTeachers && (
                <button className="btn btn-primary" onClick={onCreateTeacher}>
                    <HiOutlinePlus size={20} />
                    Add Teacher
                </button>
            )}
        </div>
    );
};

export default TeachersHeader;
