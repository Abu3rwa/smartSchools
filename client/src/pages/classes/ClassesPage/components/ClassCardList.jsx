import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    HiOutlineBookOpen,
    HiOutlineOfficeBuilding,
    HiOutlineTrash,
    HiOutlineUserGroup
} from 'react-icons/hi';

const capacityPercent = (used, capacity) => {
    const seats = Number(capacity);
    const enrolled = Number(used) || 0;
    if (!Number.isFinite(seats) || seats <= 0) return null;
    return Math.min(100, Math.round((enrolled / seats) * 100));
};

const ClassCardList = ({ classes, isAdmin, onToggleActive, onDelete }) => {
    const { t } = useTranslation(['classes', 'common']);

    return (
        <div className="classes-card-list">
            {classes.map((cls) => {
                const used = Number(cls.studentCount) || 0;
                const capacity = Number(cls.capacity) || 0;
                const percent = capacityPercent(used, capacity);

                return (
                    <article className="classes-card" key={cls._id}>
                        <div className="classes-card-head">
                            <span className="grade-badge">{cls.grade}</span>
                            <div className="classes-card-identity">
                                <Link to={`/portal/classes/${cls._id}`} className="class-link">
                                    {cls.name}
                                </Link>
                                <span className="classes-card-sub">
                                    <span className="class-section">{cls.section || t('classes:table.mainSection')}</span>
                                    {cls.room && (
                                        <span className="class-room">
                                            <HiOutlineOfficeBuilding size={13} aria-hidden="true" />
                                            {cls.room}
                                        </span>
                                    )}
                                    <span className="class-year">{cls.academicYear}</span>
                                    {cls.isActive === false && (
                                        <span className="badge badge-secondary">
                                            {t('classes:status.inactive')}
                                        </span>
                                    )}
                                </span>
                            </div>
                        </div>
                        <dl className="classes-card-meta">
                            <div>
                                <dt>{t('classes:table.columns.department')}</dt>
                                <dd>{cls.department?.name ?? '—'}</dd>
                            </div>
                            <div>
                                <dt>{t('classes:table.columns.students')}</dt>
                                <dd>
                                    <span className="classes-capacity-line">
                                        <HiOutlineUserGroup aria-hidden="true" />
                                        {capacity > 0 ? (
                                            <bdi dir="ltr">{used} / {capacity}</bdi>
                                        ) : (
                                            <bdi>{used}</bdi>
                                        )}
                                    </span>
                                    {percent !== null && (
                                        <span
                                            className="classes-capacity"
                                            role="img"
                                            aria-label={t('classes:table.capacityUsage', { used, capacity })}
                                        >
                                            <span className="classes-capacity-fill" style={{ width: `${percent}%` }} />
                                        </span>
                                    )}
                                </dd>
                            </div>
                            <div>
                                <dt>{t('classes:table.columns.subjects')}</dt>
                                <dd>
                                    <span className="classes-capacity-line">
                                        <HiOutlineBookOpen aria-hidden="true" />
                                        <bdi>{cls.subjects?.length || 0}</bdi>
                                    </span>
                                </dd>
                            </div>
                        </dl>
                        <div className="classes-card-actions">
                            <Link to={`/portal/classes/${cls._id}`} className="btn btn-sm btn-secondary">
                                {t('common:actions.view')}
                            </Link>
                            {isAdmin && (
                                <>
                                    <button
                                        type="button"
                                        className="btn btn-sm btn-secondary"
                                        onClick={() => onToggleActive(cls)}
                                    >
                                        {cls.isActive === false ? t('classes:actions.activate') : t('classes:actions.deactivate')}
                                    </button>
                                    <button
                                        type="button"
                                        className="btn-icon btn-icon-danger"
                                        onClick={() => onDelete(cls)}
                                        title={t('common:actions.delete')}
                                        aria-label={t('common:actions.delete')}
                                    >
                                        <HiOutlineTrash size={16} />
                                    </button>
                                </>
                            )}
                        </div>
                    </article>
                );
            })}
        </div>
    );
};

export default ClassCardList;
