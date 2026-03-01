import { HiOutlineArrowLeft } from 'react-icons/hi';
import { getTeacherSelectorLabel } from '../utils/teacherDetailsPresentation';

const TeacherDetailsHeader = ({ teachers, currentTeacherId, onBack, onTeacherChange }) => {
    return (
        <div className="details-header">
            <button className="btn btn-ghost" onClick={onBack}>
                <HiOutlineArrowLeft size={20} />
                Back to Teachers
            </button>

            <div className="teacher-selector">
                <label htmlFor="teacher-select">View Teacher:</label>
                <select
                    id="teacher-select"
                    value={currentTeacherId}
                    onChange={(event) => onTeacherChange(event.target.value)}
                    className="form-select"
                >
                    {teachers.map((teacher) => (
                        <option key={teacher._id} value={teacher._id}>
                            {getTeacherSelectorLabel(teacher)}
                        </option>
                    ))}
                </select>
            </div>
        </div>
    );
};

export default TeacherDetailsHeader;
