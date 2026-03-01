import { Link } from 'react-router-dom';
import {
    HiOutlineArrowLeft,
    HiOutlineBookOpen,
    HiOutlineMail,
    HiOutlinePlus,
    HiOutlineSparkles
} from 'react-icons/hi';
import { CATEGORY_FILTER_OPTIONS } from '../constants';

const GradebookHeader = ({
    classId,
    className,
    academicYear,
    selectedCategoryFilter,
    onCategoryFilterChange,
    onSendReports,
    notificationSending,
    hasStudents,
    onOpenAddModal
}) => {
    return (
        <>
            <Link to={`/portal/classes/${classId}`} className="back-link">
                <HiOutlineArrowLeft />
                Back to Class
            </Link>

            <div className="gradebook-header">
                <div>
                    <h1>
                        <HiOutlineBookOpen />
                        Gradebook
                    </h1>
                    <p className="text-muted">{className} • {academicYear}</p>
                </div>

                <div className="header-actions">
                    <div className="category-filter-inline">
                        <select
                            value={selectedCategoryFilter}
                            onChange={(event) => onCategoryFilterChange(event.target.value)}
                        >
                            <option value="All">All Categories</option>
                            {CATEGORY_FILTER_OPTIONS.map((category) => (
                                <option key={category} value={category}>{category}</option>
                            ))}
                        </select>
                    </div>

                    <Link to="/portal/reports/generator" className="btn btn-outline">
                        <HiOutlineSparkles size={20} />
                        Advanced Reports
                    </Link>

                    <button
                        className="btn btn-success"
                        onClick={onSendReports}
                        disabled={notificationSending || !hasStudents}
                    >
                        <HiOutlineMail size={20} />
                        {notificationSending ? 'Sending...' : 'Send Reports'}
                    </button>

                    <button className="btn btn-primary" onClick={onOpenAddModal}>
                        <HiOutlinePlus size={20} />
                        Add Grades
                    </button>
                </div>
            </div>
        </>
    );
};

export default GradebookHeader;
