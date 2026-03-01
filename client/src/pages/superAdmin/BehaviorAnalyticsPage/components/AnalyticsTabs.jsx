import {
    HiOutlineChartBar,
    HiOutlineGlobeAlt,
    HiOutlineShieldCheck,
    HiOutlineUsers
} from 'react-icons/hi';

const TABS = [
    { id: 'overview', label: 'Overview', icon: HiOutlineChartBar },
    { id: 'users', label: 'Users', icon: HiOutlineUsers },
    { id: 'security', label: 'Security', icon: HiOutlineShieldCheck },
    { id: 'usage', label: 'Usage', icon: HiOutlineGlobeAlt }
];

const AnalyticsTabs = ({ activeTab, onTabChange }) => {
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
                        {tab.label}
                    </button>
                ))}
            </div>
        </div>
    );
};

export default AnalyticsTabs;
