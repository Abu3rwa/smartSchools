import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../config/api';
import toast from 'react-hot-toast';
import '../finance/Finance.css';
import '../finance/SessionBillingPage.css';
import { EmptyState, Icon, PersonAvatar, Skeleton } from '../finance/sessionBilling/ui';
import { money } from '../finance/sessionBilling/utils';
import BillingModals from '../finance/sessionBilling/BillingModals';

const KIND_KEYS = {
    charge: 'kindLesson',
    payment: 'kindPayment',
    refund: 'kindRefund',
    adjustment: 'kindCorrection'
};

const dayMonth = (value, locale) => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString(locale === 'ar' ? 'ar-EG' : 'en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    });
};

const balanceText = (balance, currency, t) => {
    const value = Number(balance) || 0;
    if (value < 0) return { label: t('owe'), amount: money(-value, currency), tone: 'danger' };
    if (value > 0) return { label: t('creditOnFile'), amount: money(value, currency), tone: 'good' };
    return { label: t('allSettled'), amount: '', tone: 'neutral' };
};

const StudentAccountCard = ({ account, currency, locale, t, onPrint }) => {
    const [open, setOpen] = useState(false);
    const balance = balanceText(account.totals?.balance, currency, t);
    const entries = (account.entries || []).filter((entry) => entry.status !== 'void');
    const recent = entries.slice(-8).reverse();

    return (
        <section className="sb-card sb-family-card">
            <header className="sb-family-head">
                <PersonAvatar name={account.student?.name || ''} size={44} />
                <div className="sb-family-who">
                    <h2>{account.student?.name}</h2>
                    <p>
                        {account.package
                            ? t('packageLeft', {
                                name: account.package.name,
                                minutes: Math.floor(account.package.minutesRemaining)
                            })
                            : t('minutesLeft', { minutes: Math.floor(account.totals?.minutesRemaining || 0) })}
                    </p>
                </div>
                <div className="sb-family-balance">
                    <span>{balance.label}</span>
                    <strong className={balance.tone === 'danger' ? 'negative' : ''}>{balance.amount}</strong>
                </div>
            </header>

            <div className="sb-family-stats">
                <div>
                    <span>{t('lessonsTaught')}</span>
                    <strong>{account.totals?.sessions || 0}</strong>
                </div>
                <div>
                    <span>{t('minutesBilled')}</span>
                    <strong>{Math.round(account.totals?.minutes || 0)}</strong>
                </div>
                <div>
                    <span>{t('charged')}</span>
                    <strong>{money(account.totals?.charged, currency)}</strong>
                </div>
                <div>
                    <span>{t('paid')}</span>
                    <strong>{money(account.totals?.paid, currency)}</strong>
                </div>
            </div>

            {account.paymentInstructions && (
                <div className="sb-family-pay">
                    <h3>{t('howToPay')}</h3>
                    <p>{account.paymentInstructions}</p>
                </div>
            )}

            <div className="sb-family-actions">
                <button className="btn-secondary btn-sm" onClick={() => onPrint(account.student.id, account.student.name)}>
                    <Icon name="print" size={14} /> {t('printStatement')}
                </button>
                <button className="sb-link" onClick={() => setOpen((value) => !value)}>
                    {open ? t('hideHistory') : t('showHistory')}
                    <Icon name="chevron" size={13} className={open ? 'is-open' : ''} />
                </button>
                {account.lastStatementAt && (
                    <small className="sb-muted">{t('lastStatement', { date: dayMonth(account.lastStatementAt, locale) })}</small>
                )}
            </div>

            {open && (
                entries.length === 0 ? (
                    <EmptyState icon="lessons" title={t('noHistory')} body={t('noHistoryBody')} />
                ) : (
                    <div className="sb-table-wrap">
                        <table className="sb-table sb-family-table">
                            <thead>
                                <tr>
                                    <th>{t('date')}</th>
                                    <th>{t('description')}</th>
                                    <th className="num">{t('minutes')}</th>
                                    <th className="num">{t('amount')}</th>
                                    <th className="num">{t('running')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {recent.map((entry) => (
                                    <tr key={entry.id}>
                                        <td>{dayMonth(entry.occurredAt, locale)}</td>
                                        <td>
                                            {t(KIND_KEYS[entry.kind] || 'kindCorrection')}
                                            {entry.kind === 'charge' && entry.sessionTitle ? ` · ${entry.sessionTitle}` : ''}
                                        </td>
                                        <td className="num">{entry.minutes ? Math.round(entry.minutes) : '—'}</td>
                                        <td className={`num ${entry.kind === 'charge' || entry.kind === 'refund' ? 'negative' : 'positive'}`}>
                                            {entry.kind === 'charge' || entry.kind === 'refund' ? '−' : '+'} {money(entry.amount, currency)}
                                        </td>
                                        <td className="num">{money(entry.balanceAfter, currency)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )
            )}
        </section>
    );
};

const FamilyLessonAccountPage = () => {
    const { t, i18n } = useTranslation(['lessonBilling', 'common']);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [modal, setModal] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const response = await api.get('/finance/billing/family/statement');
            setData(response.data?.data || null);
        } catch (err) {
            const message = err.response?.data?.message;
            setError(message || t('loadError'));
        } finally {
            setLoading(false);
        }
    }, [t]);

    useEffect(() => { load(); }, [load]);

    const printStatement = (studentId, name) => {
        setModal({
            type: 'print',
            kind: 'statement',
            family: true,
            studentId,
            language: i18n.language === 'ar' ? 'ar' : 'en',
            title: name ? `${t('statementFor')} ${name}` : t('statementTitle')
        });
    };

    const currency = data?.currency || 'USD';

    return (
        <div className="sb-family-page">
            <header className="sb-family-intro">
                <div>
                    <span className="sb-eyebrow">{t('eyebrow')}</span>
                    <h1>{t('title')}</h1>
                    <p>{t('subtitle')}</p>
                </div>
                {data?.paymentInstructions && !data?.students?.length && (
                    <div className="sb-family-pay">{data.paymentInstructions}</div>
                )}
            </header>

            {loading ? (
                <Skeleton rows={5} />
            ) : error ? (
                <div className="finance-error">{error}</div>
            ) : (
                (data?.students || []).length === 0
                    ? <EmptyState icon="lessons" title={t('empty')} body={t('emptyBody')} />
                    : (data.students || []).map((account) => (
                        <StudentAccountCard
                            key={account.student.id}
                            account={account}
                            currency={currency}
                            locale={i18n.language}
                            t={t}
                            onPrint={printStatement}
                        />
                    ))
            )}

            <footer className="sb-family-foot">
                <p>{t('question')}</p>
                <button className="sb-link" onClick={() => { load(); toast('Refreshed'); }}>
                    <Icon name="refresh" size={13} /> {t('refresh')}
                </button>
            </footer>

            <BillingModals
                modal={modal}
                range={{}}
                onClose={() => setModal(null)}
                onDone={() => setModal(null)}
            />
        </div>
    );
};

export default FamilyLessonAccountPage;
