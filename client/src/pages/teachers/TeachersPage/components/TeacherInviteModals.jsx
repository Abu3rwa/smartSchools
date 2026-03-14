import React from 'react';
import {
    HiOutlineClipboardCopy,
    HiOutlineDownload,
    HiOutlineExclamationCircle,
    HiOutlineMail
} from 'react-icons/hi';
import { useTranslation } from 'react-i18next';

export const TeacherInviteModal = ({
    open,
    inviteResult,
    onClose,
    copyToClipboard
}) => {
    const { t } = useTranslation(['teachers', 'common']);

    if (!open || !inviteResult) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={(event) => event.stopPropagation()} style={{ maxWidth: 520 }}>
                <div className="modal-header">
                    <h3>{t('teachers:credentials.singleTitle')}</h3>
                    <button className="modal-close" onClick={onClose}>&times;</button>
                </div>
                <div className="modal-body">
                    <div className="credentials-card">
                        <p className="credentials-warning">
                            <HiOutlineExclamationCircle size={18} />
                            <strong>{t('teachers:credentials.copyNow')}</strong> {t('teachers:credentials.passwordCannotBeViewedAgain')}
                        </p>

                        <div className="credentials-row">
                            <label>{t('teachers:table.columns.name')}</label>
                            <span>{inviteResult.teacherName}</span>
                        </div>

                        <div className="credentials-row">
                            <label>{t('teachers:table.columns.email')}</label>
                            <div className="credentials-value">
                                <code>{inviteResult.email}</code>
                                <button
                                    className="btn-icon"
                                    onClick={() => copyToClipboard(inviteResult.email)}
                                    title={t('teachers:actions.copyEmail')}
                                >
                                    <HiOutlineClipboardCopy size={16} />
                                </button>
                            </div>
                        </div>

                        <div className="credentials-row">
                            <label>{t('teachers:credentials.password')}</label>
                            <div className="credentials-value">
                                <code className="password-display">{inviteResult.tempPassword}</code>
                                <button
                                    className="btn-icon"
                                    onClick={() => copyToClipboard(inviteResult.tempPassword)}
                                    title={t('teachers:actions.copyPassword')}
                                >
                                    <HiOutlineClipboardCopy size={16} />
                                </button>
                            </div>
                        </div>

                        <div className="credentials-row">
                            <label>{t('teachers:table.columns.invite')}</label>
                            <span className={`badge badge-${inviteResult.emailSent ? 'success' : 'warning'}`}>
                                {inviteResult.emailSent
                                    ? t('teachers:invite.status.sent')
                                    : t('teachers:invite.status.failed')}
                            </span>
                        </div>

                        {inviteResult.error && (
                            <div className="import-errors mt-md">
                                <h4><HiOutlineExclamationCircle /> {t('teachers:credentials.deliveryIssue')}</h4>
                                <ul>
                                    <li>{inviteResult.error}</li>
                                </ul>
                            </div>
                        )}

                        <button
                            className="btn btn-outline btn-sm mt-md"
                            onClick={() => {
                                const text = [
                                    `${t('teachers:table.columns.name')}: ${inviteResult.teacherName}`,
                                    `${t('teachers:table.columns.email')}: ${inviteResult.email}`,
                                    `${t('teachers:credentials.password')}: ${inviteResult.tempPassword}`
                                ].join('\n');
                                copyToClipboard(text);
                            }}
                        >
                            <HiOutlineClipboardCopy size={16} />
                            {t('teachers:actions.copyAll')}
                        </button>
                    </div>
                </div>
                <div className="modal-footer">
                    <button className="btn btn-primary" onClick={onClose}>
                        {t('common:actions.done')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export const BulkTeacherInviteModal = ({
    open,
    inviteResults,
    onClose,
    downloadCsv,
    copyAll
}) => {
    const { t } = useTranslation(['teachers', 'common']);

    if (!open || !inviteResults) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal modal-lg" onClick={(event) => event.stopPropagation()} style={{ maxWidth: 620 }}>
                <div className="modal-header">
                    <h3>{t('teachers:credentials.bulkTitle')}</h3>
                    <button className="modal-close" onClick={onClose}>&times;</button>
                </div>
                <div className="modal-body">
                    <div className="credentials-card">
                        <p className="credentials-warning">
                            <HiOutlineExclamationCircle size={18} />
                            <strong>{t('teachers:credentials.copyOrDownloadNow')}</strong> {t('teachers:credentials.passwordsCannotBeViewedAgain')}
                        </p>

                        {inviteResults.created?.length > 0 && (
                            <>
                                <div className="table-container" style={{ maxHeight: 300, overflow: 'auto', marginBottom: '1rem' }}>
                                    <table>
                                        <thead>
                                            <tr>
                                                <th>{t('teachers:table.columns.name')}</th>
                                                <th>{t('teachers:table.columns.email')}</th>
                                                <th>{t('teachers:credentials.password')}</th>
                                                <th>{t('teachers:table.columns.invite')}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {inviteResults.created.map((item) => (
                                                <tr key={item.teacherId}>
                                                    <td>{item.name}</td>
                                                    <td><code className="font-mono text-sm">{item.email}</code></td>
                                                    <td><code className="password-display font-mono text-sm">{item.tempPassword}</code></td>
                                                    <td>
                                                        <span className={`badge badge-${item.emailSent ? 'success' : 'warning'}`}>
                                                            {item.emailSent
                                                                ? t('teachers:invite.status.sent')
                                                                : t('teachers:invite.status.failed')}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                <div className="bulk-credentials-actions">
                                    <button type="button" className="btn btn-outline btn-sm" onClick={downloadCsv}>
                                        <HiOutlineDownload size={16} />
                                        {t('teachers:actions.downloadCsv')}
                                    </button>
                                    <button type="button" className="btn btn-outline btn-sm" onClick={copyAll}>
                                        <HiOutlineClipboardCopy size={16} />
                                        {t('teachers:actions.copyAll')}
                                    </button>
                                </div>
                            </>
                        )}

                        {inviteResults.errors?.length > 0 && (
                            <div className="import-errors mt-md">
                                <h4><HiOutlineExclamationCircle /> {t('teachers:credentials.issues')}</h4>
                                <ul>
                                    {inviteResults.errors.map((error, index) => (
                                        <li key={`${error.teacherId || 'unknown'}-${index}`}>
                                            {(error.name || error.email) ? `${error.name || error.email}: ` : ''}
                                            {error.error}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {inviteResults.created?.some((item) => item.emailSent) && (
                            <p className="credentials-help mt-md">
                                <HiOutlineMail size={16} />
                                {t('teachers:credentials.emailDeliveredHint')}
                            </p>
                        )}
                    </div>
                </div>
                <div className="modal-footer">
                    <button className="btn btn-primary" onClick={onClose}>
                        {t('common:actions.done')}
                    </button>
                </div>
            </div>
        </div>
    );
};
