import { HiOutlineCheckCircle } from 'react-icons/hi';

const RegisterSuccessState = () => {
    return (
        <div className="register-card animate-fadeIn">
            <div className="register-success">
                <div className="register-success-icon">
                    <HiOutlineCheckCircle size={28} />
                </div>
                <h2>School Registered!</h2>
                <p>Redirecting to your school login...</p>
            </div>
        </div>
    );
};

export default RegisterSuccessState;
