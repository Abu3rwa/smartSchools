import {
    HiOutlineCalendar,
    HiOutlineCheckCircle,
    HiOutlineDocumentText,
    HiOutlinePencilAlt,
    HiOutlineExclamation
} from 'react-icons/hi';
import { useTranslation } from 'react-i18next';

const Spark = ({ values }) => (
    <span className="assignments-kpi__spark" aria-hidden="true">
        {values.map((value, index) => (
            <i
                key={`${value}-${index}`}
                className={index >= 2 ? 'is-on' : ''}
                style={{ height: `${value}px` }}
            />
        ))}
    </span>
);

const AssignmentsOverview = ({
    metrics,
    classLabel,
    onReviewAttention
}) => {
    const { t } = useTranslation(['assignments']);

    const attentionItems = [];
    if (metrics.draftCount > 0) {
        attentionItems.push(t('assignments:overview.attention.drafts', {
            count: metrics.draftCount
        }));
    }
    if (metrics.awaitingGrading > 0) {
        attentionItems.push(t('assignments:overview.attention.ungraded', {
            count: metrics.awaitingGrading
        }));
    }
    if (metrics.overdue > 0) {
        attentionItems.push(t('assignments:overview.attention.overdue', {
            count: metrics.overdue
        }));
    }

    const cards = [
        {
            key: 'published',
            value: metrics.publishedCount,
            label: t('assignments:overview.published'),
            sub: classLabel
                ? t('assignments:overview.inClass', { name: classLabel })
                : t('assignments:overview.acrossClasses', { count: metrics.classCount }),
            icon: HiOutlineCheckCircle,
            tone: 'teal',
            spark: [8, 12, 10, 16, 13]
        },
        {
            key: 'drafts',
            value: metrics.draftCount,
            label: t('assignments:overview.drafts'),
            sub: t('assignments:overview.draftsSub'),
            icon: HiOutlineDocumentText,
            tone: 'blue',
            spark: [9, 12, 12, 14, 14]
        },
        {
            key: 'due',
            value: metrics.dueThisWeek,
            label: t('assignments:overview.dueThisWeek'),
            sub: metrics.dueToday > 0
                ? t('assignments:overview.dueToday', { count: metrics.dueToday })
                : t('assignments:overview.nextSevenDays'),
            icon: HiOutlineCalendar,
            tone: 'amber',
            spark: [7, 10, 13, 16, 16]
        },
        {
            key: 'grading',
            value: metrics.awaitingGrading,
            label: t('assignments:overview.awaitingGrading'),
            sub: metrics.assignmentsAwaitingGrading > 0
                ? t('assignments:overview.acrossAssignments', {
                    count: metrics.assignmentsAwaitingGrading
                })
                : t('assignments:overview.allGraded'),
            icon: HiOutlinePencilAlt,
            tone: 'rose',
            spark: [14, 11, 15, 16, 16]
        }
    ];

    return (
        <>
            <section className="assignments-kpi-grid" aria-label={t('assignments:overview.label')}>
                {cards.map((card) => {
                    const Icon = card.icon;
                    return (
                        <article className="assignments-kpi" key={card.key}>
                            <div className="assignments-kpi__top">
                                <span className={`assignments-kpi__icon assignments-kpi__icon--${card.tone}`}>
                                    <Icon />
                                </span>
                                <Spark values={card.spark} />
                            </div>
                            <div>
                                <div className="assignments-kpi__value">{card.value}</div>
                                <div className="assignments-kpi__label">{card.label}</div>
                            </div>
                            <div className="assignments-kpi__sub">{card.sub}</div>
                        </article>
                    );
                })}
            </section>

            {attentionItems.length > 0 && (
                <section className="assignments-attention" aria-label={t('assignments:overview.attention.label')}>
                    <span className="assignments-attention__icon" aria-hidden="true">
                        <HiOutlineExclamation />
                    </span>
                    <p>
                        <strong>{t('assignments:overview.attention.label')}</strong>
                        {' '}
                        {attentionItems.map((item, index) => (
                            <span key={item}>
                                {index > 0 && <span className="assignments-attention__sep">·</span>}
                                {item}
                            </span>
                        ))}
                    </p>
                    <button
                        type="button"
                        className="assignments-attention__action"
                        onClick={onReviewAttention}
                    >
                        {t('assignments:overview.attention.review')}
                    </button>
                </section>
            )}
        </>
    );
};

export default AssignmentsOverview;
