import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    HiOutlineArrowLeft,
    HiOutlineBookOpen,
    HiOutlineMail,
    HiOutlinePencilAlt,
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
    onOpenAddModal,
    grades
}) => {
    const { t } = useTranslation(['gradebook']);

    // Get distinct assessment groups from current grades for quick-edit links
    const assessmentGroups = (() => {
        if (!grades || grades.length === 0) return [];
        const groups = new Map();
        for (const grade of grades) {
            const gid = grade.assessmentGroupId;
            if (!gid || groups.has(gid)) continue;
            groups.set(gid, {
                assessmentGroupId: gid,
                title: grade.title || '',
                category: grade.category || grade.gradeType || '',
                date: grade.date
            });
        }
        return Array.from(groups.values()).slice(0, 10);
    })();

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

                    {assessmentGroups.length > 0 && (
                        <div className="dropdown" style={{ position: 'relative', display: 'inline-block' }}>
                            <button
                                className="btn btn-outline"
                                onClick={(e) => {
                                    const menu = e.currentTarget.nextElementSibling;
                                    menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
                                }}
                            >
                                <HiOutlinePencilAlt size={20} />
                                {t('gradebook:header.editGrades', { defaultValue: 'Edit Grades' })}
                            </button>
                            <div className="dropdown-menu" style={{ display: 'none', position: 'absolute', right: 0, top: '100%', background: 'var(--bg-primary, #fff)', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', minWidth: 220, zIndex: 50, padding: '4px 0' }}>
                                {assessmentGroups.map((group) => (
                                    <Link
                                        key={group.assessmentGroupId}
                                        to={`/portal/grades/entry?assessmentGroupId=${group.assessmentGroupId}&class=${classId}`}
                                        className="dropdown-item"
                                        style={{ display: 'block', padding: '8px 16px', textDecoration: 'none', color: 'var(--text-primary)', fontSize: 14 }}
                                    >
                                        <strong>{group.category}</strong>
                                        {group.title ? ` — ${group.title}` : ''}
                                        {group.date && (
                                            <span className="text-muted" style={{ marginLeft: 8, fontSize: 12 }}>
                                                {new Date(group.date).toLocaleDateString()}
                                            </span>
                                        )}
                                    </Link>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
};

export default GradebookHeader;
