import { HiOutlineExclamation } from 'react-icons/hi';

const ErrorState = ({ error, onRetry }) => {
    return (
        <div className="behavior-analytics-error">
            <HiOutlineExclamation size={48} />
            <h3>Error loading analytics</h3>
            <p>{error}</p>
            <button onClick={onRetry} className="btn btn-primary">
                Retry
            </button>
        </div>
    );
};

export default ErrorState;
