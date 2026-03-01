import React from 'react';

const LoadingState = ({ message = "Loading incidents..." }) => {
    return (
        <div className="loading">{message}</div>
    );
};

export default LoadingState;
