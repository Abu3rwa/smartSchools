import { AUTH_CALLBACK_COPY } from '../constants';

const AuthCallbackLoadingState = () => {
    return (
        <div className="auth-callback-page">
            <div className="auth-callback-container">
                <div className="spinner-large"></div>
                <h2>{AUTH_CALLBACK_COPY.title}</h2>
                <p>{AUTH_CALLBACK_COPY.subtitle}</p>
            </div>
        </div>
    );
};

export default AuthCallbackLoadingState;
