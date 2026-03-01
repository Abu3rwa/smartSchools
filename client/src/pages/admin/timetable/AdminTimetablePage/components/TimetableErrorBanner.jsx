import { HiOutlineExclamation } from 'react-icons/hi';

const TimetableErrorBanner = ({ error }) => {
    if (!error) return null;

    return (
        <div className="error-banner">
            <HiOutlineExclamation size={20} />
            <span>{error}</span>
        </div>
    );
};

export default TimetableErrorBanner;
