import { HiOutlinePlus, HiOutlineUpload } from 'react-icons/hi';

const TeachersHeader = ({ canManageTeachers, onCreateTeacher, onImportTeachers }) => {
    return (
        <div className="page-header">
            <div>
                <h1>Teachers</h1>
                <p className="text-muted">Manage teaching staff and class assignments</p>
            </div>
            {canManageTeachers && (
                <div className="header-actions">
                    <button className="btn btn-outline" onClick={onImportTeachers}>
                        <HiOutlineUpload size={20} />
                        Import CSV
                    </button>
                    <button className="btn btn-primary" onClick={onCreateTeacher}>
                        <HiOutlinePlus size={20} />
                        Add Teacher
                    </button>
                </div>
            )}
        </div>
    );
};

export default TeachersHeader;
