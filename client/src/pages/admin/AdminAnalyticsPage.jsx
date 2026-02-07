import { useEffect, useMemo, useState } from 'react';
import api from '../../config/api';

const AdminAnalyticsPage = () => {
    const [schools, setSchools] = useState([]);
    const [selectedSchoolId, setSelectedSchoolId] = useState('');
    const [period, setPeriod] = useState('monthly');
    const [year, setYear] = useState(new Date().getFullYear());

    const [loadingSchools, setLoadingSchools] = useState(true);
    const [loadingUsage, setLoadingUsage] = useState(false);

    const [schoolUsage, setSchoolUsage] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        fetchSchools();
    }, []);

    useEffect(() => {
        if (!selectedSchoolId) return;
        fetchUsage();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedSchoolId, period, year]);

    const years = useMemo(() => {
        const currentYear = new Date().getFullYear();
        return [currentYear - 2, currentYear - 1, currentYear, currentYear + 1];
    }, []);

    const periods = [
        { value: 'weekly', label: 'Weekly' },
        { value: 'monthly', label: 'Monthly' },
        { value: 'yearly', label: 'Yearly' }
    ];

    const formatNumber = (num) => {
        const n = Number(num || 0);
        if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
        if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
        return n.toString();
    };

    const formatCurrency = (num) => {
        return '$' + (Number(num || 0)).toFixed(4);
    };

    const fetchSchools = async () => {
        setLoadingSchools(true);
        setError(null);
        try {
            const response = await api.get('/schools', { params: { limit: 200 } });
            const list = response.data?.data?.schools || [];
            setSchools(list);
            if (list.length > 0) {
                setSelectedSchoolId((prev) => prev || list[0]._id);
            }
        } catch (e) {
            setError(e.response?.data?.message || 'Failed to load schools');
        } finally {
            setLoadingSchools(false);
        }
    };

    const fetchUsage = async () => {
        setLoadingUsage(true);
        setError(null);
        try {
            const response = await api.get(`/reports/token-usage/school/${selectedSchoolId}`, {
                params: { period, year }
            });
            if (response.data?.success) {
                setSchoolUsage(response.data.data);
            } else {
                setError(response.data?.message || 'Failed to load token usage');
            }
        } catch (e) {
            setError(e.response?.data?.message || 'Failed to load token usage');
        } finally {
            setLoadingUsage(false);
        }
    };

    const selectedSchool = useMemo(
        () => schools.find((s) => s._id === selectedSchoolId),
        [schools, selectedSchoolId]
    );

    return (
        <div className="admin-dashboard">
            <h1>Platform Analytics</h1>

            <div className="admin-section">
                <div className="admin-section-header">
                    <h2>AI Token Usage</h2>
                    <div style={{ display: 'flex', gap: 'var(--spacing-sm)', alignItems: 'center', flexWrap: 'wrap' }}>
                        <select
                            value={selectedSchoolId}
                            onChange={(e) => setSelectedSchoolId(e.target.value)}
                            disabled={loadingSchools || schools.length === 0}
                            style={{
                                padding: '10px 12px',
                                border: '1px solid var(--border-color)',
                                borderRadius: 'var(--radius-sm)',
                                background: 'var(--bg-input)',
                                color: 'var(--text-primary)',
                                minWidth: 240
                            }}
                        >
                            {schools.map((s) => (
                                <option key={s._id} value={s._id}>
                                    {s.name}
                                </option>
                            ))}
                        </select>

                        <select
                            value={period}
                            onChange={(e) => setPeriod(e.target.value)}
                            style={{
                                padding: '10px 12px',
                                border: '1px solid var(--border-color)',
                                borderRadius: 'var(--radius-sm)',
                                background: 'var(--bg-input)',
                                color: 'var(--text-primary)'
                            }}
                        >
                            {periods.map((p) => (
                                <option key={p.value} value={p.value}>
                                    {p.label}
                                </option>
                            ))}
                        </select>

                        <select
                            value={year}
                            onChange={(e) => setYear(e.target.value)}
                            style={{
                                padding: '10px 12px',
                                border: '1px solid var(--border-color)',
                                borderRadius: 'var(--radius-sm)',
                                background: 'var(--bg-input)',
                                color: 'var(--text-primary)'
                            }}
                        >
                            {years.map((y) => (
                                <option key={y} value={y}>
                                    {y}
                                </option>
                            ))}
                        </select>

                        <button className="admin-action-btn" onClick={fetchUsage} disabled={!selectedSchoolId || loadingUsage}>
                            Refresh
                        </button>
                    </div>
                </div>

                {loadingSchools ? (
                    <div className="admin-empty">
                        <div className="spinner"></div>
                    </div>
                ) : error ? (
                    <div className="admin-empty">
                        <p style={{ color: 'var(--accent-red)' }}>{error}</p>
                    </div>
                ) : !selectedSchoolId ? (
                    <div className="admin-empty">
                        <p>No schools available.</p>
                    </div>
                ) : loadingUsage ? (
                    <div className="admin-empty">
                        <div className="spinner"></div>
                    </div>
                ) : (
                    <div style={{ padding: 'var(--spacing-lg)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)' }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                            <strong style={{ color: 'var(--text-primary)' }}>School:</strong> {selectedSchool?.name || '—'}
                        </div>

                        <div className="admin-stats" style={{ marginTop: 0 }}>
                            <div className="admin-stat-card">
                                <div className="admin-stat-info">
                                    <h3>{formatNumber(schoolUsage?.summary?.totalTokens || 0)}</h3>
                                    <p>Total Tokens</p>
                                </div>
                            </div>
                            <div className="admin-stat-card">
                                <div className="admin-stat-info">
                                    <h3>{formatCurrency(schoolUsage?.summary?.totalCost || 0)}</h3>
                                    <p>Estimated Cost</p>
                                </div>
                            </div>
                            <div className="admin-stat-card">
                                <div className="admin-stat-info">
                                    <h3>{schoolUsage?.summary?.reportCount || 0}</h3>
                                    <p>Total Reports</p>
                                </div>
                            </div>
                        </div>

                        <div>
                            <h2 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 'var(--spacing-sm)' }}>
                                Per-User Breakdown
                            </h2>

                            {!schoolUsage?.usage || schoolUsage.usage.length === 0 ? (
                                <div className="admin-empty" style={{ padding: 'var(--spacing-xl)' }}>
                                    <p>No token usage recorded for this school in this period.</p>
                                </div>
                            ) : (
                                <div style={{ overflowX: 'auto' }}>
                                    <table className="admin-table">
                                        <thead>
                                            <tr>
                                                <th>User</th>
                                                <th>Email</th>
                                                <th style={{ textAlign: 'right' }}>Tokens</th>
                                                <th style={{ textAlign: 'right' }}>Cost</th>
                                                <th style={{ textAlign: 'right' }}>Reports</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {schoolUsage.usage.map((u) => (
                                                <tr key={u._id}>
                                                    <td style={{ fontWeight: 500 }}>{u.userName || '—'}</td>
                                                    <td>{u.email || '—'}</td>
                                                    <td style={{ textAlign: 'right' }}>{formatNumber(u.totalTokens || 0)}</td>
                                                    <td style={{ textAlign: 'right' }}>{formatCurrency(u.totalCost || 0)}</td>
                                                    <td style={{ textAlign: 'right' }}>{u.reportCount || 0}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminAnalyticsPage;
