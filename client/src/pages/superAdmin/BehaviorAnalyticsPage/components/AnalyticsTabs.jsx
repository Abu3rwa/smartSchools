import {
    HiOutlineChartBar,
    HiOutlineGlobeAlt,
    HiOutlineShieldCheck,
    HiOutlineUsers
} from 'react-icons/hi';
import { useTranslation } from 'react-i18next';

const TABS = [
    { id: 'overview', icon: HiOutlineChartBar },
    { id: 'users', icon: HiOutlineUsers },
    { id: 'security', icon: HiOutlineShieldCheck },
    { id: 'usage', icon: HiOutlineGlobeAlt }
];

const AnalyticsTabs = ({ activeTab, onTabChange }) => {
    const { t } = useTranslation(['behaviorAnalytics']);

    return (
        <div className="tabs-container">
            <div className="tabs">
                {TABS.map((tab) => (
                    <button
                        key={tab.id}
                        className={`tab ${activeTab === tab.id ? 'active' : ''}`}
                        onClick={() => onTabChange(tab.id)}
                    >
                        <tab.icon size={20} />
                        {t(`behaviorAnalytics:tabs.${tab.id}`)}
                    </button>
                ))}
            </div>
        </div>
    );
};

export default AnalyticsTabs;
