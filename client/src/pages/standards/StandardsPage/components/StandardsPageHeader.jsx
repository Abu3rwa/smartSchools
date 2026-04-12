import {
    HiOutlinePlus,
    HiOutlineBookOpen,
    HiOutlineTableCells,
    HiOutlineDocumentText,
    HiOutlinePencilSquare,
    HiOutlineShieldCheck,
} from 'react-icons/hi2';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const StandardsPageHeader = ({ isAdmin, onAddStandard }) => {
    const { t } = useTranslation(['standards']);

    const quickLinks = [
        {
            to: '/portal/standards/pool',
            label: 'Pool Library',
            icon: HiOutlineBookOpen,
        },
        {
            to: '/portal/standards/progress',
            label: 'Progress Table',
            icon: HiOutlineTableCells,
        },
        {
            to: '/portal/standards/narrative',
            label: 'Narrative Reports',
            icon: HiOutlineDocumentText,
        },
        {
            to: '/portal/standards/live-edit',
            label: 'Live Edit',
            icon: HiOutlinePencilSquare,
        },
        {
            to: '/portal/standards/audit',
            label: 'Audit & Settings',
            icon: HiOutlineShieldCheck,
            adminOnly: true,
        },
    ];

    return (
        <div className="page-header">
            <div>
                <h1>{t('standards:header.title')}</h1>
                <p className="text-muted">{t('standards:header.subtitle')}</p>
            </div>
            <div className="header-actions standards-header-actions">
                <div className="standards-quick-links" aria-label="Standards quick links">
                    {quickLinks
                        .filter((link) => !link.adminOnly || isAdmin)
                        .map((link) => {
                            const Icon = link.icon;
                            return (
                                <Link key={link.to} to={link.to} className="btn btn-secondary standards-quick-link">
                                    <Icon size={16} />
                                    {link.label}
                                </Link>
                            );
                        })}
                </div>
                {isAdmin && (
                    <button className="btn btn-primary" onClick={onAddStandard}>
                        <HiOutlinePlus size={20} />
                        {t('standards:header.add')}
                    </button>
                )}
            </div>
        </div>
    );
};

export default StandardsPageHeader;
