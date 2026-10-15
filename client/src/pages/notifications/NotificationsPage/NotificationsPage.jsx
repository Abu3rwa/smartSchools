import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
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
    HiOutlineSearch,
    HiOutlineTrash
} from 'react-icons/hi';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import notificationService from '../../../services/notificationService';
import useNotificationsData from './hooks/useNotificationsData';
import {
    getStatusCategory,
    getStatusLabel,
    getTypeLabel
} from './utils/notificationPresentation';
import NotificationDetailsModal from './components/NotificationDetailsModal';
import './NotificationsPage.css';

const NotificationsPage = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { t } = useTranslation(['notifications']);
    const theme = useTheme();
    const isSmDown = useMediaQuery(theme.breakpoints.down('sm'));
    const user = useSelector(selectUser);

    const academicYear = useSelector(selectCurrentAcademicYear);
    const isAdmin = user?.role === 'admin';

    const [activeTab, setActiveTab] = useState(() =>
        new URLSearchParams(location.search).get('tab') === 'gmail-cleanup' ? 'cleanup' : 'history'
    );
    const [quickSending, setQuickSending] = useState(false);
    const [quickResult, setQuickResult] = useState(null);
    const [selectedNotification, setSelectedNotification] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [typeFilter, setTypeFilter] = useState('all');
    const [reminderSettingsLoading, setReminderSettingsLoading] = useState(false);
    const [reminderSettings, setReminderSettings] = useState({
        enabled: true,
        delayMinutes: 60
    });
    const [gmailCleanupStatus, setGmailCleanupStatus] = useState(null);
    const [gmailCleanupStatusLoading, setGmailCleanupStatusLoading] = useState(false);
    const [gmailCleanupSource, setGmailCleanupSource] = useState('all_sent');
    const [gmailCleanupPeriod, setGmailCleanupPeriod] = useState('this_month');
    const [gmailCleanupPreview, setGmailCleanupPreview] = useState(null);
    const [gmailCleanupPreviewLoading, setGmailCleanupPreviewLoading] = useState(false);
    const [gmailCleanupMoving, setGmailCleanupMoving] = useState(false);
    const [gmailCleanupDialogOpen, setGmailCleanupDialogOpen] = useState(false);
    const [gmailCleanupConfirmation, setGmailCleanupConfirmation] = useState('');
    const [gmailCleanupResult, setGmailCleanupResult] = useState(null);

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

    useEffect(() => {
        if (!isAdmin || activeTab !== 'attendance') return;
        let isMounted = true;

        const loadReminderSettings = async () => {
            setReminderSettingsLoading(true);
            try {
                const response = await notificationService.getAttendanceReminderSettings();
                if (!isMounted) return;
                setReminderSettings({
                    enabled: response?.data?.enabled !== false,
                    delayMinutes: Number(response?.data?.delayMinutes || 60)
                });
            } catch (error) {
                if (isMounted) {
                    toast.error(error.response?.data?.message || t('notifications:toasts.reminderSettingsLoadFailed'));
                }
            } finally {
                if (isMounted) {
                    setReminderSettingsLoading(false);
                }
            }
        };

        loadReminderSettings();
        return () => {
            isMounted = false;
        };
    }, [activeTab, isAdmin, t]);

    useEffect(() => {
        if (activeTab !== 'cleanup') return;
        let isMounted = true;
        setGmailCleanupStatusLoading(true);
        notificationService.getGmailCleanupStatus()
            .then((status) => {
                if (isMounted) setGmailCleanupStatus(status);
            })
            .catch((error) => {
                if (isMounted) {
                    toast.error(error.response?.data?.message || t('notifications:gmailCleanup.statusFailed'));
                }
            })
            .finally(() => {
                if (isMounted) setGmailCleanupStatusLoading(false);
            });
        return () => {
            isMounted = false;
        };
    }, [activeTab, t]);

    useEffect(() => {
        const query = new URLSearchParams(location.search);
        const error = query.get('gmail_cleanup_error');
        if (error) {
            toast.error(error === 'missing_scope'
                ? t('notifications:gmailCleanup.permissionMissing')
                : t('notifications:gmailCleanup.connectionFailed', { error }));
        } else if (query.get('gmail_cleanup_connected') === 'true') {
            toast.success(t('notifications:gmailCleanup.connected'));
        }
    }, [location.search, t]);

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

    const handleQuickSend = async () => {
        setQuickSending(true);
        setQuickResult(null);
        try {
            const result = await notificationService.runAttendanceReminder();
            setQuickResult(result);
            toast.success(t('notifications:toasts.remindersSent', {
                count: result.results.sent,
                minutes: result.delayMinutes || reminderSettings.delayMinutes
            }));
            refetchHistory();
        } catch (error) {
            toast.error(error.response?.data?.message || t('notifications:toasts.remindersFailed'));
        } finally {
            setQuickSending(false);
        }
    };

    const handleGmailConnect = async () => {
        try {
            const authUrl = await notificationService.getGmailAuthorizationUrl();
            window.location.assign(authUrl);
        } catch (error) {
            toast.error(error.response?.data?.message || t('notifications:gmailCleanup.connectionFailed'));
        }
    };

    const handleGmailCleanupPreview = async () => {
        setGmailCleanupPreviewLoading(true);
        setGmailCleanupPreview(null);
        setGmailCleanupResult(null);
        try {
            const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
            const preview = await notificationService.previewGmailCleanup({
                source: gmailCleanupSource,
                period: gmailCleanupPeriod,
                timeZone
            });
            setGmailCleanupPreview(preview);
        } catch (error) {
            if (error.response?.status === 401) {
                setGmailCleanupStatus((status) => ({
                    ...status,
                    connected: false,
                    canManageMailbox: false
                }));
            }
            toast.error(error.response?.data?.message || t('notifications:gmailCleanup.previewFailed'));
        } finally {
            setGmailCleanupPreviewLoading(false);
        }
    };

    const handleGmailCleanupTrash = async () => {
        if (!gmailCleanupPreview || gmailCleanupConfirmation !== 'TRASH') return;
        setGmailCleanupMoving(true);
        try {
            const result = await notificationService.trashGmailSentMessages(
                gmailCleanupPreview.previewToken,
                gmailCleanupConfirmation
            );
            setGmailCleanupResult(result);
            setGmailCleanupPreview(null);
            setGmailCleanupDialogOpen(false);
            setGmailCleanupConfirmation('');
            if (result.failedCount > 0) {
                toast.error(t('notifications:gmailCleanup.trashPartial', {
                    trashed: result.trashedCount,
                    failed: result.failedCount
                }));
            } else {
                toast.success(t('notifications:gmailCleanup.trashComplete', { count: result.trashedCount }));
            }
        } catch (error) {
            if (error.response?.status === 409) setGmailCleanupPreview(null);
            if (error.response?.status === 401) {
                setGmailCleanupStatus((status) => ({
                    ...status,
                    connected: false,
                    canManageMailbox: false
                }));
            }
            toast.error(error.response?.data?.message || t('notifications:gmailCleanup.trashFailed'));
        } finally {
            setGmailCleanupMoving(false);
        }
    };

    const getCleanupConfirmationWindow = (preview) => {
        if (!preview) return '';
        if (!preview.startAt || !preview.endAt) {
            return t('notifications:gmailCleanup.allTimeWindow', {
                previewedAt: format(new Date(preview.previewedAt), 'PPpp'),
                timeZone: preview.timeZone
            });
        }
        return t('notifications:gmailCleanup.previewRange', {
            start: format(new Date(preview.startAt), 'PPpp'),
            end: format(new Date(preview.endAt), 'PPpp')
        });
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
                <button
                    className={`tab ${activeTab === 'cleanup' ? 'active' : ''}`}
                    onClick={() => setActiveTab('cleanup')}
                >
                    <HiOutlineTrash size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                    {t('notifications:tabs.gmailCleanup')}
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

            {activeTab === 'cleanup' && (
                <Paper
                    variant="outlined"
                    sx={{
                        p: { xs: 2, md: 3 },
                        borderColor: 'var(--border-color)',
                        background: 'var(--bg-card)'
                    }}
                >
                    <Stack spacing={2.5}>
                        <Box>
                            <h2 style={{ margin: 0 }}>{t('notifications:gmailCleanup.title')}</h2>
                            <p className="text-muted" style={{ margin: '6px 0 0' }}>
                                {t('notifications:gmailCleanup.subtitle')}
                            </p>
                        </Box>

                        <Alert severity="warning">
                            {t('notifications:gmailCleanup.trashWarning')}
                        </Alert>

                        {gmailCleanupStatusLoading ? (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <CircularProgress size={18} />
                                <span>{t('notifications:gmailCleanup.checkingConnection')}</span>
                            </Box>
                        ) : gmailCleanupStatus?.connected ? (
                            <Alert severity={gmailCleanupStatus.canManageMailbox ? 'success' : 'info'}>
                                {gmailCleanupStatus.canManageMailbox
                                    ? t('notifications:gmailCleanup.accountReady', { email: gmailCleanupStatus.email })
                                    : t('notifications:gmailCleanup.permissionRequired', { email: gmailCleanupStatus.email })}
                            </Alert>
                        ) : (
                            <Alert severity="info">{t('notifications:gmailCleanup.accountNotConnected')}</Alert>
                        )}

                        {(!gmailCleanupStatus?.connected || !gmailCleanupStatus?.canManageMailbox) && !gmailCleanupStatusLoading && (
                            <Box>
                                <Button variant="outlined" onClick={handleGmailConnect}>
                                    {gmailCleanupStatus?.connected
                                        ? t('notifications:gmailCleanup.grantPermission')
                                        : t('notifications:gmailCleanup.connectAccount')}
                                </Button>
                            </Box>
                        )}

                        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                            <TextField
                                select
                                fullWidth
                                disabled={gmailCleanupPreviewLoading || gmailCleanupMoving}
                                label={t('notifications:gmailCleanup.sourceLabel')}
                                value={gmailCleanupSource}
                                onChange={(event) => {
                                    setGmailCleanupSource(event.target.value);
                                    setGmailCleanupPreview(null);
                                    setGmailCleanupResult(null);
                                }}
                            >
                                <MenuItem value="all_sent">{t('notifications:gmailCleanup.sourceAll')}</MenuItem>
                                <MenuItem value="app_sent">{t('notifications:gmailCleanup.sourceApp')}</MenuItem>
                            </TextField>
                            <TextField
                                select
                                fullWidth
                                disabled={gmailCleanupPreviewLoading || gmailCleanupMoving}
                                label={t('notifications:gmailCleanup.periodLabel')}
                                value={gmailCleanupPeriod}
                                onChange={(event) => {
                                    setGmailCleanupPeriod(event.target.value);
                                    setGmailCleanupPreview(null);
                                    setGmailCleanupResult(null);
                                }}
                            >
                                <MenuItem value="today">{t('notifications:gmailCleanup.today')}</MenuItem>
                                <MenuItem value="this_week">{t('notifications:gmailCleanup.thisWeek')}</MenuItem>
                                <MenuItem value="this_month">{t('notifications:gmailCleanup.thisMonth')}</MenuItem>
                                <MenuItem value="all_time">{t('notifications:gmailCleanup.allTime')}</MenuItem>
                            </TextField>
                        </Stack>

                        {gmailCleanupSource === 'app_sent' && (
                            <Alert severity="info">{t('notifications:gmailCleanup.appOnlyCoverage')}</Alert>
                        )}

                        <Box>
                            <Button
                                variant="contained"
                                onClick={handleGmailCleanupPreview}
                                disabled={
                                    gmailCleanupPreviewLoading ||
                                    gmailCleanupMoving ||
                                    !gmailCleanupStatus?.connected ||
                                    !gmailCleanupStatus?.canManageMailbox
                                }
                                startIcon={
                                    gmailCleanupPreviewLoading
                                        ? <CircularProgress size={16} color="inherit" />
                                        : <HiOutlineSearch />
                                }
                            >
                                {gmailCleanupPreviewLoading
                                    ? t('notifications:gmailCleanup.previewLoading')
                                    : t('notifications:gmailCleanup.previewAction')}
                            </Button>
                        </Box>

                        {gmailCleanupPreview && (
                            <Paper
                                variant="outlined"
                                sx={{
                                    p: 2,
                                    borderColor: 'var(--border-color)',
                                    background: 'var(--bg-secondary, var(--bg-card))'
                                }}
                            >
                                <Stack spacing={1.5}>
                                    <Box>
                                        <strong>{t('notifications:gmailCleanup.previewCount', { count: gmailCleanupPreview.count })}</strong>
                                        <Box sx={{ color: 'var(--text-muted)', fontSize: '0.9rem', mt: 0.5 }}>
                                            {t('notifications:gmailCleanup.previewAccount', { email: gmailCleanupPreview.accountEmail })}
                                        </Box>
                                        <Box sx={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                            {t('notifications:gmailCleanup.previewTimezone', { timeZone: gmailCleanupPreview.timeZone })}
                                        </Box>
                                        {gmailCleanupPreview.startAt && gmailCleanupPreview.endAt && (
                                            <Box sx={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                                {t('notifications:gmailCleanup.previewRange', {
                                                    start: format(new Date(gmailCleanupPreview.startAt), 'PPpp'),
                                                    end: format(new Date(gmailCleanupPreview.endAt), 'PPpp')
                                                })}
                                            </Box>
                                        )}
                                        {!gmailCleanupPreview.startAt && (
                                            <Box sx={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                                {t('notifications:gmailCleanup.allTimeWindow', {
                                                    previewedAt: format(new Date(gmailCleanupPreview.previewedAt), 'PPpp'),
                                                    timeZone: gmailCleanupPreview.timeZone
                                                })}
                                            </Box>
                                        )}
                                    </Box>
                                    {gmailCleanupPreview.sample.length > 0 && (
                                        <Box>
                                            <Box sx={{ fontWeight: 600, mb: 0.5 }}>
                                                {t('notifications:gmailCleanup.sampleTitle')}
                                            </Box>
                                            {gmailCleanupPreview.sample.map((item, index) => (
                                                <Box
                                                    key={`${item.date || 'message'}-${index}`}
                                                    sx={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}
                                                >
                                                    {item.subject}{item.date ? ` · ${format(new Date(item.date), 'PPp')}` : ''}
                                                </Box>
                                            ))}
                                        </Box>
                                    )}
                                    <Box>
                                        <Button
                                            color="error"
                                            variant="contained"
                                            startIcon={<HiOutlineTrash />}
                                            disabled={gmailCleanupPreview.count === 0 || gmailCleanupMoving}
                                            onClick={() => setGmailCleanupDialogOpen(true)}
                                        >
                                            {t('notifications:gmailCleanup.trashButton')}
                                        </Button>
                                    </Box>
                                </Stack>
                            </Paper>
                        )}

                        {gmailCleanupResult && (
                            <Alert severity={gmailCleanupResult.failedCount > 0 || !gmailCleanupResult.auditRecorded ? 'warning' : 'success'}>
                                {gmailCleanupResult.failedCount > 0
                                    ? t('notifications:gmailCleanup.trashPartial', {
                                        trashed: gmailCleanupResult.trashedCount,
                                        failed: gmailCleanupResult.failedCount
                                    })
                                    : t('notifications:gmailCleanup.trashComplete', { count: gmailCleanupResult.trashedCount })}
                                {!gmailCleanupResult.auditRecorded && ` ${t('notifications:gmailCleanup.auditWarning')}`}
                            </Alert>
                        )}
                    </Stack>
                </Paper>
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

                        {reminderSettingsLoading ? (
                            <p className="text-muted">{t('notifications:attendance.loadingSettings')}</p>
                        ) : (
                            <p className="text-muted" style={{ marginTop: '0.75rem' }}>
                                {reminderSettings.enabled
                                    ? t('notifications:attendance.configEnabled', { minutes: reminderSettings.delayMinutes })
                                    : t('notifications:attendance.configDisabled')}
                            </p>
                        )}

                        <div className="quick-send-buttons">
                            <button
                                className="quick-send-btn"
                                onClick={handleQuickSend}
                                disabled={quickSending || reminderSettingsLoading || !reminderSettings.enabled}
                            >
                                <HiOutlinePaperAirplane size={16} />
                                <span>{t('notifications:attendance.sendNow')}</span>
                            </button>
                        </div>

                        {quickSending && (
                            <div className="quick-sending-indicator">
                                <div className="spinner" style={{ width: 20, height: 20 }}></div>
                                <span>{t('notifications:attendance.sending')}</span>
                            </div>
                        )}

                        {!reminderSettingsLoading && !reminderSettings.enabled && (
                            <p className="text-muted">{t('notifications:attendance.disabledHint')}</p>
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

            <Dialog
                open={gmailCleanupDialogOpen}
                onClose={() => {
                    if (!gmailCleanupMoving) {
                        setGmailCleanupDialogOpen(false);
                        setGmailCleanupConfirmation('');
                    }
                }}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle>{t('notifications:gmailCleanup.confirmTrashTitle')}</DialogTitle>
                <DialogContent>
                    <Stack spacing={2} sx={{ pt: 1 }}>
                        <Alert severity="warning">{t('notifications:gmailCleanup.trashWarning')}</Alert>
                        <Box>
                            {t('notifications:gmailCleanup.confirmTrashDetails', {
                                count: gmailCleanupPreview?.count || 0,
                                email: gmailCleanupPreview?.accountEmail || '',
                                source: t(gmailCleanupPreview?.source === 'all_sent'
                                    ? 'notifications:gmailCleanup.sourceAll'
                                    : 'notifications:gmailCleanup.sourceApp'),
                                period: t(`notifications:gmailCleanup.${{
                                    today: 'today',
                                    this_week: 'thisWeek',
                                    this_month: 'thisMonth',
                                    all_time: 'allTime'
                                }[gmailCleanupPreview?.period]}`),
                                window: getCleanupConfirmationWindow(gmailCleanupPreview)
                            })}
                        </Box>
                        <TextField
                            autoFocus
                            label={t('notifications:gmailCleanup.confirmTrashInputLabel')}
                            value={gmailCleanupConfirmation}
                            onChange={(event) => setGmailCleanupConfirmation(event.target.value)}
                            helperText={t('notifications:gmailCleanup.confirmTrashInputHelp')}
                            autoComplete="off"
                        />
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button
                        onClick={() => {
                            setGmailCleanupDialogOpen(false);
                            setGmailCleanupConfirmation('');
                        }}
                        disabled={gmailCleanupMoving}
                    >
                        {t('notifications:gmailCleanup.cancel')}
                    </Button>
                    <Button
                        color="error"
                        variant="contained"
                        onClick={handleGmailCleanupTrash}
                        disabled={gmailCleanupMoving || gmailCleanupConfirmation !== 'TRASH'}
                        startIcon={gmailCleanupMoving ? <CircularProgress size={16} color="inherit" /> : <HiOutlineTrash />}
                    >
                        {gmailCleanupMoving
                            ? t('notifications:gmailCleanup.movingToTrash')
                            : t('notifications:gmailCleanup.confirmTrash')}
                    </Button>
                </DialogActions>
            </Dialog>

        </div>
    );
};

export default NotificationsPage;
