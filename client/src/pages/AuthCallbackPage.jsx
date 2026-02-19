import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { googleLoginCallback } from '../store/slices/authSlice';
import './AuthCallbackPage.css';

function AuthCallbackPage() {
    const navigate = useNavigate();
    const dispatch = useDispatch();
    const [searchParams] = useSearchParams();

    useEffect(() => {
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        const token = hashParams.get('token') || searchParams.get('token');
        const isNew = hashParams.get('isNew') || searchParams.get('isNew');
        const error = searchParams.get('error');

        if (error) {
            // Redirect to login with error message
            navigate('/login?error=' + encodeURIComponent(error));
            return;
        }

        if (token) {
            // Handle the Google login callback
            dispatch(googleLoginCallback(token))
                .unwrap()
                .then((data) => {
                    const role = data?.user?.role;
                    navigate(role === 'super_admin' ? '/admin' : '/portal');
                })
                .catch((err) => {
                    navigate('/?error=' + encodeURIComponent(err));
                });
        } else {
            // No token, redirect to login
            navigate('/login');
        }
    }, [dispatch, navigate, searchParams]);

    return (
        <div className="auth-callback-page">
            <div className="auth-callback-container">
                <div className="spinner-large"></div>
                <h2>Signing you in...</h2>
                <p>Please wait while we complete your login.</p>
            </div>
        </div>
    );
}

export default AuthCallbackPage;
