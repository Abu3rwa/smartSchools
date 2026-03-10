import { HiOutlineClipboardList, HiOutlineUpload } from 'react-icons/hi';
import { useTranslation } from 'react-i18next';
import { STANDARDS_PAGE_TABS } from '../constants';

const StandardsTabs = ({ activeTab, onTabChange }) => {
    const { t } = useTranslation(['standards']);

    return (
        <div className="tabs">
            <button
                className={`tab-btn ${activeTab === STANDARDS_PAGE_TABS.list ? 'active' : ''}`}
                onClick={() => onTabChange(STANDARDS_PAGE_TABS.list)}
            >
                <HiOutlineClipboardList style={{ marginRight: 6, verticalAlign: 'middle' }} />
                {t('standards:tabs.list')}
            </button>
            <button
                className={`tab-btn ${activeTab === STANDARDS_PAGE_TABS.import ? 'active' : ''}`}
                onClick={() => onTabChange(STANDARDS_PAGE_TABS.import)}
            >
                <HiOutlineUpload style={{ marginRight: 6, verticalAlign: 'middle' }} />
                {t('standards:tabs.import')}
            </button>
        </div>
    );
};

export default StandardsTabs;
