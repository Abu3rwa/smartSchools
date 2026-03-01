import { Typography } from '@mui/material';

const LoadingState = ({ loading }) => {
    if (!loading) return null;

    return (
        <Typography variant="body2" color="text.secondary" mt={2}>
            Loading behavior dashboard...
        </Typography>
    );
};

export default LoadingState;
