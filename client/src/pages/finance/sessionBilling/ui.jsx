import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    balanceLabel,
    balanceTone,
    ICONS,
    money,
    niceDate,
    useCountUp
} from './utils';

export const Icon = ({ name, size = 18, ...rest }) => {
    const Component = ICONS[name] || ICONS.chevron;
    return <Component size={size} {...rest} />;
};

export const Badge = ({ tone = 'neutral', children, dot = false }) => (
    <span className={`sb-badge sb-badge-${tone}`}>
        {dot && <i className="sb-badge-dot" />}
        {children}
    </span>
);

export const BalancePill = ({ balance, currency }) => (
    <span className={`sb-balance sb-balance-${balanceTone(balance)}`}>
        {balanceLabel(balance, currency)}
    </span>
);

export const EmptyState = ({ icon = 'overview', title, body, action }) => {
    const Component = ICONS[icon] || ICONS.overview;
    return (
        <div className="sb-empty">
            <span className="sb-empty-icon"><Component size={22} /></span>
            <strong>{title}</strong>
            {body && <p>{body}</p>}
            {action}
        </div>
    );
};

export const Skeleton = ({ rows = 4 }) => (
    <div className="sb-skeleton" aria-label="Loading">
        {Array.from({ length: rows }).map((_, index) => (
            <span key={index} style={{ animationDelay: `${index * 70}ms` }} />
        ))}
    </div>
);

export const Spinner = () => <span className="sb-spinner" aria-label="Loading" />;

export const Toggle = ({ checked, onChange, label, hint }) => (
    <label className="sb-toggle-row">
        <span>
            <strong>{label}</strong>
            {hint && <small>{hint}</small>}
        </span>
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            className={`sb-toggle ${checked ? 'is-on' : ''}`}
            onClick={() => onChange(!checked)}
        >
            <span />
        </button>
    </label>
);

export const Modal = ({ open, title, eyebrow, onClose, children, footer, wide = false }) => {
    useEffect(() => {
        if (!open) return undefined;
        const handler = (event) => { if (event.key === 'Escape') onClose?.(); };
        document.addEventListener('keydown', handler);
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', handler);
            document.body.style.overflow = previous;
        };
    }, [open, onClose]);

    if (!open) return null;
    return createPortal(
        <div className="sb-modal-backdrop" onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose?.();
        }}>
            <div className={`sb-modal ${wide ? 'sb-modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
                <header className="sb-modal-head">
                    <div>
                        {eyebrow && <span className="sb-eyebrow">{eyebrow}</span>}
                        <h2>{title}</h2>
                    </div>
                    <button className="sb-icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
                </header>
                <div className="sb-modal-body">{children}</div>
                {footer && <footer className="sb-modal-foot">{footer}</footer>}
            </div>
        </div>,
        document.body
    );
};

export const Drawer = ({ open, title, subtitle, onClose, children, footer, width = '560px' }) => {
    useEffect(() => {
        if (!open) return undefined;
        const handler = (event) => { if (event.key === 'Escape') onClose?.(); };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [open, onClose]);

    if (!open) return null;
    return createPortal(
        <div className="sb-drawer-backdrop" onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose?.();
        }}>
            <aside className="sb-drawer" style={{ width }} role="dialog" aria-modal="true" aria-label={title}>
                <header className="sb-drawer-head">
                    <div>
                        <span className="sb-eyebrow">{subtitle || 'Student account'}</span>
                        <h2>{title}</h2>
                    </div>
                    <button className="sb-icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
                </header>
                <div className="sb-drawer-body">{children}</div>
                {footer && <footer className="sb-drawer-foot">{footer}</footer>}
            </aside>
        </div>,
        document.body
    );
};

const Cash = ({ value, currency, compact = false }) => {
    const animated = useCountUp(value);
    const text = compact && Math.abs(animated) >= 1000
        ? new Intl.NumberFormat(undefined, {
            style: 'currency',
            currency,
            notation: 'compact',
            maximumFractionDigits: 1
        }).format(animated)
        : money(animated, currency);
    return <>{text}</>;
};

export const KpiCard = ({ label, value, currency, hint, icon = 'money', tone = 'default', delay = 0, chip }) => (
    <article className={`sb-kpi sb-kpi-${tone}`} style={{ animationDelay: `${delay}ms` }}>
        <header>
            <span className="sb-kpi-icon"><Icon name={icon} size={19} /></span>
            {chip && <span className="sb-kpi-chip">{chip}</span>}
        </header>
        <p className="sb-kpi-label">{label}</p>
        <strong className="sb-kpi-value">
            {currency ? <Cash value={value} currency={currency} /> : value}
        </strong>
        {hint && <span className="sb-kpi-hint">{hint}</span>}
    </article>
);

export const TrendChart = ({ trend = [], currency }) => {
    const [hover, setHover] = useState(null);
    const width = 720;
    const height = 210;
    const padding = { top: 18, right: 12, bottom: 28, left: 12 };
    if (!trend.length) {
        return <EmptyState title="No activity yet" body="Charges and payments will appear here as lessons are billed." />;
    }
    const max = Math.max(1, ...trend.flatMap((row) => [row.charged, row.paid]));
    const plotW = width - padding.left - padding.right;
    const plotH = height - padding.top - padding.bottom;
    const x = (index) => padding.left + (trend.length === 1 ? plotW / 2 : (index / (trend.length - 1)) * plotW);
    const y = (value) => padding.top + plotH - (value / max) * plotH;
    const path = (key) => trend.map((row, index) => `${index === 0 ? 'M' : 'L'}${x(index).toFixed(1)},${y(row[key]).toFixed(1)}`).join(' ');
    const area = (key) => `${path(key)} L${x(trend.length - 1).toFixed(1)},${padding.top + plotH} L${x(0).toFixed(1)},${padding.top + plotH} Z`;
    const step = Math.max(1, Math.ceil(trend.length / 7));

    return (
        <div className="sb-chart">
            <div className="sb-chart-legend">
                <span><i className="sb-dot sb-dot-charged" /> Charged</span>
                <span><i className="sb-dot sb-dot-paid" /> Paid</span>
                {hover !== null && (
                    <span className="sb-chart-hover">
                        {niceDate(trend[hover].from)} — {niceDate(trend[hover].to)} · {money(trend[hover].charged, currency)} charged · {money(trend[hover].paid, currency)} paid
                    </span>
                )}
            </div>
            <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Charges and payments trend">
                <defs>
                    <linearGradient id="sbChargedFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--sb-teal)" stopOpacity="0.28" />
                        <stop offset="100%" stopColor="var(--sb-teal)" stopOpacity="0" />
                    </linearGradient>
                    <linearGradient id="sbPaidFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--sb-gold)" stopOpacity="0.22" />
                        <stop offset="100%" stopColor="var(--sb-gold)" stopOpacity="0" />
                    </linearGradient>
                </defs>
                {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
                    <line
                        key={fraction}
                        x1={padding.left}
                        x2={width - padding.right}
                        y1={padding.top + plotH * fraction}
                        y2={padding.top + plotH * fraction}
                        stroke="var(--sb-line)"
                        strokeDasharray="3 6"
                    />
                ))}
                <path d={area('charged')} fill="url(#sbChargedFill)" />
                <path d={area('paid')} fill="url(#sbPaidFill)" />
                <path d={path('charged')} fill="none" stroke="var(--sb-teal)" strokeWidth="2.5" strokeLinecap="round" />
                <path d={path('paid')} fill="none" stroke="var(--sb-gold)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="5 4" />
                {trend.map((row, index) => (
                    <g key={`${row.from}-${index}`}>
                        <circle cx={x(index)} cy={y(row.charged)} r={hover === index ? 5 : 3} fill="var(--sb-teal)" />
                        <circle cx={x(index)} cy={y(row.paid)} r={hover === index ? 5 : 3} fill="var(--sb-gold)" />
                        <rect
                            x={x(index) - plotW / Math.max(1, trend.length) / 2}
                            y={padding.top}
                            width={plotW / Math.max(1, trend.length)}
                            height={plotH}
                            fill="transparent"
                            onMouseEnter={() => setHover(index)}
                            onMouseLeave={() => setHover(null)}
                        />
                        {(index % step === 0 || index === trend.length - 1) && (
                            <text x={x(index)} y={height - 8} textAnchor="middle" fontSize="10" fill="var(--sb-muted)">
                                {row.label}
                            </text>
                        )}
                    </g>
                ))}
            </svg>
        </div>
    );
};


export const PersonAvatar = ({ name = '', size = 34 }) => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    const initials = (parts[0]?.[0] || '?') + (parts[1]?.[0] || '');
    return (
        <span className="sb-avatar" style={{ width: size, height: size, fontSize: size * 0.38 }}>
            {initials.toUpperCase()}
        </span>
    );
};
