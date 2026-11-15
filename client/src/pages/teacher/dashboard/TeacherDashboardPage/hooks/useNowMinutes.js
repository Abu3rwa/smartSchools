import { useEffect, useState } from 'react';
import { getNowMinutes } from '../utils/teacherDashboardPresentation';

/** Keeps the "now" marker and the next-class countdown honest without any network call. */
const useNowMinutes = () => {
    const [nowMinutes, setNowMinutes] = useState(getNowMinutes);

    useEffect(() => {
        const id = setInterval(() => setNowMinutes(getNowMinutes()), 60000);
        return () => clearInterval(id);
    }, []);

    return nowMinutes;
};

export default useNowMinutes;