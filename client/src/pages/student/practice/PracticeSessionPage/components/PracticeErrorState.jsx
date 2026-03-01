import React from 'react';

const PracticeErrorState = ({ error, onRetry, showRetry }) => {
    return (
        <div className="practice-inline-error">
            <p>{error}</p>
            {showRetry && (
                <button className="btn btn-secondary btn-sm" onClick={onRetry}>
                    Try Again
                </button>
            )}
        </div>
    );
};

export default PracticeErrorState;
