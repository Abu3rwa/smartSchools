import { HiOutlineArrowLeft } from 'react-icons/hi';

const RegisterPageHeader = ({ onBack }) => {
    return (
        <header className="register-header">
            <button className="register-back" onClick={onBack}>
                <HiOutlineArrowLeft size={16} />
                Back
            </button>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Register Your School
            </span>
        </header>
    );
};

export default RegisterPageHeader;
