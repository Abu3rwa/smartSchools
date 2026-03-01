import AuthCallbackLoadingState from './components/AuthCallbackLoadingState';
import useAuthCallbackPageData from './hooks/useAuthCallbackPageData';
import './AuthCallbackPage.css';

const AuthCallbackPage = () => {
    useAuthCallbackPageData();

    return <AuthCallbackLoadingState />;
};

export default AuthCallbackPage;
