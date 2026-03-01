import { HiOutlineClipboardList, HiOutlineUpload } from 'react-icons/hi';
import { STANDARDS_PAGE_TABS } from '../constants';

const StandardsTabs = ({ activeTab, onTabChange }) => {
    return (
        <div className="tabs">
            <button
                className={`tab-btn ${activeTab === STANDARDS_PAGE_TABS.list ? 'active' : ''}`}
                onClick={() => onTabChange(STANDARDS_PAGE_TABS.list)}
            >
                <HiOutlineClipboardList style={{ marginRight: 6, verticalAlign: 'middle' }} />
                Standards List
            </button>
            <button
                className={`tab-btn ${activeTab === STANDARDS_PAGE_TABS.import ? 'active' : ''}`}
                onClick={() => onTabChange(STANDARDS_PAGE_TABS.import)}
            >
                <HiOutlineUpload style={{ marginRight: 6, verticalAlign: 'middle' }} />
                Import
            </button>
        </div>
    );
};

export default StandardsTabs;
