import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import {
    HiOutlineAcademicCap,
    HiOutlineCloudUpload,
    HiOutlineDocumentText,
    HiOutlineFolder,
    HiOutlineKey,
    HiOutlineMail,
    HiOutlineRefresh
} from 'react-icons/hi';
import api from '../../../../config/api';
import googleClassroomService from '../../../../services/googleClassroomService';
import assignmentService from '../../../../services/assignmentService';
import curriculumService from '../../../../services/curriculumService';
import { driveUploadErrorMessage } from '../../../assignments/AssignmentsPage/utils/driveAttachmentErrors';
import useGoogleConnections from '../hooks/useGoogleConnections';
import { CONNECTION_STATE, summarizeSuite } from '../utils/googleConnectionPresentation';

const SUITE_FLAGS = {
    connected: ['gmail_connected', 'classroom_connected', 'google_forms_connected'],
    error: ['gmail_error', 'classroom_error', 'google_forms_error']
};
const DRIVE_FLAGS = { connected: ['drive_connected'], error: ['drive_error'] };
const ALL_FLAGS = [
    ...SUITE_FLAGS.connected,
    ...SUITE_FLAGS.error,
    ...DRIVE_FLAGS.connected,
    ...DRIVE_FLAGS.error
];

const ROW_META = {
    gmail: { icon: HiOutlineMail, nameKey: 'gmailName', hintKey: 'gmailHint' },
    classroom: { icon: HiOutlineAcademicCap, nameKey: 'classroomName', hintKey: 'classroomHint' },
    forms: { icon: HiOutlineDocumentText, nameKey: 'formsName', hintKey: 'formsHint' }
};

const STATUS_TONE = {
    [CONNECTION_STATE.CONNECTED]: 'ok',
    [CONNECTION_STATE.EXPIRED]: 'warn',
    [CONNECTION_STATE.UNAVAILABLE]: 'muted',
    [CONNECTION_STATE.ERROR]: 'error'
};

const GoogleConnectionsCard = () => {
    const { t } = useTranslation(['settings', 'assignments']);
    const { rows, loading, refresh } = useGoogleConnections();
    const [searchParams, setSearchParams] = useSearchParams();
    const [busy, setBusy] = useState('');
    const [confirmDisconnect, setConfirmDisconnect] = useState('');
    const [testState, setTestState] = useState({ running: false, result: null });

    const statusText = useCallback((row) => {
        switch (row?.state) {
            case CONNECTION_STATE.CONNECTED:
                return t('settings:googleConnections.connectedAs', { email: row.email || '' });
            case CONNECTION_STATE.EXPIRED:
                return t('settings:googleConnections.expired');
            case CONNECTION_STATE.UNAVAILABLE:
                return t('settings:googleConnections.unavailable');
            case CONNECTION_STATE.ERROR:
                return t('settings:googleConnections.checkFailed');
            case CONNECTION_STATE.LOADING:
                return t('settings:googleConnections.checking');
            default:
                return t('settings:googleConnections.notConnected');
        }
    }, [t]);

    useEffect(() => {
        const connected = ALL_FLAGS.filter((flag) => searchParams.get(flag) === 'true');
        const failed = ALL_FLAGS.find((flag) =>
            [...SUITE_FLAGS.error, ...DRIVE_FLAGS.error].includes(flag) && searchParams.get(flag));
        if (!connected.length && !failed) return;

        if (failed) {
            const code = searchParams.get(failed);
            const known = ['missing_scope', 'invalid_state', 'missing_parameters', 'not_available', 'consent_denied'];
            toast.error(known.includes(code)
                ? t(`settings:googleConnections.errors.${code}`)
                : t('settings:googleConnections.errors.generic'));
        } else {
            const driveOnly = connected.every((flag) => DRIVE_FLAGS.connected.includes(flag));
            toast.success(driveOnly
                ? t('settings:googleConnections.driveConnected')
                : t('settings:googleConnections.suiteConnected'));
        }

        const next = new URLSearchParams(searchParams);
        ALL_FLAGS.forEach((flag) => next.delete(flag));
        setSearchParams(next, { replace: true });
        refresh();
    }, [refresh, searchParams, setSearchParams, t]);

    const leaveForGoogle = async (label, start) => {
        setBusy(label);
        try {
            const authUrl = await start();
            if (!authUrl) throw new Error('missing_auth_url');
            window.location.assign(authUrl);
        } catch (error) {
            toast.error(error.response?.data?.message || t('settings:googleConnections.errors.generic'));
            setBusy('');
        }
    };

    const connectSuite = () => leaveForGoogle('suite', async () => {
        // The Gmail consent already asks for the whole Google suite and its
        // callback stores Gmail, Classroom and Forms tokens together.
        const response = await api.get('/auth/gmail/url', { params: { returnTo: 'settings' } });
        return response?.data?.authUrl;
    });

    const connectDrive = (kind) => leaveForGoogle(kind, async () => {
        const response = kind === 'driveCurriculum'
            ? await curriculumService.getGoogleDriveAuthUrl('settings')
            : await assignmentService.getDriveAuthUrl('settings');
        return response?.authUrl;
    });

    const disconnect = async (kind) => {
        setBusy(kind);
        try {
            if (kind === 'suite') await googleClassroomService.disconnect();
            else if (kind === 'driveCurriculum') await curriculumService.disconnectGoogleDrive();
            else await assignmentService.disconnectDriveConnection();
            toast.success(t('settings:googleConnections.disconnectedToast'));
            await refresh();
        } catch (error) {
            toast.error(error.response?.data?.message || t('settings:googleConnections.errors.generic'));
        } finally {
            setBusy('');
            setConfirmDisconnect('');
            setTestState({ running: false, result: null });
        }
    };

    const runAttachmentTest = async () => {
        setTestState({ running: true, result: null });
        try {
            const result = await assignmentService.testDriveConnection();
            if (!result?.upload) {
                setTestState({ running: false, result: { tone: 'error', text: t('assignments:driveAttachments.testUploadBlocked', { reason: result?.uploadReason || '' }) } });
            } else if (!result?.share) {
                setTestState({ running: false, result: { tone: 'error', text: t('assignments:driveAttachments.testShareBlocked', { reason: result?.shareReason || '' }) } });
            } else {
                setTestState({ running: false, result: { tone: 'ok', text: t('assignments:driveAttachments.testOk') } });
            }
        } catch (error) {
            const data = error.response?.data;
            if (data?.code === 'DRIVE_FILE_NOT_CONNECTED') {
                setTestState({ running: false, result: { tone: 'error', text: t('assignments:driveAttachments.testExpired') } });
            } else {
                setTestState({ running: false, result: { tone: 'error', text: driveUploadErrorMessage(t, error) } });
            }
        }
    };

    const suiteRows = ['gmail', 'classroom', 'forms'].map((key) => ({ key, ...rows[key] }));
    const { connected: suiteConnected, email: suiteEmail, unavailable: suiteUnavailable } = summarizeSuite(suiteRows);

    const renderDisconnectActions = (kind, label) => (
        confirmDisconnect === kind ? (
            <div className="google-connections-confirm" role="group" aria-label={label}>
                <span>{t(kind === 'suite'
                    ? 'settings:googleConnections.confirmSuite'
                    : 'settings:googleConnections.confirmDrive')}</span>
                <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={() => disconnect(kind)}
                    disabled={busy === kind}
                >
                    {busy === kind ? t('settings:googleConnections.disconnecting') : t('settings:googleConnections.confirmYes')}
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmDisconnect('')}>
                    {t('settings:googleConnections.confirmNo')}
                </button>
            </div>
        ) : (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmDisconnect(kind)}>
                {t('settings:googleConnections.disconnect')}
            </button>
        )
    );

    const renderStatus = (row, { short = false } = {}) => (
        <span className={`google-connections-status google-connections-status--${STATUS_TONE[row.state] || 'muted'}`}>
            {row.state === CONNECTION_STATE.CONNECTED && <span className="google-connections-dot" aria-hidden="true" />}
            {short && row.state === CONNECTION_STATE.CONNECTED
                ? t('settings:googleConnections.connectedShort')
                : statusText(row)}
        </span>
    );

    return (
        <section className="card settings-card google-connections-card" aria-labelledby="google-connections-title">
            <div className="card-header">
                <h3 className="card-title" id="google-connections-title">
                    <HiOutlineKey /> {t('settings:googleConnections.title')}
                </h3>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => refresh()} disabled={loading}>
                    <HiOutlineRefresh /> {t('settings:googleConnections.refresh')}
                </button>
            </div>
            <p className="google-connections-intro">{t('settings:googleConnections.intro')}</p>

            <div className="google-connections-group">
                <div className="google-connections-group-head">
                    <div>
                        <h4>{t('settings:googleConnections.suiteTitle')}</h4>
                        <p className="google-connections-hint">{t('settings:googleConnections.suiteHint')}</p>
                    </div>
                    {suiteConnected && (
                        <span className="google-connections-account">{t('settings:googleConnections.connectedAs', { email: suiteEmail })}</span>
                    )}
                </div>

                <ul className="google-connections-list">
                    {suiteRows.map((row) => {
                        const meta = ROW_META[row.key];
                        const Icon = meta.icon;
                        return (
                            <li key={row.key} className="google-connections-row">
                                <span className="google-connections-icon" aria-hidden="true"><Icon /></span>
                                <span className="google-connections-name">
                                    {t(`settings:googleConnections.${meta.nameKey}`)}
                                    <span className="google-connections-desc">{t(`settings:googleConnections.${meta.hintKey}`)}</span>
                                </span>
                                {row.state === CONNECTION_STATE.LOADING
                                    ? <span className="google-connections-status google-connections-status--muted">{t('settings:googleConnections.checking')}</span>
                                    : renderStatus(row, { short: true })}
                            </li>
                        );
                    })}
                </ul>

                <div className="google-connections-actions">
                    {suiteUnavailable ? null : suiteConnected ? (
                        <>
                            <button type="button" className="btn btn-secondary btn-sm" onClick={connectSuite} disabled={Boolean(busy)}>
                                {t('settings:googleConnections.reconnect')}
                            </button>
                            {renderDisconnectActions('suite', t('settings:googleConnections.suiteTitle'))}
                        </>
                    ) : (
                        <button type="button" className="btn btn-primary btn-sm" onClick={connectSuite} disabled={Boolean(busy)}>
                            {busy === 'suite' ? t('settings:googleConnections.opening') : t('settings:googleConnections.connect')}
                        </button>
                    )}
                </div>
            </div>

            <div className="google-connections-group">
                <div className="google-connections-group-head">
                    <div>
                        <h4>{t('settings:googleConnections.driveTitle')}</h4>
                        <p className="google-connections-hint">{t('settings:googleConnections.driveHint')}</p>
                    </div>
                </div>

                <ul className="google-connections-list">
                    {[
                        { key: 'driveCurriculum', icon: HiOutlineFolder, nameKey: 'driveCurriculumName', hintKey: 'driveCurriculumHint' },
                        { key: 'driveAttachments', icon: HiOutlineCloudUpload, nameKey: 'driveAttachmentsName', hintKey: 'driveAttachmentsHint' }
                    ].map(({ key, icon: Icon, nameKey, hintKey }) => {
                        const row = rows[key];
                        const connected = row.state === CONNECTION_STATE.CONNECTED;
                        return (
                            <li key={key} className="google-connections-row google-connections-row--stacked">
                                <span className="google-connections-icon" aria-hidden="true"><Icon /></span>
                                <span className="google-connections-name">
                                    {t(`settings:googleConnections.${nameKey}`)}
                                    <span className="google-connections-desc">{t(`settings:googleConnections.${hintKey}`)}</span>
                                </span>
                                <div className="google-connections-row-end">
                                    {renderStatus(row)}
                                    <div className="google-connections-actions">
                                        <button
                                            type="button"
                                            className={connected ? 'btn btn-secondary btn-sm' : 'btn btn-primary btn-sm'}
                                            onClick={() => connectDrive(key)}
                                            disabled={Boolean(busy)}
                                        >
                                            {busy === key
                                                ? t('settings:googleConnections.opening')
                                                : t(connected ? 'settings:googleConnections.reconnect' : 'settings:googleConnections.connect')}
                                        </button>
                                        {connected && renderDisconnectActions(key, t(`settings:googleConnections.${nameKey}`))}
                                        {connected && key === 'driveAttachments' && (
                                            <button
                                                type="button"
                                                className="btn btn-ghost btn-sm"
                                                onClick={runAttachmentTest}
                                                disabled={testState.running || Boolean(busy)}
                                            >
                                                {testState.running
                                                    ? t('assignments:driveAttachments.testing')
                                                    : t('assignments:driveAttachments.testConnection')}
                                            </button>
                                        )}
                                    </div>
                                </div>
                                {key === 'driveAttachments' && connected && (
                                    <p className="google-connections-note">{t('assignments:driveAttachments.anyoneWithLink')}</p>
                                )}
                                {key === 'driveAttachments' && testState.result && (
                                    <p
                                        className={`google-connections-test google-connections-test--${testState.result.tone}`}
                                        role="status"
                                    >
                                        {testState.result.text}
                                    </p>
                                )}
                            </li>
                        );
                    })}
                </ul>
            </div>
        </section>
    );
};

export default GoogleConnectionsCard;
