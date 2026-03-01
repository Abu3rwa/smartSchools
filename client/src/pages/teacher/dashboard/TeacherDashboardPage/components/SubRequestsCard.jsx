import { Box, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import { HiOutlineClipboardList } from 'react-icons/hi';
import SectionCard from './SectionCard';

const SubRequestsCard = ({ pendingCount, pendingSubsCount }) => {
    return (
        <SectionCard
            className="sub-requests-card"
            title="Sub Requests"
            icon={HiOutlineClipboardList}
            action={
                <Link to="/portal/substitutions" className="btn btn-ghost btn-sm">
                    View all
                </Link>
            }
        >
            {pendingCount.loading ? (
                <p className="empty-text">Loading...</p>
            ) : pendingSubsCount > 0 ? (
                <Box sx={{ py: 1 }}>
                    <Typography variant="body1" fontWeight={600} color="primary.main">
                        {pendingSubsCount} pending request{pendingSubsCount !== 1 ? 's' : ''}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        Please confirm or decline.
                    </Typography>
                    <Link
                        to="/portal/substitutions"
                        className="btn btn-ghost btn-sm"
                        style={{ marginTop: 8, display: 'inline-block' }}
                    >
                        View &amp; respond
                    </Link>
                </Box>
            ) : (
                <p className="empty-text">No pending sub requests.</p>
            )}
        </SectionCard>
    );
};

export default SubRequestsCard;
