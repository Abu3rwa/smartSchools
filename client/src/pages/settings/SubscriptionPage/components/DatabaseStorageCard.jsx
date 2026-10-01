import { useEffect, useState, useCallback } from 'react';
import {
    HiOutlineDatabase,
    HiOutlineRefresh,
    HiOutlineTrash,
    HiOutlineExclamationCircle,
    HiOutlineCheckCircle,
    HiOutlineMail,
    HiOutlineBell,
    HiOutlineLightningBolt
} from 'react-icons/hi';
import toast from 'react-hot-toast';
import api from '../../../../config/api';
import './DatabaseStorageCard.css';

const DatabaseStorageCard = () => {
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [cleaning, setCleaning] = useState(false);
    const [storageData, setStorageData] = useState(null);
    const [error, setError] = useState('');
    const [isCleanModalOpen, setIsCleanModalOpen] = useState(false);

    // Selected cleanup targets
    const [targets, setTargets] = useState({
        routine_telemetry: true,
        sent_emails: true,
        old_notifications: true,
        old_imports: true,
        ai_tokens: false
    });
    const [olderThanDays, setOlderThanDays] = useState(30);

    const fetchStorageStats = useCallback(async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);
        setError('');

        try {
            const res = await api.get('/system/storage/stats');
            if (res.data?.success) {
                setStorageData(res.data.data);
            }
        } catch (err) {
            const msg = err.response?.data?.message || 'Failed to load database storage metrics';
            setError(msg);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        fetchStorageStats();
    }, [fetchStorageStats]);

    const handleToggleTarget = (key) => {
        setTargets((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    const handleExecuteClean = async () => {
        const activeTargets = Object.keys(targets).filter((k) => targets[k]);
        if (activeTargets.length === 0) {
            toast.error('Please select at least one item to clean');
            return;
        }

        setCleaning(true);
        try {
            const res = await api.post('/system/storage/clean', {
                targets: activeTargets,
                olderThanDays: Number(olderThanDays) || 0
            });

            if (res.data?.success) {
                const deleted = res.data.data?.totalDeleted || 0;
                toast.success(`Storage cleanup complete! Reclaimed space by deleting ${deleted.toLocaleString()} documents.`);
                setIsCleanModalOpen(false);
                fetchStorageStats(true);
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Storage cleanup failed');
        } finally {
            setCleaning(false);
        }
    };

    if (loading) {
        return (
            <div className="storage-card" id="database-storage">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: 'var(--text-muted)' }}>
                    <HiOutlineRefresh className="spin" size={20} />
                    <span>Loading database storage statistics...</span>
                </div>
            </div>
        );
    }

    if (error && !storageData) {
        return (
            <div className="storage-card" id="database-storage">
                <div style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <HiOutlineExclamationCircle size={20} />
                    <span>{error}</span>
                </div>
            </div>
        );
    }

    const { overview, categories } = storageData || {};
    const percentUsed = overview?.percentUsed ?? 0;
    const status = overview?.status || 'healthy';

    return (
        <div className="storage-card" id="database-storage">
            <div className="storage-card-header">
                <div className="storage-card-header-left">
                    <div className="storage-card-icon">
                        <HiOutlineDatabase size={24} />
                    </div>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '1.15rem' }}>MongoDB Atlas Cluster Storage</h3>
                        <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                            Cluster0 · Free Tier Limit: {overview?.clusterLimitMB || 512} MB
                        </p>
                    </div>
                </div>

                <div className="storage-card-header-actions">
                    <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => fetchStorageStats(true)}
                        disabled={refreshing}
                        title="Refresh storage metrics"
                    >
                        <HiOutlineRefresh size={16} className={refreshing ? 'spin' : ''} />
                        {refreshing ? 'Refreshing...' : 'Refresh'}
                    </button>
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => setIsCleanModalOpen(true)}
                    >
                        <HiOutlineTrash size={16} />
                        Clean Up Storage
                    </button>
                </div>
            </div>

            {/* Alert banner matching user's Atlas notice */}
            <div className={`storage-alert ${status}`}>
                {status === 'healthy' ? (
                    <HiOutlineCheckCircle size={22} />
                ) : (
                    <HiOutlineExclamationCircle size={22} />
                )}
                <div>
                    <strong>
                        {status === 'critical'
                            ? 'Critical Storage Warning'
                            : status === 'warning'
                                ? 'Approaching Storage Limit (<35% Remaining)'
                                : 'Storage Status Healthy'}
                    </strong>
                    <div>{overview?.statusMessage}</div>
                </div>
            </div>

            {/* Progress bar */}
            <div className="storage-progress-container">
                <div className="storage-progress-header">
                    <span>
                        Used: <strong>{overview?.dataSizeMB} MB</strong> ({percentUsed}%)
                    </span>
                    <span>
                        Free Remaining: <strong>{overview?.remainingMB} MB</strong> ({overview?.remainingPercent}%)
                    </span>
                </div>
                <div className="storage-progress-bar">
                    <div
                        className={`storage-progress-fill ${status}`}
                        style={{ width: `${percentUsed}%` }}
                    />
                </div>
            </div>

            {/* Quick Metrics */}
            <div className="storage-metrics-grid">
                <div className="storage-metric-box">
                    <div className="storage-metric-label">Data Size</div>
                    <div className="storage-metric-value">{overview?.dataSizeMB} MB</div>
                    <div className="storage-metric-subtext">Uncompressed data (counted against limit)</div>
                </div>

                <div className="storage-metric-box">
                    <div className="storage-metric-label">Disk Storage</div>
                    <div className="storage-metric-value">{overview?.storageSizeMB} MB</div>
                    <div className="storage-metric-subtext">Compressed on WiredTiger disk</div>
                </div>

                <div className="storage-metric-box">
                    <div className="storage-metric-label">Index Size</div>
                    <div className="storage-metric-value">{overview?.indexSizeMB} MB</div>
                    <div className="storage-metric-subtext">Indexes across {overview?.collectionsCount} collections</div>
                </div>

                <div className="storage-metric-box">
                    <div className="storage-metric-label">Total Documents</div>
                    <div className="storage-metric-value">{overview?.documentsCount?.toLocaleString()}</div>
                    <div className="storage-metric-subtext">Active records in database</div>
                </div>
            </div>

            {/* Cleanable Data Categories Breakdown */}
            <div className="storage-sections-title">Storage Breakdown & Cleanable Data</div>
            <div className="storage-categories-list">
                {/* Routine Telemetry */}
                <div className="storage-category-item">
                    <div className="storage-category-info">
                        <h4>
                            <HiOutlineLightningBolt color="#f59e0b" />
                            Activity & Telemetry Logs
                            <span className="storage-category-badge safe">Safe to Clean (Reclaims ~90%)</span>
                        </h4>
                        <p>{categories?.routineTelemetry?.description}</p>
                    </div>
                    <div className="storage-category-metrics">
                        <div className="storage-category-size">~{categories?.routineTelemetry?.estimatedMB} MB</div>
                        <div className="storage-category-count">
                            {categories?.routineTelemetry?.count?.toLocaleString()} requests & heartbeats
                        </div>
                    </div>
                </div>

                {/* Sent Emails */}
                <div className="storage-category-item">
                    <div className="storage-category-info">
                        <h4>
                            <HiOutlineMail color="#3b82f6" />
                            Sent Email Deliveries & Logs
                            <span className="storage-category-badge safe">Safe to Clean</span>
                        </h4>
                        <p>{categories?.sentEmails?.description}</p>
                    </div>
                    <div className="storage-category-metrics">
                        <div className="storage-category-size">~{categories?.sentEmails?.estimatedMB} MB</div>
                        <div className="storage-category-count">
                            {categories?.sentEmails?.count?.toLocaleString()} sent deliveries & reports
                        </div>
                    </div>
                </div>

                {/* Notifications */}
                <div className="storage-category-item">
                    <div className="storage-category-info">
                        <h4>
                            <HiOutlineBell color="#8b5cf6" />
                            Old Notification History
                            <span className="storage-category-badge safe">Safe to Clean (&gt;30d)</span>
                        </h4>
                        <p>{categories?.oldNotifications?.description}</p>
                    </div>
                    <div className="storage-category-metrics">
                        <div className="storage-category-size">~{categories?.oldNotifications?.estimatedMB} MB</div>
                        <div className="storage-category-count">
                            {categories?.oldNotifications?.count?.toLocaleString()} notifications
                        </div>
                    </div>
                </div>

                {/* Core Academic Data */}
                <div className="storage-category-item">
                    <div className="storage-category-info">
                        <h4>
                            <HiOutlineDatabase color="#10b981" />
                            Core Academic Data (Grades, Classes, Students)
                            <span className="storage-category-badge protected">Protected Core Data</span>
                        </h4>
                        <p>Essential school curriculum, gradebook, timetable, and student academic records.</p>
                    </div>
                    <div className="storage-category-metrics">
                        <div className="storage-category-size">~8.5 MB</div>
                        <div className="storage-category-count">Never deleted by automated cleanups</div>
                    </div>
                </div>
            </div>

            {/* Clean Up Modal */}
            {isCleanModalOpen && (
                <div className="storage-clean-modal-backdrop" onClick={() => !cleaning && setIsCleanModalOpen(false)}>
                    <div className="storage-clean-modal" onClick={(e) => e.stopPropagation()}>
                        <h3 style={{ margin: '0 0 0.5rem 0' }}>Clean Up Database Storage</h3>
                        <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-muted)' }}>
                            Select the categories of historical logs and sent data you wish to delete. Your core academic data (students, grades, classes) will remain 100% safe.
                        </p>

                        <div className="storage-clean-options">
                            <label className="storage-option-row">
                                <input
                                    type="checkbox"
                                    checked={targets.routine_telemetry}
                                    onChange={() => handleToggleTarget('routine_telemetry')}
                                    disabled={cleaning}
                                />
                                <div>
                                    <span className="storage-option-title">
                                        Routine API Requests & Heartbeat Logs (Recommended)
                                    </span>
                                    <span className="storage-option-desc">
                                        Frees ~270 MB immediately. Deletes background HTTP telemetry and heartbeat pings.
                                    </span>
                                </div>
                            </label>

                            <label className="storage-option-row">
                                <input
                                    type="checkbox"
                                    checked={targets.sent_emails}
                                    onChange={() => handleToggleTarget('sent_emails')}
                                    disabled={cleaning}
                                />
                                <div>
                                    <span className="storage-option-title">
                                        Sent Email Delivery Snapshots & Reports
                                    </span>
                                    <span className="storage-option-desc">
                                        Deletes full HTML snapshots of already delivered spelling test emails and reports.
                                    </span>
                                </div>
                            </label>

                            <label className="storage-option-row">
                                <input
                                    type="checkbox"
                                    checked={targets.old_notifications}
                                    onChange={() => handleToggleTarget('old_notifications')}
                                    disabled={cleaning}
                                />
                                <div>
                                    <span className="storage-option-title">
                                        Notifications Older than 30 Days
                                    </span>
                                    <span className="storage-option-desc">
                                        Deletes delivered/read notification history older than 30 days.
                                    </span>
                                </div>
                            </label>

                            <label className="storage-option-row">
                                <input
                                    type="checkbox"
                                    checked={targets.old_imports}
                                    onChange={() => handleToggleTarget('old_imports')}
                                    disabled={cleaning}
                                />
                                <div>
                                    <span className="storage-option-title">
                                        Old Import Runs & Error Logs
                                    </span>
                                    <span className="storage-option-desc">
                                        Deletes completed CSV bulk import error dumps older than 14 days.
                                    </span>
                                </div>
                            </label>
                        </div>

                        <div style={{ marginTop: '0.75rem' }}>
                            <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                Age cutoff for emails/notifications:{' '}
                                <select
                                    value={olderThanDays}
                                    onChange={(e) => setOlderThanDays(Number(e.target.value))}
                                    disabled={cleaning}
                                    style={{
                                        padding: '0.25rem 0.5rem',
                                        borderRadius: '4px',
                                        border: '1px solid var(--border-color)',
                                        background: 'var(--bg-secondary)',
                                        color: 'var(--text-primary)'
                                    }}
                                >
                                    <option value={0}>All sent emails / all records</option>
                                    <option value={14}>Older than 14 days</option>
                                    <option value={30}>Older than 30 days</option>
                                    <option value={60}>Older than 60 days</option>
                                </select>
                            </label>
                        </div>

                        <div className="storage-modal-actions">
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => setIsCleanModalOpen(false)}
                                disabled={cleaning}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={handleExecuteClean}
                                disabled={cleaning}
                            >
                                {cleaning ? 'Cleaning Storage...' : 'Confirm & Clean Storage'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DatabaseStorageCard;
