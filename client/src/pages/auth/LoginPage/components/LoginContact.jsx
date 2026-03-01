import React from 'react';

const LoginContact = ({ adminEmail }) => {
    if (!adminEmail) return null;
    return (
        <p className="login-contact">
            Need help? <a href={`mailto:${adminEmail}`}>Contact your school</a>
        </p>
    );
};

export default LoginContact;
