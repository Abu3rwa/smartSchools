import React, { useEffect, useRef, useState } from 'react';
import {
    HiOutlineArrowDownTray,
    HiOutlineArrowPath,
    HiOutlineBanknotes,
    HiOutlineBellAlert,
    HiOutlineCalendarDays,
    HiOutlineChartBarSquare,
    HiOutlineCheckCircle,
    HiOutlineChevronRight,
    HiOutlineClock,
    HiOutlineCog6Tooth,
    HiOutlineCreditCard,
    HiOutlineEnvelope,
    HiOutlineExclamationTriangle,
    HiOutlineEye,
    HiOutlinePlus,
    HiOutlinePrinter,
    HiOutlineReceiptPercent,
    HiOutlineSparkles,
    HiOutlineUserGroup,
    HiOutlineXMark
} from 'react-icons/hi2';
import api from '../../../config/api';

export const money = (value, currency = 'USD') => {
    const amount = Number(value) || 0;
    try {
        return new Intl.NumberFormat(undefined, {
            style: 'currency',
            currency,
            maximumFractionDigits: 2
        }).format(amount);
    } catch {
        return `${amount.toFixed(2)} ${currency}`;
    }
};

export const wholeMoney = (value, currency = 'USD') => money(Math.round(Number(value) || 0), currency);

export const niceDate = (value, withTime = false) => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {})
    });
};

export const relativeTime = (value) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const diff = Date.now() - date.getTime();
    const minutes = Math.round(diff / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} hr ago`;
    const days = Math.round(hours / 24);
    if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
    return niceDate(date);
};

export const balanceTone = (balance) => {
    if (balance > 0) return 'credit';
    if (balance < 0) return 'owed';
    return 'settled';
};

export const balanceLabel = (balance, currency) => {
    if (balance > 0) return `${money(balance, currency)} credit`;
    if (balance < 0) return `${money(-balance, currency)} owed`;
    return 'Settled';
};

export const ICONS = {
    overview: HiOutlineChartBarSquare,
    students: HiOutlineUserGroup,
    lessons: HiOutlineClock,
    payments: HiOutlineCreditCard,
    reports: HiOutlineReceiptPercent,
    settings: HiOutlineCog6Tooth,
    money: HiOutlineBanknotes,
    mail: HiOutlineEnvelope,
    print: HiOutlinePrinter,
    down: HiOutlineArrowDownTray,
    refresh: HiOutlineArrowPath,
    plus: HiOutlinePlus,
    close: HiOutlineXMark,
    warn: HiOutlineExclamationTriangle,
    check: HiOutlineCheckCircle,
    alert: HiOutlineBellAlert,
    sparkles: HiOutlineSparkles,
    chevron: HiOutlineChevronRight,
    eye: HiOutlineEye,
    calendar: HiOutlineCalendarDays
};

export const useCountUp = (value, duration = 700) => {
    const [display, setDisplay] = useState(Number(value) || 0);
    const fromRef = useRef(0);
    useEffect(() => {
        const target = Number(value) || 0;
        const from = fromRef.current;
        if (from === target) { setDisplay(target); return undefined; }
        let frame;
        const start = performance.now();
        const step = (now) => {
            const progress = Math.min(1, (now - start) / duration);
            const eased = 1 - Math.pow(1 - progress, 3);
            setDisplay(from + (target - from) * eased);
            if (progress < 1) frame = requestAnimationFrame(step);
            else fromRef.current = target;
        };
        frame = requestAnimationFrame(step);
        return () => cancelAnimationFrame(frame);
    }, [value, duration]);
    return display;
};

export const downloadFile = async (url, params, fallbackName) => {
    const response = await api.get(url, { params, responseType: 'blob' });
    const blob = response.data instanceof Blob
        ? response.data
        : new Blob([response.data], { type: 'text/csv' });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const header = String(response.headers?.['content-disposition'] || '');
    const match = /filename\*?=(?:UTF-8''|")?([^";]+)"?/i.exec(header);
    link.href = objectUrl;
    link.download = match ? decodeURIComponent(match[1]) : fallbackName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
};

export const field = (label, children, hint) => (
    <label className="sb-field">
        <span>{label}</span>
        {children}
        {hint && <small>{hint}</small>}
    </label>
);
