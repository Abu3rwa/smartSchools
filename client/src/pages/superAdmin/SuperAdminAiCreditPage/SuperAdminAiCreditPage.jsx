import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
    HiOutlineCash,
    HiOutlineChartBar,
    HiOutlineCurrencyDollar,
    HiOutlineTrendingUp,
} from 'react-icons/hi';
import platformAiCreditService from '../../../services/platformAiCreditService.js';
import {
    applyMarkupCents,
    dollarsToCents,
    formatBalance,
    formatCents,
    formatTokens,
    formatUsd,
} from '../../../utils/aiCredit.js';
import '../../../components/superAdmin/SuperAdminBase.css';
import './SuperAdminAiCreditPage.css';

const MAX_MARKUP = 1000;

const StatCard = ({ icon: Icon, variant, value, label }) => (
    <div className="admin-stat-card">
        <div className={`admin-stat-icon ${variant}`}>
            <Icon size={24} />
        </div>
        <div className="admin-stat-info">
            <h3>{value}</h3>
            <p>{label}</p>
        </div>
    </div>
);

const SuperAdminAiCreditPage = () => {
    const { t, i18n } = useTranslation(['superAdminAiCredit', 'aiCredit']);
    const locale = i18n.resolvedLanguage === 'ar' ? 'ar' : 'en-US';
    const [page, setPage] = useState(1);
    const [reloadKey, setReloadKey] = useState(0);
    const [result, setResult] = useState({ key: '', data: null, failed: false });
    const [markupInput, setMarkupInput] = useState('');
    const [saving, setSaving] = useState(false);
    const [voice, setVoice] = useState(null);
    const [voiceDraft, setVoiceDraft] = useState(null);
    const [savingVoice, setSavingVoice] = useState(false);
    const [schools, setSchools] = useState(null);
    const [selectedId, setSelectedId] = useState('');
    const [fundAmount, setFundAmount] = useState('10');
    const [fundReserve, setFundReserve] = useState('30');
    const [fundNote, setFundNote] = useState('');
    const [grantAmounts, setGrantAmounts] = useState({});
    const [requestAmounts, setRequestAmounts] = useState({});
    const [busy, setBusy] = useState('');
    const requestKey = `${page}|${reloadKey}`;
    const loading = result.key !== requestKey;
    const data = loading ? null : result.data;

    useEffect(() => {
        let active = true;
        platformAiCreditService.getOverview({ page })
            .then((next) => {
                if (!active) return;
                setResult({ key: requestKey, data: next, failed: false });
                setMarkupInput((current) => (current === '' ? String(next.markupPercent) : current));
            })
            .catch(() => {
                if (!active) return;
                setResult({ key: requestKey, data: null, failed: true });
                toast.error(t('superAdminAiCredit:loadFailed'));
            });
        return () => { active = false; };
    }, [page, requestKey, t]);

    useEffect(() => {
        let active = true;
        platformAiCreditService.getSchools()
            .then((next) => { if (active) setSchools(next); })
            .catch(() => {
                if (!active) return;
                toast.error(t('superAdminAiCredit:schools.loadFailed'));
            });
        return () => { active = false; };
    }, [reloadKey, t]);

    useEffect(() => {
        let active = true;
        platformAiCreditService.getVoiceSettings()
            .then((next) => {
                if (!active) return;
                setVoice(next);
                setVoiceDraft(next);
            })
            .catch(() => {
                if (!active) return;
                toast.error(t('superAdminAiCredit:voice.loadFailed'));
            });
        return () => { active = false; };
    }, [reloadKey, t]);

    const selected = (schools?.schools || []).find((row) => row.id === selectedId) || null;

    const saveVoice = async () => {
        if (!voiceDraft || savingVoice) return;
        setSavingVoice(true);
        try {
            const next = await platformAiCreditService.updateVoiceSettings({
                model: voiceDraft.model,
                sttModel: voiceDraft.sttModel,
                ttsModel: voiceDraft.ttsModel,
                ttsVoice: voiceDraft.ttsVoice,
                messageCredits: Number(voiceDraft.messageCredits),
                maxContextTokens: Number(voiceDraft.maxContextTokens),
                maxReplyTokens: Number(voiceDraft.maxReplyTokens),
                maxTranscriptSeconds: Number(voiceDraft.maxTranscriptSeconds),
                maxSpeechSeconds: Number(voiceDraft.maxSpeechSeconds)
            });
            setVoice(next);
            setVoiceDraft(next);
            toast.success(t('superAdminAiCredit:voice.saved'));
        } catch (error) {
            toast.error(error?.response?.data?.message || t('superAdminAiCredit:voice.saveFailed'));
        } finally {
            setSavingVoice(false);
        }
    };

    const moneyInput = (value) => dollarsToCents(value);

    const fund = async (schoolId) => {
        const cents = moneyInput(fundAmount);
        const percentValue = Number(fundReserve);
        if (!Number.isFinite(cents) || cents < 1 || cents > 100000
            || !Number.isFinite(percentValue) || percentValue < 0 || percentValue > 100) {
            toast.error(t('superAdminAiCredit:schools.fundInvalid'));
            return;
        }
        setBusy(`fund:${schoolId}`);
        try {
            await platformAiCreditService.fundSchool(schoolId, {
                amountCents: cents,
                reservePercent: percentValue,
                note: fundNote.trim(),
            });
            toast.success(t('superAdminAiCredit:schools.funded'));
            setFundNote('');
            setReloadKey((key) => key + 1);
        } catch (error) {
            toast.error(error?.response?.data?.message || t('superAdminAiCredit:schools.fundFailed'));
        } finally {
            setBusy('');
        }
    };

    const grant = async (schoolId, teacherId) => {
        const cents = moneyInput(grantAmounts[teacherId] ?? '5');
        if (!Number.isFinite(cents) || cents < 1 || cents > 100000) {
            toast.error(t('superAdminAiCredit:schools.fundInvalid'));
            return;
        }
        setBusy(`grant:${teacherId}`);
        try {
            await platformAiCreditService.grantTeacher(schoolId, teacherId, { amountCents: cents });
            toast.success(t('superAdminAiCredit:schools.granted'));
            setGrantAmounts((current) => ({ ...current, [teacherId]: '' }));
            setReloadKey((key) => key + 1);
        } catch (error) {
            toast.error(error?.response?.data?.message || t('superAdminAiCredit:schools.grantFailed'));
        } finally {
            setBusy('');
        }
    };

    const decide = async (request, approve) => {
        const body = { approve };
        if (approve) {
            const cents = moneyInput(requestAmounts[request.id] ?? String(request.amountCents / 100));
            if (!Number.isFinite(cents) || cents < 1 || cents > 100000) {
                toast.error(t('superAdminAiCredit:schools.fundInvalid'));
                return;
            }
            body.amountCents = cents;
        }
        setBusy(`request:${request.id}`);
        try {
            await platformAiCreditService.decideRequest(request.id, body);
            toast.success(t(approve ? 'superAdminAiCredit:requests.approved' : 'superAdminAiCredit:requests.declined'));
            setReloadKey((key) => key + 1);
        } catch (error) {
            toast.error(error?.response?.data?.message || t('superAdminAiCredit:requests.failed'));
        } finally {
            setBusy('');
        }
    };

    const percent = Number(markupInput);
    const invalid = markupInput.trim() === '' || !Number.isFinite(percent) || percent < 0 || percent > MAX_MARKUP;
    const preview = applyMarkupCents(100, invalid ? 0 : percent);
    const money = (cents) => formatUsd(cents, locale);
    const formatDate = (value) => new Date(value).toLocaleString(locale, {
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    });

    const save = async () => {
        if (invalid) {
            toast.error(t('superAdminAiCredit:settings.invalid', { max: MAX_MARKUP }));
            return;
        }
        setSaving(true);
        try {
            const saved = await platformAiCreditService.updateMarkup(percent);
            setMarkupInput(String(saved.markupPercent));
            toast.success(t('superAdminAiCredit:settings.saved'));
            setPage(1);
            setReloadKey((key) => key + 1);
        } catch (error) {
            toast.error(error?.response?.data?.message || t('superAdminAiCredit:settings.saveFailed'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="admin-dashboard">
            <div className="admin-dashboard-header">
                <div>
                    <h1>{t('superAdminAiCredit:title')}</h1>
                    <p className="admin-dashboard-subtitle">{t('superAdminAiCredit:subtitle')}</p>
                </div>
            </div>

            {loading && (
                <div className="admin-empty"><div className="spinner" /></div>
            )}

            {!loading && !data && (
                <div className="admin-section admin-empty">
                    <p>{t('superAdminAiCredit:loadFailed')}</p>
                    <button
                        type="button"
                        className="admin-action-btn"
                        onClick={() => setReloadKey((key) => key + 1)}
                    >
                        {t('superAdminAiCredit:retry')}
                    </button>
                </div>
            )}

            {data && (
                <>
                    <div className="admin-stats">
                        <StatCard
                            icon={HiOutlineCash}
                            variant="users"
                            value={`${data.markupPercent}%`}
                            label={t('superAdminAiCredit:stats.markup')}
                        />
                        <StatCard
                            icon={HiOutlineCurrencyDollar}
                            variant="revenue"
                            value={money(data.thisMonth.chargedCents)}
                            label={t('superAdminAiCredit:stats.charged')}
                        />
                        <StatCard
                            icon={HiOutlineChartBar}
                            variant="schools"
                            value={money(data.thisMonth.providerCostCents)}
                            label={t('superAdminAiCredit:stats.provider')}
                        />
                        <StatCard
                            icon={HiOutlineTrendingUp}
                            variant="students"
                            value={money(data.thisMonth.profitCents)}
                            label={t('superAdminAiCredit:stats.profit')}
                        />
                    </div>

                    {schools?.requests?.length > 0 && (
                        <section className="admin-section">
                            <div className="admin-section-header">
                                <div>
                                    <h2>{t('superAdminAiCredit:requests.title')}</h2>
                                    <p className="admin-section-subtitle">{t('superAdminAiCredit:requests.subtitle')}</p>
                                </div>
                            </div>
                            <div className="admin-table-wrap">
                                <table className="admin-table ai-credit-table">
                                    <thead>
                                        <tr>
                                            <th>{t('superAdminAiCredit:requests.school')}</th>
                                            <th>{t('superAdminAiCredit:requests.requester')}</th>
                                            <th>{t('superAdminAiCredit:requests.amount')}</th>
                                            <th>{t('superAdminAiCredit:requests.decision')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {schools.requests.map((request) => (
                                            <tr key={request.id}>
                                                <td>{request.schoolName || '—'}</td>
                                                <td>
                                                    <span className="ai-credit-account">{request.requesterName || '—'}</span>
                                                    {request.note && <span className="ai-credit-email" dir="auto">{request.note}</span>}
                                                </td>
                                                <td>
                                                    <input
                                                        className="ai-credit-amount-input"
                                                        type="text"
                                                        inputMode="decimal"
                                                        aria-label={t('superAdminAiCredit:requests.amount')}
                                                        value={requestAmounts[request.id] ?? String(request.amountCents / 100)}
                                                        onChange={(event) => setRequestAmounts((current) => ({
                                                            ...current, [request.id]: event.target.value
                                                        }))}
                                                    />
                                                </td>
                                                <td>
                                                    <div className="ai-credit-actions">
                                                        <button
                                                            type="button"
                                                            className="admin-action-btn primary"
                                                            disabled={Boolean(busy)}
                                                            onClick={() => decide(request, true)}
                                                        >
                                                            {t('superAdminAiCredit:requests.approve')}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="admin-action-btn"
                                                            disabled={Boolean(busy)}
                                                            onClick={() => decide(request, false)}
                                                        >
                                                            {t('superAdminAiCredit:requests.decline')}
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    )}

                    <section className="admin-section">
                        <div className="admin-section-header">
                            <div>
                                <h2>{t('superAdminAiCredit:schools.title')}</h2>
                                <p className="admin-section-subtitle">{t('superAdminAiCredit:schools.subtitle')}</p>
                            </div>
                        </div>
                        <div className="admin-table-wrap">
                            <table className="admin-table ai-credit-table">
                                <thead>
                                    <tr>
                                        <th>{t('superAdminAiCredit:schools.columns.school')}</th>
                                        <th>{t('superAdminAiCredit:schools.columns.reserve')}</th>
                                        <th>{t('superAdminAiCredit:schools.columns.allocated')}</th>
                                        <th>{t('superAdminAiCredit:schools.columns.spent')}</th>
                                        <th>{t('superAdminAiCredit:schools.columns.staff')}</th>
                                        <th>{t('superAdminAiCredit:schools.columns.actions')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {!schools && (
                                        <tr>
                                            <td colSpan={6} className="admin-empty-text">{t('superAdminAiCredit:schools.loading')}</td>
                                        </tr>
                                    )}
                                    {(schools?.schools || []).map((school) => (
                                        <tr key={school.id}>
                                            <td>{school.name}</td>
                                            <td dir="ltr">{formatBalance(school.pool.balanceCents, locale)}</td>
                                            <td dir="ltr">{formatBalance(school.pool.allocatedCents, locale)}</td>
                                            <td dir="ltr">{money(school.spentThisMonthCents)}</td>
                                            <td>{school.staffCount}</td>
                                            <td>
                                                <button
                                                    type="button"
                                                    className="admin-action-btn"
                                                    onClick={() => setSelectedId(school.id === selectedId ? '' : school.id)}
                                                >
                                                    {t('superAdminAiCredit:schools.open')}
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {selected && (
                            <div className="ai-credit-school-panel">
                                <h3>{t('superAdminAiCredit:schools.fundTitle', { school: selected.name })}</h3>
                                <div className="ai-credit-settings">
                                    <label className="ai-credit-field">
                                        <span>{t('superAdminAiCredit:schools.amount')}</span>
                                        <div className="ai-credit-input-row">
                                            <input
                                                type="text"
                                                inputMode="decimal"
                                                value={fundAmount}
                                                onChange={(event) => setFundAmount(event.target.value)}
                                                aria-label={t('superAdminAiCredit:schools.amount')}
                                            />
                                            <span aria-hidden="true">$</span>
                                        </div>
                                    </label>
                                    <label className="ai-credit-field">
                                        <span>{t('superAdminAiCredit:schools.reservePercent')}</span>
                                        <div className="ai-credit-input-row">
                                            <input
                                                type="text"
                                                inputMode="decimal"
                                                value={fundReserve}
                                                onChange={(event) => setFundReserve(event.target.value)}
                                                aria-label={t('superAdminAiCredit:schools.reservePercent')}
                                            />
                                            <span aria-hidden="true">%</span>
                                        </div>
                                    </label>
                                    <label className="ai-credit-field">
                                        <span>{t('superAdminAiCredit:schools.note')}</span>
                                        <div className="ai-credit-input-row">
                                            <input
                                                type="text"
                                                maxLength={500}
                                                value={fundNote}
                                                placeholder={t('superAdminAiCredit:schools.notePlaceholder')}
                                                onChange={(event) => setFundNote(event.target.value)}
                                                aria-label={t('superAdminAiCredit:schools.note')}
                                            />
                                            <button
                                                type="button"
                                                className="admin-action-btn primary"
                                                disabled={busy === `fund:${selected.id}`}
                                                onClick={() => fund(selected.id)}
                                            >
                                                {t('superAdminAiCredit:schools.submitFund')}
                                            </button>
                                        </div>
                                    </label>
                                </div>
                                <p className="ai-credit-note">{t('superAdminAiCredit:schools.fundHelp')}</p>

                                <h3>{t('superAdminAiCredit:schools.staffTitle')}</h3>
                                <div className="admin-table-wrap">
                                    <table className="admin-table ai-credit-table">
                                        <thead>
                                            <tr>
                                                <th>{t('superAdminAiCredit:schools.staffColumns.name')}</th>
                                                <th>{t('superAdminAiCredit:schools.staffColumns.balance')}</th>
                                                <th>{t('superAdminAiCredit:schools.staffColumns.school')}</th>
                                                <th>{t('superAdminAiCredit:schools.staffColumns.spent')}</th>
                                                <th>{t('superAdminAiCredit:schools.grantAmount')}</th>
                                                <th>{t('superAdminAiCredit:schools.grant')}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {selected.staff.length === 0 && (
                                                <tr>
                                                    <td colSpan={6} className="admin-empty-text">{t('superAdminAiCredit:schools.staffEmpty')}</td>
                                                </tr>
                                            )}
                                            {selected.staff.map((person) => (
                                                <tr key={person.userId}>
                                                    <td>
                                                        <span className="ai-credit-account">{person.name}</span>
                                                        {person.email && <span className="ai-credit-email">{person.email}</span>}
                                                    </td>
                                                    <td dir="ltr">{formatBalance(person.balanceCents, locale)}</td>
                                                    <td dir="ltr">{formatBalance(person.schoolCents, locale)}</td>
                                                    <td dir="ltr">{money(person.thisMonth.costCents)}</td>
                                                    <td>
                                                        <input
                                                            className="ai-credit-amount-input"
                                                            type="text"
                                                            inputMode="decimal"
                                                            aria-label={t('superAdminAiCredit:schools.grantAmount')}
                                                            value={grantAmounts[person.userId] ?? '5'}
                                                            onChange={(event) => setGrantAmounts((current) => ({
                                                                ...current, [person.userId]: event.target.value
                                                            }))}
                                                        />
                                                    </td>
                                                    <td>
                                                        <button
                                                            type="button"
                                                            className="admin-action-btn"
                                                            disabled={busy === `grant:${person.userId}`}
                                                            onClick={() => grant(selected.id, person.userId)}
                                                        >
                                                            {t('superAdminAiCredit:schools.grant')}
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </section>

                    <section className="admin-section">
                        <div className="admin-section-header">
                            <div>
                                <h2>{t('superAdminAiCredit:settings.title')}</h2>
                                <p className="admin-section-subtitle">{t('superAdminAiCredit:settings.subtitle')}</p>
                            </div>
                            <span className="ai-credit-current">
                                {t('superAdminAiCredit:settings.current', { value: data.markupPercent })}
                            </span>
                        </div>
                        <div className="ai-credit-settings">
                            <label className="ai-credit-field">
                                <span>{t('superAdminAiCredit:settings.label')}</span>
                                <div className="ai-credit-input-row">
                                    <input
                                        type="number"
                                        inputMode="decimal"
                                        min={0}
                                        max={MAX_MARKUP}
                                        step={0.1}
                                        value={markupInput}
                                        onChange={(event) => setMarkupInput(event.target.value)}
                                        aria-label={t('superAdminAiCredit:settings.label')}
                                    />
                                    <span aria-hidden="true">%</span>
                                    <button
                                        type="button"
                                        className="admin-action-btn primary"
                                        disabled={saving || invalid}
                                        onClick={save}
                                    >
                                        {t('superAdminAiCredit:settings.save')}
                                    </button>
                                </div>
                            </label>
                            <p className="ai-credit-example">
                                {t('superAdminAiCredit:settings.example', {
                                    markup: invalid ? 0 : percent,
                                    base: money(100),
                                    total: money(preview),
                                })}
                            </p>
                            <p className="ai-credit-note">{t('superAdminAiCredit:settings.applyNote')}</p>
                            <p className="ai-credit-note">
                                {t('superAdminAiCredit:rates', {
                                    model: data.rates?.model,
                                    input: formatUsd(data.rates?.inputPerMillionCents, locale, 4),
                                    cached: formatUsd(data.rates?.cachedInputPerMillionCents, locale, 4),
                                    output: formatUsd(data.rates?.outputPerMillionCents, locale, 4),
                                })}
                            </p>
                        </div>
                    </section>

                    {voice && voiceDraft && (
                        <section className="admin-section">
                            <div className="admin-section-header">
                                <div>
                                    <h2>{t('superAdminAiCredit:voice.title')}</h2>
                                    <p className="admin-section-subtitle">{t('superAdminAiCredit:voice.subtitle')}</p>
                                </div>
                                <span className="ai-credit-current">
                                    {t('superAdminAiCredit:voice.price', { n: voiceDraft.messageCredits })}
                                </span>
                            </div>
                            <div className="ai-credit-settings">
                                <div className="voice-config-grid">
                                    {[
                                        ['model', 'model'],
                                        ['sttModel', 'stt'],
                                        ['ttsModel', 'tts'],
                                        ['ttsVoice', 'voiceName'],
                                    ].map(([field, labelKey]) => (
                                        <label className="ai-credit-field" key={field}>
                                            <span>{t(`superAdminAiCredit:voice.fields.${labelKey}`)}</span>
                                            <input
                                                type="text"
                                                value={voiceDraft[field] || ''}
                                                onChange={(event) => setVoiceDraft({ ...voiceDraft, [field]: event.target.value })}
                                            />
                                        </label>
                                    ))}
                                    {[
                                        ['messageCredits', 'credits'],
                                        ['maxContextTokens', 'context'],
                                        ['maxReplyTokens', 'reply'],
                                        ['maxTranscriptSeconds', 'listening'],
                                        ['maxSpeechSeconds', 'speaking'],
                                    ].map(([field, labelKey]) => (
                                        <label className="ai-credit-field" key={field}>
                                            <span>{t(`superAdminAiCredit:voice.fields.${labelKey}`)}</span>
                                            <input
                                                type="number"
                                                min="0"
                                                value={voiceDraft[field] ?? ''}
                                                onChange={(event) => setVoiceDraft({ ...voiceDraft, [field]: event.target.value })}
                                            />
                                        </label>
                                    ))}
                                </div>
                                <p className="ai-credit-example">
                                    {t('superAdminAiCredit:voice.economics', {
                                        cost: formatCents(voice.worstCaseCostCents, locale),
                                        profit: formatCents(voice.worstCase?.profitCents, locale),
                                        margin: voice.worstCase?.marginPercent ?? 0,
                                    })}
                                </p>
                                <p className="ai-credit-note">
                                    {t('superAdminAiCredit:voice.capNote', { suggested: voice.suggestedCredits })}
                                </p>
                                <button
                                    type="button"
                                    className="admin-action-btn primary"
                                    disabled={savingVoice}
                                    onClick={saveVoice}
                                >
                                    {t('superAdminAiCredit:voice.save')}
                                </button>
                            </div>
                        </section>
                    )}

                    <section className="admin-section">
                        <div className="admin-section-header">
                            <div>
                                <h2>{t('superAdminAiCredit:history.title')}</h2>
                                <p className="admin-section-subtitle">
                                    {t('superAdminAiCredit:history.subtitle', {
                                        requests: formatTokens(data.thisMonth.requests, locale),
                                        tokens: formatTokens(data.thisMonth.tokens, locale),
                                    })}
                                </p>
                            </div>
                        </div>
                        <div className="admin-table-wrap">
                            <table className="admin-table ai-credit-table">
                                <thead>
                                    <tr>
                                        <th>{t('superAdminAiCredit:history.date')}</th>
                                        <th>{t('superAdminAiCredit:history.school')}</th>
                                        <th>{t('superAdminAiCredit:history.account')}</th>
                                        <th>{t('superAdminAiCredit:history.feature')}</th>
                                        <th>{t('superAdminAiCredit:history.tokens')}</th>
                                        <th>{t('superAdminAiCredit:history.provider')}</th>
                                        <th>{t('superAdminAiCredit:history.markup')}</th>
                                        <th>{t('superAdminAiCredit:history.charged')}</th>
                                        <th>{t('superAdminAiCredit:history.profit')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.rows.length === 0 && (
                                        <tr>
                                            <td colSpan={9} className="admin-empty-text">
                                                {t('superAdminAiCredit:history.empty')}
                                            </td>
                                        </tr>
                                    )}
                                    {data.rows.map((row) => (
                                        <tr key={row.id}>
                                            <td className="ai-credit-date">{formatDate(row.createdAt)}</td>
                                            <td>{row.schoolName || '—'}</td>
                                            <td>
                                                <span className="ai-credit-account">{row.userName || '—'}</span>
                                                {row.userEmail && (
                                                    <span className="ai-credit-email">{row.userEmail}</span>
                                                )}
                                            </td>
                                            <td>
                                                {t(`aiCredit:history.features.${row.feature || 'general'}`, {
                                                    defaultValue: t('aiCredit:history.features.general')
                                                })}
                                            </td>
                                            <td>{formatTokens(row.totalTokens, locale)}</td>
                                            <td dir="ltr">{formatCents(row.costCents, locale)}</td>
                                            <td>{row.markupPercent == null ? '—' : `${row.markupPercent}%`}</td>
                                            <td dir="ltr">
                                                {formatCents(row.chargedCents, locale)}
                                                {!row.charged && (
                                                    <span className="ai-credit-email">
                                                        {t(row.unpriced
                                                            ? 'superAdminAiCredit:history.unpriced'
                                                            : 'superAdminAiCredit:history.notCharged')}
                                                    </span>
                                                )}
                                            </td>
                                            <td dir="ltr">
                                                {row.markupPercent == null ? '—' : formatCents(row.profitCents, locale)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {data.pages > 1 && (
                            <div className="ai-credit-pager">
                                <button
                                    type="button"
                                    className="admin-action-btn"
                                    disabled={page <= 1}
                                    onClick={() => setPage((current) => current - 1)}
                                >
                                    {t('superAdminAiCredit:history.previous')}
                                </button>
                                <span>{t('superAdminAiCredit:history.page', { page: data.page, pages: data.pages })}</span>
                                <button
                                    type="button"
                                    className="admin-action-btn"
                                    disabled={page >= data.pages}
                                    onClick={() => setPage((current) => current + 1)}
                                >
                                    {t('superAdminAiCredit:history.next')}
                                </button>
                            </div>
                        )}
                    </section>
                </>
            )}
        </div>
    );
};

export default SuperAdminAiCreditPage;
