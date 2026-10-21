import {
    HiOutlineClipboardList,
    HiOutlineUpload,
} from 'react-icons/hi';
import {
    HiOutlineLink,
    HiOutlineChartBar,
    HiOutlineRectangleStack,
    HiOutlineCog6Tooth,
} from 'react-icons/hi2';
import { useTranslation } from 'react-i18next';
import { STANDARDS_PAGE_TABS } from '../constants';

const TAB_DEFS = [
    { key: STANDARDS_PAGE_TABS.list, icon: HiOutlineClipboardList, labelKey: 'tabs.list', fallbackLabel: 'Standards List' },
    { key: STANDARDS_PAGE_TABS.import, icon: HiOutlineUpload, labelKey: 'tabs.import', fallbackLabel: 'Import', adminOnly: true },
    { key: STANDARDS_PAGE_TABS.assign, icon: HiOutlineLink, labelKey: 'tabs.assign', fallbackLabel: 'Assign' },
    { key: STANDARDS_PAGE_TABS.gradebook, icon: HiOutlineChartBar, labelKey: 'tabs.gradebook', fallbackLabel: 'Gradebook' },
    { key: STANDARDS_PAGE_TABS.pool, icon: HiOutlineRectangleStack, labelKey: 'tabs.pool', fallbackLabel: 'Pool' },
    { key: STANDARDS_PAGE_TABS.settings, icon: HiOutlineCog6Tooth, labelKey: 'tabs.settings', fallbackLabel: 'Settings', adminOnly: true },
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
                    {t(`standards:${tab.labelKey}`, tab.fallbackLabel)}
                </button>
            ))}
        </div>
    );
};

export default StandardsTabs;
