import { createContext, useContext, useState, useEffect } from 'react';
import api from '../config/api';

const AuthContext = createContext(null);

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [teacherProfile, setTeacherProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Check for existing auth on mount
    useEffect(() => {
        const initAuth = async () => {
            const token = localStorage.getItem('token');
            const savedUser = localStorage.getItem('user');

            if (token && savedUser) {
                try {
                    setUser(JSON.parse(savedUser));
                    // Verify token is still valid
                    const response = await api.get('/auth/me');
                    if (response.data.success) {
                        setUser(response.data.data.user);
                        setTeacherProfile(response.data.data.profile);
                        localStorage.setItem('user', JSON.stringify(response.data.data.user));
                    }
                } catch (err) {
                    console.error('Auth verification failed:', err);
                    logout();
                }
            }
            setLoading(false);
        };

        initAuth();
    }, []);

    const login = async (email, password) => {
        try {
            setError(null);
            const response = await api.post('/auth/login', { email, password });

            if (response.data.success) {
                const { user, token, teacherProfile } = response.data.data;
                localStorage.setItem('token', token);
                localStorage.setItem('user', JSON.stringify(user));
                setUser(user);
                setTeacherProfile(teacherProfile);
                return { success: true };
            }
        } catch (err) {
            const message = err.response?.data?.message || 'Login failed';
            setError(message);
            return { success: false, message };
        }
    };

    const register = async (userData) => {
        try {
            setError(null);
            const response = await api.post('/auth/register', userData);

            if (response.data.success) {
                const { user, token } = response.data.data;
                localStorage.setItem('token', token);
                localStorage.setItem('user', JSON.stringify(user));
                setUser(user);
                return { success: true };
            }
        } catch (err) {
            const message = err.response?.data?.message || 'Registration failed';
            setError(message);
            return { success: false, message };
        }
    };

    const logout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setUser(null);
        setTeacherProfile(null);
    };

    const updateProfile = async (profileData) => {
        try {
            const response = await api.put('/auth/profile', profileData);
            if (response.data.success) {
                setUser(response.data.data.user);
                localStorage.setItem('user', JSON.stringify(response.data.data.user));
                return { success: true };
            }
        } catch (err) {
            return { success: false, message: err.response?.data?.message };
        }
    };

    const value = {
        user,
        teacherProfile,
        loading,
        error,
        isAuthenticated: !!user,
        isAdmin: user?.role === 'admin',
        isTeacher: user?.role === 'teacher',
        login,
        register,
        logout,
        updateProfile
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};
