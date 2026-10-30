import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    HiOutlineArrowLeft,
    HiOutlineArrowPath,
    HiOutlineCheckCircle,
    HiOutlineChevronDown,
    HiOutlineEnvelopeOpen,
    HiOutlineMegaphone,
    HiOutlineUserGroup,
} from 'react-icons/hi2';
import api from '../../../../config/api';
import parentGradebookService from '../../../../services/parentGradebookService';
import './ParentUpdatesPage.css';

const formatDate = (value, locale) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat(locale, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    }).format(date);
};

const ParentUpdatesPage = () => {
    const { t, i18n } = useTranslation('parentPortal');
    const language = i18n.language?.startsWith('ar') ? 'ar' : 'en';
    const locale = language === 'ar' ? 'ar-EG' : 'en-GB';

    const [children, setChildren] = useState([]);
    const [childrenLoading, setChildrenLoading] = useState(true);
    const [childrenError, setChildrenError] = useState('');

    const [childId, setChildId] = useState('');
    const [unreadOnly, setUnreadOnly] = useState(false);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [loadingMore, setLoadingMore] = useState(false);

    const [openId, setOpenId] = useState('');
    const [details, setDetails] = useState({});
    const [detailLoading, setDetailLoading] = useState('');
    const [detailError, setDetailError] = useState('');

    const loadChildren = useCallback(async () => {
        setChildrenLoading(true);
        setChildrenError('');
        try {
            const response = await parentGradebookService.getChildren();
            setChildren(response?.data || []);
        } catch (requestError) {
            setChildrenError(requestError.response?.data?.message || t('updatesPage.loadFailed'));
        } finally {
            setChildrenLoading(false);
        }
    }, [t]);

    useEffect(() => {
        loadChildren();
    }, [loadChildren]);

    const buildParams = useCallback((page) => {
        const params = { page, limit: 20 };
        if (childId) params.childId = childId;
        if (unreadOnly) params.unreadOnly = true;
        return params;
    }, [childId, unreadOnly]);

    const loadUpdates = useCallback(async () => {
        setLoading(true);
        setError('');
        setOpenId('');
        try {
            const response = await api.get('/parent/updates', { params: buildParams(1) });
            setData(response.data?.data || null);
        } catch (requestError) {
            setData(null);
            setError(requestError.response?.data?.message || t('updatesPage.loadFailed'));
        } finally {
            setLoading(false);
        }
    }, [buildParams, t]);

    useEffect(() => {
        loadUpdates();
    }, [loadUpdates]);

    const loadMore = async () => {
        if (!data?.pagination) return;
        setLoadingMore(true);
        try {
            const response = await api.get('/parent/updates', {
                params: buildParams(data.pagination.page + 1),
            });
            const next = response.data?.data;
            if (next) {
                setData((current) => current ? {
                    ...current,
                    updates: [...current.updates, ...(next.updates || [])],
                    pagination: next.pagination,
                    unreadCount: next.unreadCount,
                } : next);
            }
        } catch {
            setError(t('updatesPage.loadFailed'));
        } finally {
            setLoadingMore(false);
        }
    };

    const markAllRead = async () => {
        try {
            await api.patch('/parent/updates/read-all');
            setData((current) => current ? {
                ...current,
                unreadCount: 0,
                updates: current.updates.map((update) => ({ ...update, isRead: true })),
            } : current);
            if (unreadOnly) loadUpdates();
        } catch {
            setError(t('updatesPage.loadFailed'));
        }
    };

    const toggleUpdate = async (update) => {
        if (String(openId) === String(update.id)) {
            setOpenId('');
            return;
        }
        setOpenId(update.id);
        setDetailError('');
        if (!details[update.id]) {
            setDetailLoading(String(update.id));
            try {
                const response = await api.get(`/parent/updates/${update.id}`);
                const detail = response.data?.data?.update;
                if (detail) {
                    setDetails((current) => ({ ...current, [update.id]: detail }));
                }
            } catch {
                setDetailError(String(update.id));
            } finally {
                setDetailLoading('');
            }
        }
        if (!update.isRead) {
            try {
                await api.patch(`/parent/updates/${update.id}/read`);
                setData((current) => current ? {
                    ...current,
                    unreadCount: Math.max(0, current.unreadCount - 1),
                    updates: current.updates.map((row) => (
                        String(row.id) === String(update.id) ? { ...row, isRead: true } : row
                    )),
                } : current);
            } catch {
                // Reading the update still works; the badge just stays until a refresh.
            }
        }
    };

    const updates = useMemo(() => data?.updates || [], [data]);
    const unreadCount = data?.unreadCount || 0;
    const pagination = data?.pagination;

    if (childrenLoading) {
        return (
            <div className="parent-updates">
                <div className="pu-state"><div className="spinner" /><p>{t('updatesPage.loading')}</p></div>
            </div>
        );
    }

    if (childrenError) {
        return (
            <div className="parent-updates">
                <div className="pu-state pu-state-error">
                    <HiOutlineArrowPath size={30} />
                    <p>{childrenError}</p>
                    <button type="button" className="pu-retry" onClick={loadChildren}>{t('states.retry')}</button>
                </div>
            </div>
        );
    }

    if (children.length === 0) {
        return (
            <div className="parent-updates" dir={language === 'ar' ? 'rtl' : 'ltr'}>
                <div className="pu-empty">
                    <HiOutlineUserGroup size={40} />
                    <h2>{t('children.emptyTitle')}</h2>
                    <p>{t('children.emptyBody')}</p>
                    <Link className="pu-back" to="/portal/dashboard">
                        <HiOutlineArrowLeft size={16} />
                        {t('updatesPage.back')}
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="parent-updates" dir={language === 'ar' ? 'rtl' : 'ltr'}>
            <header className="pu-header">
                <div className="pu-heading">
                    <Link className="pu-back" to="/portal/dashboard">
                        <HiOutlineArrowLeft size={16} />
                        {t('updatesPage.back')}
                    </Link>
                    <p className="pu-eyebrow">{t('header.eyebrow')}</p>
                    <h1>{t('updatesPage.title')}</h1>
                    <p className="pu-subtitle">{t('updatesPage.subtitle')}</p>
                </div>
                <div className="pu-header-meta">
                    {unreadCount > 0 && (
                        <span className="pu-unread-chip">
                            {t('summary.unread')} · {unreadCount}
                        </span>
                    )}
                    <button
                        type="button"
                        className="pu-refresh"
                        onClick={loadUpdates}
                        aria-label={t('states.refresh')}
                    >
                        <HiOutlineArrowPath size={16} />
                    </button>
                </div>
            </header>

            <div className="pu-toolbar">
                <div className="pu-filters" role="group" aria-label={t('updatesPage.allChildren')}>
                    <button
                        type="button"
                        className={`pu-chip ${childId ? '' : 'is-active'}`}
                        onClick={() => setChildId('')}
                        aria-pressed={!childId}
                    >
                        {t('updatesPage.allChildren')}
                    </button>
                    {children.map((child) => (
                        <button
                            key={child.id}
                            type="button"
                            className={`pu-chip ${String(child.id) === String(childId) ? 'is-active' : ''}`}
                            onClick={() => setChildId(String(child.id))}
                            aria-pressed={String(child.id) === String(childId)}
                        >
                            {child.name}
                        </button>
                    ))}
                </div>
                <div className="pu-toolbar-actions">
                    <button
                        type="button"
                        className={`pu-toggle ${unreadOnly ? 'is-active' : ''}`}
                        onClick={() => setUnreadOnly((current) => !current)}
                        aria-pressed={unreadOnly}
                    >
                        {t('updatesPage.unreadOnly')}
                    </button>
                    <button
                        type="button"
                        className="pu-mark-all"
                        onClick={markAllRead}
                        disabled={unreadCount === 0}
                    >
                        <HiOutlineCheckCircle size={16} />
                        {t('updatesPage.markAllRead')}
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="pu-state"><div className="spinner" /><p>{t('updatesPage.loading')}</p></div>
            ) : error ? (
                <div className="pu-state pu-state-error">
                    <HiOutlineArrowPath size={30} />
                    <p>{error}</p>
                    <button type="button" className="pu-retry" onClick={loadUpdates}>{t('states.retry')}</button>
                </div>
            ) : updates.length === 0 ? (
                <div className="pu-empty pu-empty-inline">
                    <HiOutlineEnvelopeOpen size={36} />
                    <h2>{unreadOnly ? t('updatesPage.noUnread') : t('updatesPage.empty')}</h2>
                </div>
            ) : (
                <ul className="pu-list">
                    {updates.map((update) => {
                        const isOpen = String(openId) === String(update.id);
                        const detail = details[update.id];
                        const isLoadingDetail = detailLoading === String(update.id);
                        return (
                            <li
                                key={update.id}
                                className={`pu-item ${update.isRead ? '' : 'is-unread'} ${isOpen ? 'is-open' : ''}`}
                            >
                                <button
                                    type="button"
                                    className="pu-item-head"
                                    onClick={() => toggleUpdate(update)}
                                    aria-expanded={isOpen}
                                >
                                    <span className="pu-dot" aria-hidden="true" />
                                    <span className="pu-item-body">
                                        <span className="pu-item-meta">
                                            <span className="pu-child">{update.childName}</span>
                                            <time dateTime={update.createdAt}>
                                                {formatDate(update.createdAt, locale)}
                                            </time>
                                            {!update.isRead && (
                                                <span className="pu-badge">{t('updatesPage.unread')}</span>
                                            )}
                                        </span>
                                        <strong>{update.subject || t('updates.schoolUpdate')}</strong>
                                        <span className="pu-preview">{update.preview}</span>
                                    </span>
                                    <HiOutlineChevronDown className="pu-chevron" size={18} aria-hidden="true" />
                                </button>

                                {isOpen && (
                                    <div className="pu-detail">
                                        {isLoadingDetail ? (
                                            <p className="pu-muted">{t('updatesPage.loadingDetail')}</p>
                                        ) : detailError === String(update.id) ? (
                                            <p className="pu-detail-error">{t('updatesPage.detailFailed')}</p>
                                        ) : detail ? (
                                            <p className="pu-message">{detail.message || detail.preview}</p>
                                        ) : (
                                            <p className="pu-muted">{t('updatesPage.detailFailed')}</p>
                                        )}
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}

            {!loading && !error && pagination && pagination.page < pagination.totalPages && (
                <div className="pu-more">
                    <button type="button" className="pu-load-more" onClick={loadMore} disabled={loadingMore}>
                        {loadingMore ? t('updatesPage.loadingMore') : t('updatesPage.loadMore')}
                    </button>
                </div>
            )}

            <footer className="pu-footer">
                <HiOutlineMegaphone size={15} />
                <span>{t('updatesPage.footerNote')}</span>
            </footer>
        </div>
    );
};

export default ParentUpdatesPage;
