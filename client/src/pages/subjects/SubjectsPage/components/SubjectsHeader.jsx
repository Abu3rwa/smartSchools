import { HiOutlinePlus, HiOutlineUpload } from 'react-icons/hi';

const SubjectsHeader = ({ isAdmin, onCreate, onImport }) => {
    return (
        <div className="page-header">
            <div>
                <h1>Subjects</h1>
                <p className="text-muted">Manage curriculum subjects and grading criteria</p>
            </div>
            {isAdmin && (
                <div className="header-actions">
                    <button className="btn btn-outline" onClick={onImport}>
                        <HiOutlineUpload size={20} />
                        Import CSV
                    </button>
                    <button className="btn btn-primary" onClick={onCreate}>
                        <HiOutlinePlus size={20} />
                        Add Subject
                    </button>
                </div>
            )}
        </div>
    );
};

export default SubjectsHeader;
