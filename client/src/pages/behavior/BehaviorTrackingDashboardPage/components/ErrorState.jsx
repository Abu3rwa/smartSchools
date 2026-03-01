import { Alert } from '@mui/material';

const ErrorState = ({ error }) => {
    if (!error) return null;

    return (
        <Alert severity="error" sx={{ mb: 2 }}>
            {error}
        </Alert>
    );
};

export default ErrorState;
