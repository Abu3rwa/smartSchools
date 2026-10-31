import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import TablePagination from '../../../components/common/TablePagination';
import useDebouncedValue from '../../../hooks/useDebouncedValue';
import {
    getDemoRequests,
    getDemoRequestSummary,
    updateDemoRequest,
} from '../../../services/landingContentService';
import {
    HiOutlineCalendar,
    HiOutlineCheckCircle,
    HiOutlineChat,
    HiOutlineClock,
    HiOutlineInboxIn,
    HiOutlinePhone,
    HiOutlineSearch,
    HiOutlineSparkles,
    HiOutlineX,
    HiOutlineXCircle,
} from 'react-icons/hi';
import '../../../components/superAdmin/SuperAdminBase.css';
import './SuperAdminDemoRequestsPage.css';

const STATUSES = ['new', 'contacted', 'scheduled', 'closed'];
const DEFAULT_PAGE_SIZE = 20;

const EMPTY_SUMMARY = {
    counts: { new: 0, contacted: 0, scheduled: 0, closed: 0 },
    total: 0,
};

const STATUS_ICONS = {
    new: HiOutlineSparkles,
    contacted: HiOutlineClock,
    scheduled: HiOutlineCalendar,
    closed: HiOutlineCheckCircle,
};

const SuperAdminDemoRequestsPage = () => {
    const { t, i18n } = useTranslation(['superAdminDemoRequests']);
    const locale = i18n.resolvedLanguage === 'ar' ? 'ar' : 'en-US';

    const [items, setItems] = useState([]);
    const [total, setTotal] = useState(0);
    const [summary, setSummary] = useState(EMPTY_SUMMARY);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [search, setSearch] = useState('');
    const debouncedSearch = useDebouncedValue(search, 400);
    const [status, setStatus] = useState('all');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
    const [selected, setSelected] = useState(null);
    const [detailStatus, setDetailStatus] = useState('new');
    const [detailNotes, setDetailNotes] = useState('');
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setLoadError('');
        try {
            const [list, counts] = await Promise.all([
                getDemoRequests({
                    status: status === 'all' ? undefined : status,
                    search: debouncedSearch || undefined,
                    page,
                    limit: pageSize,
                }),
                getDemoRequestSummary(),
            ]);
            setItems(Array.isArray(list.items) ? list.items : []);
            setTotal(Number(list.total) || 0);
            setSummary(counts?.counts ? counts : EMPTY_SUMMARY);
        } catch (error) {
            setLoadError(
                error.response?.data?.message || t('superAdminDemoRequests:errors.load'),
            );
            setItems([]);
            setTotal(0);
        } finally {
            setLoading(false);
        }
    }, [status, debouncedSearch, page, pageSize, t]);

    useEffect(() => {
        if (page !== 1) {
            setPage(1);
            return;
        }
        load();
    }, [load, page]);

    const formatDate = (value) => {
        if (!value) return t('superAdminDemoRequests:details.na');
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return t('superAdminDemoRequests:details.na');
        return date.toLocaleDateString(locale, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        });
    };

    const statusLabel = (value) =>
        t(`superAdminDemoRequests:status.${value}`, { defaultValue: value });

    const statusCards = useMemo(
        () => [
            { key: 'all', label: t('superAdminDemoRequests:stats.all'), count: summary.total },
            ...STATUSES.map((key) => ({
                key,
                label: t(`superAdminDemoRequests:stats.${key}`),
                count: summary.counts?.[key] || 0,
            })),
        ],
        [summary, t],
    );

    const openDetails = (item) => {
        setSelected(item);
        setDetailStatus(item.status || 'new');
        setDetailNotes(item.notes || '');
    };

    const closeDetails = () => {
        if (saving) return;
        setSelected(null);
    };

    useEffect(() => {
        if (!selected) return undefined;
        const handleKeyDown = (event) => {
            if (event.key === 'Escape' && !saving) setSelected(null);
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selected, saving]);

    const saveDetails = async () => {
        if (!selected) return;
        setSaving(true);
        try {
            const updated = await updateDemoRequest(selected._id, {
                status: detailStatus,
                notes: detailNotes,
            });
            setItems((current) =>
                current.map((item) => (item._id === updated._id ? { ...item, ...updated } : item)),
            );
            setSelected((current) => (current ? { ...current, ...updated } : current));
            toast.success(t('superAdminDemoRequests:details.saved'));
            getDemoRequestSummary()
                .then((counts) => setSummary(counts?.counts ? counts : EMPTY_SUMMARY))
                .catch(() => {});
            if (status !== 'all' && detailStatus !== status) {
                await load();
                setSelected(null);
            }
        } catch (error) {
            toast.error(
                error.response?.data?.message || t('superAdminDemoRequests:details.failed'),
            );
        } finally {
            setSaving(false);
        }
    };

    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const hasFilter = status !== 'all' || Boolean(debouncedSearch);
    const showEmpty = !loading && !loadError && items.length === 0;

    return (
        <div className="admin-dashboard sa-demo-page">
            <header className="sa-demo-header">
                <div>
                    <h1>{t('superAdminDemoRequests:page.title')}</h1>
                    <p className="admin-dashboard-subtitle">
                        {t('superAdminDemoRequests:page.subtitle')}
                    </p>
                </div>
            </header>

            <section className="sa-demo-stats" aria-label={t('superAdminDemoRequests:page.title')}>
                {statusCards.map((card) => {
                    const Icon = STATUS_ICONS[card.key] || HiOutlineInboxIn;
                    const active = status === card.key;
                    return (
                        <button
                            key={card.key}
                            type="button"
                            className={`sa-demo-stat${active ? ' is-active' : ''}`}
                            aria-pressed={active}
                            onClick={() => setStatus(card.key)}
                        >
                            <span className={`sa-demo-stat-icon sa-demo-stat-icon--${card.key}`}>
                                <Icon size={20} />
                            </span>
                            <span className="sa-demo-stat-info">
                                <strong>{card.count}</strong>
                                <span>{card.label}</span>
                            </span>
                        </button>
                    );
                })}
            </section>

            <div className="admin-toolbar sa-demo-toolbar">
                <div className="admin-toolbar-search">
                    <HiOutlineSearch size={18} className="search-icon" />
                    <input
                        className="admin-toolbar-input"
                        type="search"
                        placeholder={t('superAdminDemoRequests:search.placeholder')}
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                    />
                </div>
                <label className="sa-demo-status-filter">
                    <span>{t('superAdminDemoRequests:filters.statusLabel')}</span>
                    <select value={status} onChange={(event) => setStatus(event.target.value)}>
                        <option value="all">{t('superAdminDemoRequests:filters.all')}</option>
                        {STATUSES.map((key) => (
                            <option key={key} value={key}>
                                {statusLabel(key)}
                            </option>
                        ))}
                    </select>
                </label>
            </div>

            <section className="admin-section sa-demo-section">
                {loading ? (
                    <div className="admin-empty">
                        <div className="spinner" />
                        <p>{t('superAdminDemoRequests:loading')}</p>
                    </div>
                ) : loadError ? (
                    <div className="admin-empty sa-demo-error" role="alert">
                        <HiOutlineXCircle size={32} />
                        <p>{loadError}</p>
                        <button type="button" className="admin-action-btn" onClick={load}>
                            {t('superAdminDemoRequests:errors.retry')}
                        </button>
                    </div>
                ) : showEmpty ? (
                    <div className="admin-empty">
                        <HiOutlineInboxIn size={36} style={{ opacity: 0.5, marginBottom: 8 }} />
                        <h2>{t('superAdminDemoRequests:empty.title')}</h2>
                        <p>
                            {hasFilter
                                ? t('superAdminDemoRequests:empty.filtered')
                                : t('superAdminDemoRequests:empty.description')}
                        </p>
                    </div>
                ) : (
                    <div className="admin-table-wrap">
                        <table className="admin-table sa-demo-table">
                            <thead>
                                <tr>
                                    <th>{t('superAdminDemoRequests:table.school')}</th>
                                    <th>{t('superAdminDemoRequests:table.contact')}</th>
                                    <th>{t('superAdminDemoRequests:table.role')}</th>
                                    <th>{t('superAdminDemoRequests:table.requested')}</th>
                                    <th>{t('superAdminDemoRequests:table.status')}</th>
                                    <th>{t('superAdminDemoRequests:table.actions')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((item) => (
                                    <tr key={item._id}>
                                        <td>
                                            <span className="sa-demo-school">{item.schoolName}</span>
                                        </td>
                                        <td>
                                            <div className="sa-demo-contact">
                                                <strong>{item.name}</strong>
                                                <a href={`mailto:${item.email}`}>{item.email}</a>
                                                {item.phone && <span>{item.phone}</span>}
                                            </div>
                                        </td>
                                        <td>{item.role || t('superAdminDemoRequests:details.na')}</td>
                                        <td>{formatDate(item.createdAt)}</td>
                                        <td>
                                            <span className={`sa-demo-status sa-demo-status--${item.status}`}>
                                                {statusLabel(item.status)}
                                            </span>
                                        </td>
                                        <td>
                                            <button
                                                type="button"
                                                className="admin-action-btn"
                                                onClick={() => openDetails(item)}
                                            >
                                                {t('superAdminDemoRequests:table.open')}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                <TablePagination
                    page={page}
                    pageSize={pageSize}
                    totalItems={total}
                    totalPages={totalPages}
                    onPageChange={(nextPage) =>
                        setPage(Math.max(1, Math.min(nextPage, totalPages)))
                    }
                    onPageSizeChange={(nextSize) => {
                        setPageSize(nextSize);
                        setPage(1);
                    }}
                />
            </section>

            {selected && (
                <div
                    className="sa-demo-modal-backdrop"
                    role="presentation"
                    onClick={closeDetails}
                >
                    <div
                        className="sa-demo-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="sa-demo-modal-title"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="sa-demo-modal-header">
                            <div>
                                <h2 id="sa-demo-modal-title">
                                    {t('superAdminDemoRequests:details.title')}
                                </h2>
                                <p>{selected.schoolName}</p>
                            </div>
                            <button
                                type="button"
                                className="sa-demo-modal-close"
                                aria-label={t('superAdminDemoRequests:details.close')}
                                onClick={closeDetails}
                                disabled={saving}
                            >
                                <HiOutlineX size={20} />
                            </button>
                        </div>

                        <div className="sa-demo-modal-body">
                            <dl className="sa-demo-facts">
                                <div>
                                    <dt>{t('superAdminDemoRequests:details.contact')}</dt>
                                    <dd>{selected.name}</dd>
                                </div>
                                <div>
                                    <dt>{t('superAdminDemoRequests:details.email')}</dt>
                                    <dd>
                                        <a href={`mailto:${selected.email}`}>{selected.email}</a>
                                    </dd>
                                </div>
                                <div>
                                    <dt>{t('superAdminDemoRequests:details.phone')}</dt>
                                    <dd>
                                        {selected.phone ? (
                                            <a href={`tel:${selected.phone}`}>
                                                <HiOutlinePhone size={14} /> {selected.phone}
                                            </a>
                                        ) : (
                                            t('superAdminDemoRequests:details.na')
                                        )}
                                    </dd>
                                </div>
                                <div>
                                    <dt>{t('superAdminDemoRequests:details.role')}</dt>
                                    <dd>{selected.role || t('superAdminDemoRequests:details.na')}</dd>
                                </div>
                                <div>
                                    <dt>{t('superAdminDemoRequests:details.received')}</dt>
                                    <dd>{formatDate(selected.createdAt)}</dd>
                                </div>
                            </dl>

                            <div className="sa-demo-message">
                                <h3>
                                    <HiOutlineChat size={16} />
                                    {t('superAdminDemoRequests:details.message')}
                                </h3>
                                <p>
                                    {selected.message || t('superAdminDemoRequests:details.noMessage')}
                                </p>
                            </div>

                            <label className="sa-demo-field">
                                <span>{t('superAdminDemoRequests:details.statusLabel')}</span>
                                <select
                                    value={detailStatus}
                                    onChange={(event) => setDetailStatus(event.target.value)}
                                >
                                    {STATUSES.map((key) => (
                                        <option key={key} value={key}>
                                            {statusLabel(key)}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <label className="sa-demo-field">
                                <span>{t('superAdminDemoRequests:details.notes')}</span>
                                <textarea
                                    rows={4}
                                    value={detailNotes}
                                    placeholder={t('superAdminDemoRequests:details.notesPlaceholder')}
                                    onChange={(event) => setDetailNotes(event.target.value)}
                                />
                            </label>
                        </div>

                        <div className="sa-demo-modal-footer">
                            <button
                                type="button"
                                className="admin-action-btn"
                                onClick={closeDetails}
                                disabled={saving}
                            >
                                {t('superAdminDemoRequests:details.close')}
                            </button>
                            <button
                                type="button"
                                className="admin-action-btn primary"
                                onClick={saveDetails}
                                disabled={saving}
                            >
                                {saving
                                    ? t('superAdminDemoRequests:details.saving')
                                    : t('superAdminDemoRequests:details.save')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SuperAdminDemoRequestsPage;
