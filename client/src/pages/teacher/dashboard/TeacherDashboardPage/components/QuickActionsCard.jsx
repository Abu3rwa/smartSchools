import { Grid } from '@mui/material';
import { Link } from 'react-router-dom';
import { HiOutlineArrowRight } from 'react-icons/hi';
import SectionCard from './SectionCard';

const QuickActionsCard = ({ actions }) => {
    return (
        <SectionCard className="quick-actions-card" title="Quick Actions">
            <Grid container spacing={1.5}>
                {actions.map((action, index) => (
                    <Grid item xs={12} sm={6} md={4} key={index}>
                        <Link to={action.path} className="quick-action">
                            <action.icon size={24} />
                            <span>{action.label}</span>
                            <HiOutlineArrowRight className="action-arrow" size={18} />
                        </Link>
                    </Grid>
                ))}
            </Grid>
        </SectionCard>
    );
};

export default QuickActionsCard;
