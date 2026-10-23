import { useEffect, useState } from 'react';
import { HiOutlineClock } from 'react-icons/hi';
import { useTranslation } from 'react-i18next';

const pad = (value) => String(value).padStart(2, '0');

const formatDuration = (seconds) => {
    const total = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const remainder = total % 60;
    return hours > 0 ? `${hours}:${pad(minutes)}:${pad(remainder)}` : `${minutes}:${pad(remainder)}`;
};

const CountdownTimer = ({ secondsRemaining }) => {
    const { t } = useTranslation(['studentPractice']);
    const [remaining, setRemaining] = useState(secondsRemaining);

    useEffect(() => {
        const interval = setInterval(() => {
            setRemaining((value) => (value <= 1 ? 0 : value - 1));
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    return (
        <span
            className={`practice-countdown${remaining <= 60 ? ' practice-countdown--urgent' : ''}`}
            role="timer"
            aria-label={t('studentPractice:session.timeAria')}
        >
            <HiOutlineClock size={13} aria-hidden="true" />
            {remaining === 0
                ? t('studentPractice:session.timeUp')
                : t('studentPractice:session.timeLeft', { time: formatDuration(remaining) })}
        </span>
    );
};

const PracticeCountdown = ({ secondsRemaining }) => {
    if (!secondsRemaining || secondsRemaining <= 0) return null;

    // Each server response carries a fresh remaining time, so remount to re-anchor the tick
    return <CountdownTimer key={secondsRemaining} secondsRemaining={secondsRemaining} />;
};

export default PracticeCountdown;
