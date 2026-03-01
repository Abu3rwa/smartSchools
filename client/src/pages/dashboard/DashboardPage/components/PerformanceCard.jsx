import { HiOutlineChartBar } from 'react-icons/hi';

const PerformanceCard = () => {
    return (
        <div className="card performance-card">
            <div className="card-header dashboard-card-header">
                <h3 className="card-title">Performance Trends</h3>
            </div>
            <div className="chart-placeholder">
                <HiOutlineChartBar size={40} />
                <p>Performance analytics coming soon</p>
            </div>
        </div>
    );
};

export default PerformanceCard;
