import { useState, useEffect, useRef } from 'react';

/**
 * Reusable hook to detect when an element enters the viewport.
 * 
 * @param {Object} options IntersectionObserver options
 * @returns {[React.MutableRefObject, boolean]} A ref to attach to the element, and a boolean indicating visibility
 */
export const useScrollReveal = (options = {}) => {
    const [isVisible, setIsVisible] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        const currentRef = ref.current;
        if (!currentRef) return;

        // Memoize options safely for the observer
        const observerOptions = {
            threshold: 0.15, // Trigger when 15% of the element is visible
            rootMargin: '0px 0px -50px 0px', // Trigger slightly before it hits the true bottom
            ...options
        };

        const observer = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) {
                setIsVisible(true);
                observer.unobserve(currentRef); // Unobserve to animate only once
            }
        }, observerOptions);

        observer.observe(currentRef);

        return () => {
            if (currentRef) {
                observer.unobserve(currentRef);
            }
        };
    }, [options.threshold, options.rootMargin]);

    return [ref, isVisible];
};
