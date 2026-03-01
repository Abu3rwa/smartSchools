import React from 'react';
import { HiOutlineMail, HiOutlineLockClosed, HiOutlineEye, HiOutlineEyeOff } from 'react-icons/hi';

const LoginForm = ({
    formData,
    handleChange,
    handleSubmit,
    showPassword,
    setShowPassword,
    loading,
    error
}) => {
    return (
        <form className="login-form" onSubmit={handleSubmit}>
            <div className="form-group">
                <label htmlFor="email">Email</label>
                <div className="input-with-icon">
                    <HiOutlineMail className="input-icon" />
                    <input
                        type="email"
                        id="email"
                        name="email"
                        value={formData.email}
                        onChange={handleChange}
                        placeholder="you@school.com"
                        required
                        autoComplete="email"
                    />
                </div>
            </div>
            <div className="form-group">
                <label htmlFor="password">Password</label>
                <div className="input-with-icon">
                    <HiOutlineLockClosed className="input-icon" />
                    <input
                        type={showPassword ? 'text' : 'password'}
                        id="password"
                        name="password"
                        value={formData.password}
                        onChange={handleChange}
                        placeholder="••••••••"
                        required
                        autoComplete="current-password"
                    />
                    <button
                        type="button"
                        className="password-toggle"
                        onClick={() => setShowPassword(!showPassword)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                        {showPassword ? <HiOutlineEyeOff size={18} /> : <HiOutlineEye size={18} />}
                    </button>
                </div>
            </div>
            {error && <div className="error-message">{error}</div>}
            <button type="submit" className="btn btn-primary btn-lg w-full" disabled={loading}>
                {loading ? (
                    <span className="btn-loading">
                        <span className="spinner" style={{ width: 20, height: 20 }} />
                        Signing in...
                    </span>
                ) : (
                    'Sign in with email'
                )}
            </button>
        </form>
    );
};

export default LoginForm;
