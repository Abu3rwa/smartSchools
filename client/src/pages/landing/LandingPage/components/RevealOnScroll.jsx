import React from 'react';
import { useScrollReveal } from '../hooks/useScrollReveal.js';

/**
 * A wrapper component that fades in and translates up its children when they enter the viewport.
 */
export default function RevealOnScroll({ 
    children, 
    className = '', 
    delay = 0, 
    duration = 0.8,
    threshold = 0.15
}) {
    const [ref, isVisible] = useScrollReveal({ threshold });

    return (
        <div 
            ref={ref} 
            className={`landing-reveal-wrapper ${isVisible ? 'is-visible' : ''} ${className}`}
            style={{ 
                transitionDuration: `${duration}s`,
                transitionDelay: `${delay}s`
            }}
        >
            {children}
        </div>
    );
}
