import {
    HiOutlineClipboardList,
    HiOutlineUpload,
} from 'react-icons/hi';
import {
    HiOutlineLink,
    HiOutlineChartBar,
    HiOutlineRectangleStack,
    HiOutlineTableCells,
    HiOutlineDocumentText,
    HiOutlinePencilSquare,
    HiOutlineShieldCheck,
} from 'react-icons/hi2';
import { useTranslation } from 'react-i18next';
import { STANDARDS_PAGE_TABS } from '../constants';

const TAB_DEFS = [
    { key: STANDARDS_PAGE_TABS.list, icon: HiOutlineClipboardList, labelKey: 'tabs.list' },
    { key: STANDARDS_PAGE_TABS.import, icon: HiOutlineUpload, labelKey: 'tabs.import', adminOnly: true },
    { key: STANDARDS_PAGE_TABS.assign, icon: HiOutlineLink, labelKey: 'tabs.assign' },
    { key: STANDARDS_PAGE_TABS.gradebook, icon: HiOutlineChartBar, labelKey: 'tabs.gradebook' },
    { key: STANDARDS_PAGE_TABS.pool, icon: HiOutlineRectangleStack, labelKey: 'tabs.pool' },
    { key: STANDARDS_PAGE_TABS.progress, icon: HiOutlineTableCells, labelKey: 'tabs.progress' },
    { key: STANDARDS_PAGE_TABS.narrative, icon: HiOutlineDocumentText, labelKey: 'tabs.narrative' },
    { key: STANDARDS_PAGE_TABS.liveEdit, icon: HiOutlinePencilSquare, labelKey: 'tabs.liveEdit' },
    { key: STANDARDS_PAGE_TABS.audit, icon: HiOutlineShieldCheck, labelKey: 'tabs.audit', adminOnly: true },
];

const StandardsTabs = ({ activeTab, onTabChange, isAdmin }) => {
    const { t } = useTranslation(['standards']);

    return (
        <div className="tabs">
            {TAB_DEFS.filter((tab) => !tab.adminOnly || isAdmin).map((tab) => (
                <button
                    key={tab.key}
                    className={`tab-btn ${activeTab === tab.key ? 'active' : ''}`}
                    onClick={() => onTabChange(tab.key)}
                >
                    <tab.icon style={{ marginRight: 6, verticalAlign: 'middle' }} />
                    {t(`standards:${tab.labelKey}`, tab.labelKey.split('.').pop())}
                </button>
            ))}
        </div>
    );
};

export default StandardsTabs;
