import { useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    Box,
    Chip,
    InputAdornment,
    MenuItem,
    Paper,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    useMediaQuery,
    useTheme
} from '@mui/material';
import { selectUser } from '../../../store/slices/authSlice';
import { selectCurrentAcademicYear } from '../../../store/slices/uiSlice';
import {
    HiOutlineCheckCircle,
    HiOutlineXCircle,
    HiOutlineClock,
    HiOutlineMail,
    HiOutlineBell,
    HiOutlinePaperAirplane,
    HiOutlineArrowRight,
    HiOutlineSearch
} from 'react-icons/hi';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import notificationService from '../../../services/notificationService';
import useNotificationsData from './hooks/useNotificationsData';
import { QUICK_HOUR_OPTIONS } from './constants';
import {
    getStatusCategory,
    getStatusLabel,
    getTypeLabel
} from './utils/notificationPresentation';
import NotificationDetailsModal from './components/NotificationDetailsModal';
import './NotificationsPage.css';

const NotificationsPage = () => {
    const navigate = useNavigate();
    const { t } = useTranslation(['notifications']);
    const theme = useTheme();
    const isSmDown = useMediaQuery(theme.breakpoints.down('sm'));
    const user = useSelector(selectUser);

    const academicYear = useSelector(selectCurrentAcademicYear);
    const isAdmin = user?.role === 'admin' || user?.role === 'department_principal';

    const [activeTab, setActiveTab] = useState('history');
    const [quickSending, setQuickSending] = useState(false);
    const [quickResult, setQuickResult] = useState(null);
    const [selectedNotification, setSelectedNotification] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [typeFilter, setTypeFilter] = useState('all');

    const {
        loading,
        notificationTypes,
        filteredNotifications,
        totalSent,
        deliveredCount,
        failedCount,
        pendingCount,
        refetchHistory
    } = useNotificationsData({
        academicYear,
        searchTerm,
        statusFilter,
        typeFilter
    });
    const tableColumnCount = 3 + (isSmDown ? 0 : 1);



    const getStatusIcon = (status) => {
        switch (status) {
            case 'sent':
                return <HiOutlineCheckCircle className="status-icon success" />;
            case 'failed':
                return <HiOutlineXCircle className="status-icon error" />;
            default:
                return <HiOutlineClock className="status-icon pending" />;
        }
    };
    const renderStatusChip = (status) => (
        <Chip
            size="small"
            icon={getStatusIcon(status)}
            label={getStatusLabel(status, t)}
            sx={{
                textTransform: 'capitalize',
                fontWeight: 600,
                borderRadius: '999px',
                border: '1px solid transparent',
                background:
                    getStatusCategory(status) === 'sent'
                        ? 'rgba(16, 185, 129, 0.15)'
                        : getStatusCategory(status) === 'failed'
                            ? 'rgba(239, 68, 68, 0.15)'
                            : 'rgba(245, 158, 11, 0.15)',
                color:
                    getStatusCategory(status) === 'sent'
                        ? 'var(--accent-emerald)'
                        : getStatusCategory(status) === 'failed'
                            ? 'var(--accent-red)'
                            : 'var(--accent-amber)'
            }}
        />
    );

    const handleQuickSend = async (hours) => {
        setQuickSending(true);
        setQuickResult(null);
        try {
            const result = await notificationService.runAttendanceReminder(hours);
            setQuickResult(result);
            toast.success(t('notifications:toasts.remindersSent', { count: result.results.sent }));
            refetchHistory();
        } catch (error) {
            toast.error(error.response?.data?.message || t('notifications:toasts.remindersFailed'));
        } finally {
            setQuickSending(false);
        }
    };

    return (
        <div className="notifications-page">
            <div className="page-header">
                <div>
                    <h1>{t('notifications:page.title')}</h1>
                    <p className="text-muted">{t('notifications:page.subtitle')}</p>
                </div>

            </div>

            <Box
                sx={{
                    display: 'grid',
                    gridTemplateColumns: {
                        // xs: '1fr',
                        xs: 'repeat(2, minmax(0, 1fr))',
                        sm: 'repeat(2, minmax(0, 1fr))',
                        lg: 'repeat(4, minmax(0, 1fr))'
                    },
                    gap: 2,
                    mb: 3
                }}
            >
                {[
                    { label: t('notifications:stats.totalSent'), value: totalSent, icon: <HiOutlineMail size={20} /> },
                    { label: t('notifications:stats.delivered'), value: deliveredCount, icon: <HiOutlineCheckCircle size={20} />, tone: 'success' },
                    { label: t('notifications:stats.pending'), value: pendingCount, icon: <HiOutlineClock size={20} />, tone: 'warning' },
                    { label: t('notifications:stats.failed'), value: failedCount, icon: <HiOutlineXCircle size={20} />, tone: 'error' }
                ].map((item) => (
                    <Paper
                        key={item.label}
                        variant="outlined"
                        sx={{
                            p: 2,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 2,
                            borderRadius: 2,
                            borderColor: 'var(--border-color)',
                            background: 'var(--bg-card)'
                        }}
                    >
                        <Box
                            sx={{
                                width: 33,
                                height: 33,
                                borderRadius: 2,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background:
                                    item.tone === 'success'
                                        ? 'rgba(16, 185, 129, 0.15)'
                                        : item.tone === 'warning'
                                            ? 'rgba(245, 158, 11, 0.15)'
                                            : item.tone === 'error'
                                                ? 'rgba(239, 68, 68, 0.15)'
                                                : 'rgba(var(--accent-primary-rgb), 0.15)',
                                color:
                                    item.tone === 'success'
                                        ? 'var(--accent-emerald)'
                                        : item.tone === 'warning'
                                            ? 'var(--accent-amber)'
                                            : item.tone === 'error'
                                                ? 'var(--accent-red)'
                                                : 'var(--primary-400)'
                            }}
                        >
                            {item.icon}
                        </Box>
                        <Box>
                            <Box sx={{ fontSize: '1.6rem', fontWeight: 700, lineHeight: 1 }}>
                                {item.value}
                            </Box>
                            <Box sx={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                {item.label}
                            </Box>
                        </Box>
                    </Paper>
                ))}
            </Box>

            {/* Tabs */}
            <div className="tabs">
                <button
                    className={`tab ${activeTab === 'history' ? 'active' : ''}`}
                    onClick={() => setActiveTab('history')}
                >
                    {t('notifications:tabs.history')}
                </button>
                <button
                    className={`tab ${activeTab === 'stats' ? 'active' : ''}`}
                    onClick={() => setActiveTab('stats')}
                >
                    {t('notifications:tabs.statistics')}
                </button>
                {isAdmin && (
                    <button
                        className={`tab ${activeTab === 'attendance' ? 'active' : ''}`}
                        onClick={() => setActiveTab('attendance')}
                    >
                        <HiOutlineBell size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                        {t('notifications:tabs.attendanceReminders')}
                    </button>
                )}
            </div>

            {/* History Tab */}
            {activeTab === 'history' && (
                <div className="card">
                    <Stack
                        direction={{ xs: 'column', md: 'row' }}
                        spacing={2}
                        alignItems={{ xs: 'stretch', md: 'center' }}
                        justifyContent="space-between"
                        sx={{ mb: 2 }}
                    >
                        <TextField
                            size="small"
                            placeholder={t('notifications:filters.searchPlaceholder')}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            sx={{ flex: 1, minWidth: { xs: '100%', md: 320 } }}
                            InputProps={{
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <HiOutlineSearch />
                                    </InputAdornment>
                                )
                            }}
                        />
                        <Stack
                            direction={{ xs: 'column', sm: 'row' }}
                            spacing={2}
                            sx={{ width: { xs: '100%', md: 'auto' } }}
                        >
                            <TextField
                                select
                                size="small"
                                label={t('notifications:filters.status')}
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                                sx={{ minWidth: 160 }}
                            >
                                <MenuItem value="all">{t('notifications:common.all')}</MenuItem>
                                <MenuItem value="sent">{t('notifications:status.sent')}</MenuItem>
                                <MenuItem value="pending">{t('notifications:status.pending')}</MenuItem>
                                <MenuItem value="failed">{t('notifications:status.failed')}</MenuItem>
                            </TextField>
                            <TextField
                                select
                                size="small"
                                label={t('notifications:filters.type')}
                                value={typeFilter}
                                onChange={(e) => setTypeFilter(e.target.value)}
                                sx={{ minWidth: 180 }}
                            >
                                <MenuItem value="all">{t('notifications:common.all')}</MenuItem>
                                {notificationTypes.map((type) => (
                                    <MenuItem key={type} value={type}>
                                        {getTypeLabel(type, t)}
                                    </MenuItem>
                                ))}
                            </TextField>
                        </Stack>
                    </Stack>
                    {loading ? (
                        <div className="loading-container">
                            <div className="spinner"></div>
                        </div>
                    ) : isSmDown ? (
                        <Stack spacing={1.5}>
                            {filteredNotifications.map((notification) => (
                                <Paper
                                    key={notification._id}
                                    variant="outlined"
                                    onClick={() => setSelectedNotification(notification)}
                                    sx={{
                                        p: 2,
                                        cursor: 'pointer',
                                        background: 'var(--bg-card)',
                                        borderColor: 'var(--border-color)'
                                    }}
                                >
                                    <Stack direction="row" justifyContent="space-between" spacing={2} alignItems="flex-start">
                                        <Box sx={{ minWidth: 0 }}>
                                            <Box sx={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                                {notification.subject || t('notifications:labels.noSubject')}
                                            </Box>
                                            <Box sx={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                                {notification.recipientEmail}
                                            </Box>
                                        </Box>
                                        {renderStatusChip(notification.status)}
                                    </Stack>
                                </Paper>
                            ))}
                            {filteredNotifications.length === 0 && (
                                <Paper variant="outlined" sx={{ p: 2, textAlign: 'center', color: 'var(--text-muted)' }}>
                                    {t('notifications:labels.noMatch')}
                                </Paper>
                            )}
                        </Stack>
                    ) : (
                        <TableContainer component={Paper} variant="outlined" sx={{ background: 'var(--bg-card)' }}>
                            <Table size={isSmDown ? 'small' : 'medium'}>
                                <TableHead>
                                    <TableRow>
                                        <TableCell>{t('notifications:table.status')}</TableCell>
                                        <TableCell>{t('notifications:table.subject')}</TableCell>
                                        {!isSmDown && <TableCell>{t('notifications:table.date')}</TableCell>}
                                        <TableCell>{t('notifications:table.type')}</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {filteredNotifications.map(notification => (
                                        <TableRow
                                            key={notification._id}
                                            hover
                                            onClick={() => setSelectedNotification(notification)}
                                            sx={{ cursor: 'pointer' }}
                                        >
                                            <TableCell>{renderStatusChip(notification.status)}</TableCell>
                                            <TableCell sx={{ maxWidth: 260 }}>
                                                <Box className="truncate">{notification.subject}</Box>
                                            </TableCell>
                                            {!isSmDown && (
                                                <TableCell sx={{ color: 'var(--text-muted)' }}>
                                                    {format(new Date(notification.createdAt), 'MMM d, yyyy HH:mm')}
                                                </TableCell>
                                            )}
                                            <TableCell>
                                                <Chip
                                                    size="small"
                                                    label={getTypeLabel(notification.type, t)}
                                                    sx={{
                                                        textTransform: 'capitalize',
                                                        fontWeight: 600,
                                                        background: 'rgba(var(--accent-primary-rgb), 0.12)',
                                                        color: 'var(--primary-400)',
                                                        border: '1px solid rgba(var(--accent-primary-rgb), 0.3)'
                                                    }}
                                                />
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {filteredNotifications.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={tableColumnCount} className="empty-row">
                                                {t('notifications:labels.noMatch')}
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}
                </div>
            )}

            {/* Stats Tab */}
            {activeTab === 'stats' && (
                <div className="stats-grid">
                    <div className="stat-card">
                        <HiOutlineMail size={32} />
                        <div>
                            <span className="stat-value">{totalSent}</span>
                            <span className="stat-label">{t('notifications:stats.totalSent')}</span>
                        </div>
                    </div>
                    <div className="stat-card">
                        <HiOutlineCheckCircle size={32} />
                        <div>
                            <span className="stat-value">{deliveredCount}</span>
                            <span className="stat-label">{t('notifications:stats.delivered')}</span>
                        </div>
                    </div>
                    <div className="stat-card">
                        <HiOutlineXCircle size={32} />
                        <div>
                            <span className="stat-value">{failedCount}</span>
                            <span className="stat-label">{t('notifications:stats.failed')}</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Attendance Reminders Tab (Admin only) */}
            {activeTab === 'attendance' && isAdmin && (
                <div className="card">
                    <div className="attendance-quick-panel">
                        <div className="quick-panel-header">
                            <HiOutlineBell size={22} />
                            <div>
                                <h3 style={{ margin: 0 }}>{t('notifications:attendance.quickTitle')}</h3>
                                <p className="text-muted" style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>
                                    {t('notifications:attendance.quickSubtitle')}
                                </p>
                            </div>
                        </div>

                        <div className="quick-send-buttons">
                            {QUICK_HOUR_OPTIONS.map((opt) => (
                                <button
                                    key={opt.value}
                                    className="quick-send-btn"
                                    onClick={() => handleQuickSend(opt.value)}
                                    disabled={quickSending}
                                >
                                    <HiOutlinePaperAirplane size={16} />
                                    <span>{t('notifications:attendance.hoursAgo', { hours: opt.label })}</span>
                                </button>
                            ))}
                        </div>

                        {quickSending && (
                            <div className="quick-sending-indicator">
                                <div className="spinner" style={{ width: 20, height: 20 }}></div>
                                <span>{t('notifications:attendance.sending')}</span>
                            </div>
                        )}

                        {quickResult && !quickSending && (
                            <div className="quick-result">
                                <div className="quick-result-stats">
                                    <span className="quick-stat">
                                        <strong>{quickResult.results.sent}</strong> {t('notifications:attendance.sent')}
                                    </span>
                                    <span className="quick-stat muted">
                                        <strong>{quickResult.results.skipped}</strong> {t('notifications:attendance.skipped')}
                                    </span>
                                    {quickResult.results.failed > 0 && (
                                        <span className="quick-stat error">
                                            <strong>{quickResult.results.failed}</strong> {t('notifications:attendance.failed')}
                                        </span>
                                    )}
                                </div>
                            </div>
                        )}

                        <button
                            className="view-all-link"
                            onClick={() => navigate('/portal/attendance-reminders')}
                        >
                            {t('notifications:attendance.viewHistory')}
                            <HiOutlineArrowRight size={16} />
                        </button>
                    </div>
                </div>
            )}

            {/* Notification Details Modal */}
            <NotificationDetailsModal
                notification={selectedNotification}
                onClose={() => setSelectedNotification(null)}
                getStatusIcon={getStatusIcon}
                getTypeLabel={getTypeLabel}
                getStatusLabel={getStatusLabel}
            />

        </div>
    );
};

export default NotificationsPage;
