import { HiOutlineDownload, HiOutlineFilter } from 'react-icons/hi';

const AnalyticsHeader = ({ showFilters, onToggleFilters, onExport }) => {
    return (
        <div className="page-header">
            <div className="header-content">
                <h1>Behavior Analytics</h1>
                <p>Monitor user activity, security events, and system usage patterns</p>
            </div>
            <div className="header-actions">
                <button className="btn btn-secondary" onClick={onToggleFilters}>
                    <HiOutlineFilter size={20} />
                    {showFilters ? 'Hide Filters' : 'Filters'}
                </button>
                <button className="btn btn-secondary" onClick={() => onExport('json')}>
                    <HiOutlineDownload size={20} />
                    Export JSON
                </button>
                <button className="btn btn-primary" onClick={() => onExport('csv')}>
                    <HiOutlineDownload size={20} />
                    Export CSV
                </button>
            </div>
        </div>
    );
};

export default AnalyticsHeader;
