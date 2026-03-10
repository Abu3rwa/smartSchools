import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
    const { t } = useTranslation(['gradebook']);

    return (
        <>
            <Link to={`/portal/classes/${classId}`} className="back-link">
                <HiOutlineArrowLeft />
                {t('gradebook:header.backToClass')}
            </Link>

            <div className="gradebook-header">
                <div>
                    <h1>
                        <HiOutlineBookOpen />
                        {t('gradebook:header.title')}
                    </h1>
                    <p className="text-muted">{className} • {academicYear}</p>
                </div>

                <div className="header-actions">
                    <div className="category-filter-inline">
                        <select
                            value={selectedCategoryFilter}
                            onChange={(event) => onCategoryFilterChange(event.target.value)}
                        >
                            <option value="All">{t('gradebook:categories.all')}</option>
                            {CATEGORY_FILTER_OPTIONS.map((category) => (
                                <option key={category} value={category}>
                                    {t(`gradebook:categories.${category}`, { defaultValue: category })}
                                </option>
                            ))}
                        </select>
                    </div>

                    <Link to="/portal/reports/generator" className="btn btn-outline">
                        <HiOutlineSparkles size={20} />
                        {t('gradebook:header.advancedReports')}
                    </Link>

                    <button
                        className="btn btn-success"
                        onClick={onSendReports}
                        disabled={notificationSending || !hasStudents}
                    >
                        <HiOutlineMail size={20} />
                        {notificationSending ? t('gradebook:common.sending') : t('gradebook:header.sendReports')}
                    </button>

                    <button className="btn btn-primary" onClick={onOpenAddModal}>
                        <HiOutlinePlus size={20} />
                        {t('gradebook:header.addGrades')}
                    </button>
                </div>
            </div>
        </>
    );
};

export default GradebookHeader;
