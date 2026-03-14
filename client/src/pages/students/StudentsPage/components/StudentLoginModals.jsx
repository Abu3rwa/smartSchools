import React from 'react';
import {
    HiOutlineExclamationCircle,
    HiOutlineClipboardCopy,
    HiOutlineDownload
} from 'react-icons/hi';
import { useTranslation } from 'react-i18next';

export const CredentialsModal = ({
    showCredentials,
    setShowCredentials,
    credentials,
    copyToClipboard
}) => {
    const { t } = useTranslation(['students']);
    if (!showCredentials || !credentials) return null;

    return (
        <div className="modal-overlay" onClick={() => setShowCredentials(false)}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
                <div className="modal-header">
                    <h3>{t('students:credentials.studentLoginTitle')}</h3>
                    <button className="modal-close" onClick={() => setShowCredentials(false)}>&times;</button>
                </div>
                <div className="modal-body">
                    <div className="credentials-card">
                        <p className="credentials-warning">
                            <HiOutlineExclamationCircle size={18} />
                            <strong>{t('students:credentials.copyNow')}</strong> {t('students:credentials.passwordCannotBeViewedAgain')}
                        </p>
                        <div className="credentials-row">
                            <label>{t('students:table.columns.student')}</label>
                            <span>{credentials.studentName}</span>
                        </div>
                        <div className="credentials-row">
                            <label>{t('students:table.columns.email')}</label>
                            <div className="credentials-value">
                                <code>{credentials.email}</code>
                                <button className="btn-icon" onClick={() => copyToClipboard(credentials.email)} title={t('students:actions.copyEmail')}>
                                    <HiOutlineClipboardCopy size={16} />
                                </button>
                            </div>
                        </div>
                    <div className="credentials-row">
                        <label>{t('students:credentials.password')}</label>
                        <div className="credentials-value">
                            <code className="password-display">{credentials.tempPassword}</code>
                                <button className="btn-icon" onClick={() => copyToClipboard(credentials.tempPassword)} title={t('students:actions.copyPassword')}>
                                    <HiOutlineClipboardCopy size={16} />
                                </button>
                            </div>
                        </div>
                        <div className="credentials-row">
                            <label>{t('students:table.columns.invite')}</label>
                            <span className={`badge badge-${credentials.emailSent ? 'success' : 'warning'}`}>
                                {credentials.emailSent
                                    ? t('students:invite.status.sent')
                                    : t('students:invite.status.failed')}
                            </span>
                        </div>
                        {credentials.error && (
                            <div className="import-errors mt-md">
                                <h4><HiOutlineExclamationCircle /> {t('students:credentials.deliveryIssue')}</h4>
                                <ul>
                                    <li>{credentials.error}</li>
                                </ul>
                            </div>
                        )}
                        <button
                            className="btn btn-outline btn-sm mt-md"
                            onClick={() => {
                                const text = `${t('students:table.columns.student')}: ${credentials.studentName}\n${t('students:table.columns.email')}: ${credentials.email}\n${t('students:credentials.password')}: ${credentials.tempPassword}`;
                                copyToClipboard(text);
                            }}
                        >
                            <HiOutlineClipboardCopy size={16} />
                            {t('students:actions.copyAll')}
                        </button>
                    </div>
                </div>
                <div className="modal-footer">
                    <button className="btn btn-primary" onClick={() => setShowCredentials(false)}>
                        {t('common:actions.done')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export const BulkCredentialsModal = ({
    showBulkCredentials,
    setShowBulkCredentials,
    bulkCredentials,
    setBulkCredentials,
    downloadBulkCredentialsCSV,
    copyAllBulkCredentials
}) => {
    const { t } = useTranslation(['students']);
    if (!showBulkCredentials || !bulkCredentials) return null;

    return (
        <div className="modal-overlay" onClick={() => { setShowBulkCredentials(false); setBulkCredentials(null); }}>
            <div className="modal modal-lg" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
                <div className="modal-header">
                    <h3>{t('students:credentials.bulkLoginTitle')}</h3>
                    <button className="modal-close" onClick={() => { setShowBulkCredentials(false); setBulkCredentials(null); }}>&times;</button>
                </div>
                <div className="modal-body">
                    <div className="credentials-card">
                        <p className="credentials-warning">
                            <HiOutlineExclamationCircle size={18} />
                            <strong>{t('students:credentials.copyOrDownloadNow')}</strong> {t('students:credentials.passwordsCannotBeViewedAgain')}
                        </p>
                        {bulkCredentials.created?.length > 0 && (
                            <>
                                <div className="table-container" style={{ maxHeight: 280, overflow: 'auto', marginBottom: '1rem' }}>
                                    <table>
                                        <thead>
                                            <tr>
                                                <th>{t('students:table.columns.student')}</th>
                                                <th>{t('students:table.columns.email')}</th>
                                                <th>{t('students:credentials.password')}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {bulkCredentials.created.map((c, i) => (
                                                <tr key={c.studentId || i}>
                                                    <td>{c.name}</td>
                                                    <td><code className="font-mono text-sm">{c.email}</code></td>
                                                    <td><code className="password-display font-mono text-sm">{c.tempPassword}</code></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <div className="bulk-credentials-actions">
                                    <button type="button" className="btn btn-outline btn-sm" onClick={downloadBulkCredentialsCSV}>
                                        <HiOutlineDownload size={16} />
                                        {t('students:actions.downloadCsv')}
                                    </button>
                                    <button type="button" className="btn btn-outline btn-sm" onClick={copyAllBulkCredentials}>
                                        <HiOutlineClipboardCopy size={16} />
                                        {t('students:actions.copyAll')}
                                    </button>
                                </div>
                            </>
                        )}
                        {bulkCredentials.errors?.length > 0 && (
                            <div className="import-errors mt-md">
                                <h4><HiOutlineExclamationCircle /> {t('students:credentials.issues')}</h4>
                                <ul>
                                    {bulkCredentials.errors.map((err, i) => (
                                        <li key={i}>
                                            {err.name ? `${err.name}: ` : ''}{err.error}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                </div>
                <div className="modal-footer">
                    <button className="btn btn-primary" onClick={() => { setShowBulkCredentials(false); setBulkCredentials(null); }}>
                        {t('common:actions.done')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export const ParentCredentialsModal = ({
    showParentCredentialsResult,
    setShowParentCredentialsResult,
    parentCredentialsResult,
    setParentCredentialsResult,
    copyAllParentCredentials
}) => {
    const { t } = useTranslation(['students']);
    if (!showParentCredentialsResult || !parentCredentialsResult) return null;

    return (
        <div className="modal-overlay" onClick={() => { setShowParentCredentialsResult(false); setParentCredentialsResult(null); }}>
            <div className="modal modal-lg" onClick={e => e.stopPropagation()} style={{ maxWidth: 620 }}>
                <div className="modal-header">
                    <h3>{t('students:credentials.parentInviteTitle')}</h3>
                    <button className="modal-close" onClick={() => { setShowParentCredentialsResult(false); setParentCredentialsResult(null); }}>&times;</button>
                </div>
                <div className="modal-body">
                    <div className="credentials-card">
                        <p className="credentials-warning">
                            <HiOutlineExclamationCircle size={18} />
                            <strong>{t('students:credentials.emailed')}</strong> {t('students:credentials.copyForManualShare')}
                        </p>
                        <div className="credentials-row">
                            <label>{t('students:table.columns.student')}</label>
                            <span>{parentCredentialsResult.studentName}</span>
                        </div>
                        {parentCredentialsResult.sent?.length > 0 && (
                            <>
                                <div className="table-container" style={{ maxHeight: 260, overflow: 'auto', marginTop: '0.75rem' }}>
                                    <table>
                                        <thead>
                                            <tr>
                                                <th>{t('students:credentials.contact')}</th>
                                                <th>{t('students:table.columns.email')}</th>
                                                <th>{t('students:credentials.password')}</th>
                                                <th>{t('students:table.columns.status')}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {parentCredentialsResult.sent.map((item, index) => (
                                                <tr key={`${item.email}-${index}`}>
                                                    <td>{item.relation}</td>
                                                    <td><code className="font-mono text-sm">{item.email}</code></td>
                                                    <td><code className="password-display font-mono text-sm">{item.tempPassword}</code></td>
                                                    <td>
                                                        <span className={`badge badge-${item.emailSent ? 'success' : 'warning'}`}>
                                                            {item.emailSent ? t('students:credentials.emailedStatus') : t('students:credentials.createdOnly')}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <div className="bulk-credentials-actions mt-md">
                                    <button type="button" className="btn btn-outline btn-sm" onClick={copyAllParentCredentials}>
                                        <HiOutlineClipboardCopy size={16} />
                                        {t('students:actions.copyAll')}
                                    </button>
                                </div>
                            </>
                        )}
                        {parentCredentialsResult.errors?.length > 0 && (
                            <div className="import-errors mt-md">
                                <h4><HiOutlineExclamationCircle /> {t('students:credentials.issues')}</h4>
                                <ul>
                                    {parentCredentialsResult.errors.map((err, index) => (
                                        <li key={`${err.email || 'unknown'}-${index}`}>
                                            {(err.relation || err.name) ? `${err.relation || err.name}: ` : ''}{err.error}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                </div>
                <div className="modal-footer">
                    <button className="btn btn-primary" onClick={() => { setShowParentCredentialsResult(false); setParentCredentialsResult(null); }}>
                        {t('common:actions.done')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export const EmailPromptModal = ({
    showLoginEmailPrompt,
    setShowLoginEmailPrompt,
    loginTargetStudent,
    loginEmail,
    setLoginEmail,
    doCreateLogin
}) => {
    const { t } = useTranslation(['students']);
    if (!showLoginEmailPrompt || !loginTargetStudent) return null;

    return (
        <div className="modal-overlay" onClick={() => setShowLoginEmailPrompt(false)}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
                <div className="modal-header">
                    <h3>{t('students:credentials.enterEmailForInvite')}</h3>
                    <button className="modal-close" onClick={() => setShowLoginEmailPrompt(false)}>&times;</button>
                </div>
                <form onSubmit={(e) => { e.preventDefault(); doCreateLogin(loginTargetStudent, loginEmail); }}>
                    <div className="modal-body">
                        <p className="text-muted">
                            <strong>{loginTargetStudent.firstName} {loginTargetStudent.lastName}</strong>{' '}
                            {t('students:credentials.studentHasNoEmail')}
                        </p>
                        <div className="form-group">
                            <label>{t('students:credentials.emailAddress')}</label>
                            <input
                                type="email"
                                value={loginEmail}
                                onChange={(e) => setLoginEmail(e.target.value)}
                                placeholder={t('students:credentials.emailPlaceholder')}
                                required
                                autoFocus
                            />
                        </div>
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={() => setShowLoginEmailPrompt(false)}>
                            {t('common:actions.cancel')}
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={!loginEmail}>
                            {t('students:actions.sendInvite')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
