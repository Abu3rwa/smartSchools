import { Box } from '@mui/material';

const SummaryStat = ({ icon: Icon, label, value }) => {
    return (
        <Box className="summary-stat">
            {Icon && <Icon className="summary-stat-icon" size={18} />}
            <div className="summary-stat-content">
                <span className="summary-stat-value">{value}</span>
                <span className="summary-stat-label">{label}</span>
            </div>
        </Box>
    );
};

export default SummaryStat;
