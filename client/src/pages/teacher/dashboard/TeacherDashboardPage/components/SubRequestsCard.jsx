import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    HiOutlineArrowRight,
    HiOutlineCheckCircle,
    HiOutlineClipboardList,
    HiOutlineExclamation
} from 'react-icons/hi';
import SectionCard from './SectionCard';
import CardLink from './CardLink';

const SubRequestsCard = ({ pendingCount, pendingSubsCount }) => {
    const { t } = useTranslation(['dashboard']);
    const hasPending = pendingSubsCount > 0;

    let body;
    if (pendingCount.loading) {
        body = (
            <div className="td-state">
                <div className="td-sk" style={{ width: 36, height: 36, borderRadius: 12, flex: '0 0 auto' }} />
                <div className="td-skrow-body">
                    <div className="td-sk" style={{ height: 13, width: '60%' }} />
                    <div className="td-sk" style={{ height: 10, width: '80%', marginTop: 7 }} />
                </div>
            </div>
        );
    } else if (hasPending) {
        body = (
            <div className="td-state pending">
                <i><HiOutlineExclamation size={19} /></i>
                <div>
                    <b>{t('dashboard:teacherDashboard.subRequests.pendingRequestsCount', { count: pendingSubsCount })}</b>
                    <p>{t('dashboard:teacherDashboard.subRequests.confirmOrDecline')}</p>
                    <Link to="/portal/substitutions" className="td-btn amber">
                        <span className="td-flip"><HiOutlineArrowRight size={14} /></span>
                        {t('dashboard:teacherDashboard.subRequests.viewAndRespond')}
                    </Link>
                </div>
            </div>
        );
    } else {
        body = (
            <div className="td-state clear">
                <i><HiOutlineCheckCircle size={19} /></i>
                <div>
                    <b>{t('dashboard:teacherDashboard.subRequests.allClear')}</b>
                    <p>{t('dashboard:teacherDashboard.subRequests.empty')}</p>
                </div>
            </div>
        );
    }

    return (
        <SectionCard
            title={t('dashboard:teacherDashboard.subRequests.title')}
            icon={HiOutlineClipboardList}
            tone={hasPending ? 'amber' : 'emerald'}
            action={(
                <CardLink to="/portal/substitutions">
                    {t('dashboard:teacherDashboard.subRequests.viewAll')}
                </CardLink>
            )}
        >
            <div className="td-subsbody">{body}</div>
        </SectionCard>
    );
};

export default SubRequestsCard;