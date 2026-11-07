import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
    HiOutlineCloudUpload,
    HiOutlineExternalLink,
    HiOutlinePlus,
    HiOutlineX
} from 'react-icons/hi';
import { useTranslation } from 'react-i18next';
import assignmentService from '../../../../services/assignmentService';

const ACCEPT = '.pdf,.docx,.pptx,.xlsx,.jpg,.jpeg,.png,.webp,.gif';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/**
 * Separate from the Firebase "Add File" and "Add Link" editors: files here go
 * to the teacher's own Google Drive (drive.file connection) and become real
 * Classroom driveFile materials when the assignment is posted.
 */
const DriveAttachmentEditor = ({
    assignmentId = null,
    driveAttachments = [],
    onChange,
    onPersisted,
    disabled,
    postedToClassroom
}) => {
    const { t } = useTranslation(['assignments']);
    const fileInputRef = useRef(null);
    const [connection, setConnection] = useState(null);
    const [connecting, setConnecting] = useState(false);
    const [busy, setBusy] = useState(false);

    const loadConnection = useCallback(() => {
        let active = true;
        setConnection(null);
        assignmentService.getDriveConnection()
            .then((response) => {
                if (active) setConnection({ connected: Boolean(response?.connected), email: response?.email || '' });
            })
            .catch(() => {
                if (active) setConnection({ error: true });
            });
        return () => { active = false; };
    }, []);

    useEffect(() => loadConnection(), [loadConnection]);

    const connect = async () => {
        setConnecting(true);
        try {
            const response = await assignmentService.getDriveAuthUrl();
            window.location.assign(response.authUrl);
        } catch {
            toast.error(t('assignments:driveAttachments.connectFailed'));
            setConnecting(false);
        }
    };

    const handleFileSelect = async (event) => {
        const selected = Array.from(event.target.files || []);
        event.target.value = '';
        if (selected.length === 0) return;
        const valid = selected.filter((file) => file.size <= MAX_FILE_SIZE);
        if (valid.length < selected.length) {
            toast.error(t('assignments:driveAttachments.tooLarge'));
        }
        if (valid.length === 0 || !assignmentId) return;

        setBusy(true);
        try {
            const response = await assignmentService.uploadDriveAttachments(assignmentId, valid);
            onChange(response?.data?.driveAttachments || []);
            onPersisted?.();
            toast.success(t('assignments:driveAttachments.uploaded'));
        } catch (error) {
            toast.error(error.response?.data?.message || t('assignments:driveAttachments.uploadFailed'));
        } finally {
            setBusy(false);
        }
    };

    const handleRemove = async (fileId) => {
        setBusy(true);
        try {
            const response = await assignmentService.deleteDriveAttachment(assignmentId, fileId);
            onChange(response?.data?.driveAttachments || []);
            onPersisted?.();
        } catch (error) {
            toast.error(error.response?.data?.message || t('assignments:driveAttachments.removeFailed'));
        } finally {
            setBusy(false);
        }
    };

    const controlsDisabled = disabled || busy;

    return (
        <div className="attachment-editor drive-attachment-editor">
            <label className="attachment-editor-label">
                <HiOutlineCloudUpload />
                {t('assignments:driveAttachments.title')}
            </label>

            {connection === null && (
                <p className="text-muted">{t('assignments:driveAttachments.loading')}</p>
            )}

            {connection?.error && (
                <div className="assignments-drawer__notice">
                    <span>{t('assignments:driveAttachments.loadFailed')}</span>
                    <button type="button" className="btn btn-sm btn-outline" onClick={loadConnection}>
                        {t('assignments:driveAttachments.retry')}
                    </button>
                </div>
            )}

            {connection && !connection.error && !connection.connected && (
                <div className="assignments-drawer__notice">
                    <span>{t('assignments:driveAttachments.intro')}</span>
                    <button
                        type="button"
                        className="btn btn-sm btn-secondary"
                        disabled={connecting || disabled}
                        onClick={connect}
                    >
                        {connecting
                            ? t('assignments:driveAttachments.connecting')
                            : t('assignments:driveAttachments.connect')}
                    </button>
                </div>
            )}

            {connection?.connected && (
                <>
                    {connection.email && (
                        <p className="text-muted">
                            {t('assignments:driveAttachments.connectedAs', { email: connection.email })}
                        </p>
                    )}
                    <p className="text-muted">{t('assignments:driveAttachments.anyoneWithLink')}</p>

                    {postedToClassroom && (
                        <p className="assignments-drawer__notice">
                            {t('assignments:driveAttachments.postedWarning')}
                        </p>
                    )}

                    {driveAttachments.length > 0 && (
                        <div className="attachment-chips">
                            {driveAttachments.map((att) => (
                                <div key={att.fileId} className="attachment-chip existing">
                                    <span className="attachment-chip-name">{att.fileName || att.fileId}</span>
                                    <span className="attachment-chip-size">{formatSize(att.size || 0)}</span>
                                    {att.webViewLink && (
                                        <a
                                            href={att.webViewLink}
                                            target="_blank"
                                            rel="noreferrer"
                                            aria-label={t('assignments:driveAttachments.openInDrive')}
                                            title={t('assignments:driveAttachments.openInDrive')}
                                        >
                                            <HiOutlineExternalLink />
                                        </a>
                                    )}
                                    {!controlsDisabled && (
                                        <button
                                            type="button"
                                            className="attachment-chip-remove"
                                            onClick={() => handleRemove(att.fileId)}
                                            aria-label={t('assignments:driveAttachments.remove', { name: att.fileName || att.fileId })}
                                        >
                                            <HiOutlineX />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {!assignmentId ? (
                        <p className="assignments-drawer__notice">
                            {t('assignments:driveAttachments.saveFirst')}
                        </p>
                    ) : (
                        <>
                            <input
                                ref={fileInputRef}
                                type="file"
                                multiple
                                accept={ACCEPT}
                                onChange={handleFileSelect}
                                style={{ display: 'none' }}
                            />
                            <button
                                type="button"
                                className="btn btn-sm btn-outline add-attachment-btn"
                                disabled={controlsDisabled}
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <HiOutlinePlus />
                                {busy
                                    ? t('assignments:driveAttachments.uploading')
                                    : t('assignments:driveAttachments.upload')}
                            </button>
                        </>
                    )}
                </>
            )}
        </div>
    );
};

export default DriveAttachmentEditor;