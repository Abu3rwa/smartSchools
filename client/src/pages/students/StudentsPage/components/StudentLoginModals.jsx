import React from 'react';
import {
    HiOutlineExclamationCircle,
    HiOutlineClipboardCopy,
    HiOutlineDownload
} from 'react-icons/hi';

export const CredentialsModal = ({
    showCredentials,
    setShowCredentials,
    credentials,
    copyToClipboard
}) => {
    if (!showCredentials || !credentials) return null;

    return (
        <div className="modal-overlay" onClick={() => setShowCredentials(false)}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
                <div className="modal-header">
                    <h3>Student Login Credentials</h3>
                    <button className="modal-close" onClick={() => setShowCredentials(false)}>&times;</button>
                </div>
                <div className="modal-body">
                    <div className="credentials-card">
                        <p className="credentials-warning">
                            <HiOutlineExclamationCircle size={18} />
                            <strong>Copy these credentials now!</strong> The password cannot be viewed again.
                        </p>
                        <div className="credentials-row">
                            <label>Student</label>
                            <span>{credentials.studentName}</span>
                        </div>
                        <div className="credentials-row">
                            <label>Email</label>
                            <div className="credentials-value">
                                <code>{credentials.email}</code>
                                <button className="btn-icon" onClick={() => copyToClipboard(credentials.email)} title="Copy email">
                                    <HiOutlineClipboardCopy size={16} />
                                </button>
                            </div>
                        </div>
                        <div className="credentials-row">
                            <label>Password</label>
                            <div className="credentials-value">
                                <code className="password-display">{credentials.tempPassword}</code>
                                <button className="btn-icon" onClick={() => copyToClipboard(credentials.tempPassword)} title="Copy password">
                                    <HiOutlineClipboardCopy size={16} />
                                </button>
                            </div>
                        </div>
                        <button
                            className="btn btn-outline btn-sm mt-md"
                            onClick={() => {
                                const text = `Student: ${credentials.studentName}\nEmail: ${credentials.email}\nPassword: ${credentials.tempPassword}`;
                                copyToClipboard(text);
                            }}
                        >
                            <HiOutlineClipboardCopy size={16} />
                            Copy All
                        </button>
                    </div>
                </div>
                <div className="modal-footer">
                    <button className="btn btn-primary" onClick={() => setShowCredentials(false)}>
                        Done
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
    if (!showBulkCredentials || !bulkCredentials) return null;

    return (
        <div className="modal-overlay" onClick={() => { setShowBulkCredentials(false); setBulkCredentials(null); }}>
            <div className="modal modal-lg" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
                <div className="modal-header">
                    <h3>Bulk Login Credentials</h3>
                    <button className="modal-close" onClick={() => { setShowBulkCredentials(false); setBulkCredentials(null); }}>&times;</button>
                </div>
                <div className="modal-body">
                    <div className="credentials-card">
                        <p className="credentials-warning">
                            <HiOutlineExclamationCircle size={18} />
                            <strong>Copy or download these credentials now!</strong> Passwords cannot be viewed again.
                        </p>
                        {bulkCredentials.created?.length > 0 && (
                            <>
                                <div className="table-container" style={{ maxHeight: 280, overflow: 'auto', marginBottom: '1rem' }}>
                                    <table>
                                        <thead>
                                            <tr>
                                                <th>Student Name</th>
                                                <th>Email</th>
                                                <th>Password</th>
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
                                        Download CSV
                                    </button>
                                    <button type="button" className="btn btn-outline btn-sm" onClick={copyAllBulkCredentials}>
                                        <HiOutlineClipboardCopy size={16} />
                                        Copy All
                                    </button>
                                </div>
                            </>
                        )}
                        {bulkCredentials.errors?.length > 0 && (
                            <div className="import-errors mt-md">
                                <h4><HiOutlineExclamationCircle /> Issues</h4>
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
                        Done
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
    if (!showParentCredentialsResult || !parentCredentialsResult) return null;

    return (
        <div className="modal-overlay" onClick={() => { setShowParentCredentialsResult(false); setParentCredentialsResult(null); }}>
            <div className="modal modal-lg" onClick={e => e.stopPropagation()} style={{ maxWidth: 620 }}>
                <div className="modal-header">
                    <h3>Parent App Credentials</h3>
                    <button className="modal-close" onClick={() => { setShowParentCredentialsResult(false); setParentCredentialsResult(null); }}>&times;</button>
                </div>
                <div className="modal-body">
                    <div className="credentials-card">
                        <p className="credentials-warning">
                            <HiOutlineExclamationCircle size={18} />
                            <strong>Credentials were emailed.</strong> Copy these now if you need to share manually.
                        </p>
                        <div className="credentials-row">
                            <label>Student</label>
                            <span>{parentCredentialsResult.studentName}</span>
                        </div>
                        {parentCredentialsResult.sent?.length > 0 && (
                            <>
                                <div className="table-container" style={{ maxHeight: 260, overflow: 'auto', marginTop: '0.75rem' }}>
                                    <table>
                                        <thead>
                                            <tr>
                                                <th>Contact</th>
                                                <th>Email</th>
                                                <th>Password</th>
                                                <th>Status</th>
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
                                                            {item.emailSent ? 'Emailed' : 'Created only'}
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
                                        Copy All
                                    </button>
                                </div>
                            </>
                        )}
                        {parentCredentialsResult.errors?.length > 0 && (
                            <div className="import-errors mt-md">
                                <h4><HiOutlineExclamationCircle /> Issues</h4>
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
                        Done
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
    if (!showLoginEmailPrompt || !loginTargetStudent) return null;

    return (
        <div className="modal-overlay" onClick={() => setShowLoginEmailPrompt(false)}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
                <div className="modal-header">
                    <h3>Enter Email for Login</h3>
                    <button className="modal-close" onClick={() => setShowLoginEmailPrompt(false)}>&times;</button>
                </div>
                <form onSubmit={(e) => { e.preventDefault(); doCreateLogin(loginTargetStudent, loginEmail); }}>
                    <div className="modal-body">
                        <p className="text-muted">
                            <strong>{loginTargetStudent.firstName} {loginTargetStudent.lastName}</strong> doesn't have an email on file. Enter one to create their login account.
                        </p>
                        <div className="form-group">
                            <label>Email Address *</label>
                            <input
                                type="email"
                                value={loginEmail}
                                onChange={(e) => setLoginEmail(e.target.value)}
                                placeholder="student@example.com"
                                required
                                autoFocus
                            />
                        </div>
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={() => setShowLoginEmailPrompt(false)}>
                            Cancel
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={!loginEmail}>
                            Create Login
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
