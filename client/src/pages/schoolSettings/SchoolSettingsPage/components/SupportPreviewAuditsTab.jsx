import { useCallback, useEffect, useState } from 'react';
import api from '../../../../config/api';

const formatAuditUser = (user) => {
  if (!user) return 'Unknown user';
  const name = `${user.firstName || ''} ${user.lastName || ''}`.trim();
  return name ? `${name} (${user.email})` : user.email;
};

const SupportPreviewAuditsTab = () => {
  const [previewAudits, setPreviewAudits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadAudits = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/schools/me/support-preview-audits');
      setPreviewAudits(response.data?.data?.previewAudits || []);
    } catch (loadError) {
      setError(loadError.response?.data?.message || 'Could not load support preview history.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAudits();
  }, [loadAudits]);

  return (
    <div className="tab-content">
      <div className="card" style={{ padding: '1.25rem' }}>
        <h2>Recent support previews</h2>
        <p>Preview activity is recorded for school support auditing.</p>
        {loading ? <p>Loading support preview history…</p> : error ? (
          <>
            <p role="alert" style={{ color: '#b42318' }}>{error}</p>
            <button type="button" className="btn btn-secondary" onClick={loadAudits}>Try again</button>
          </>
        ) : previewAudits.length === 0 ? <p>No support previews recorded yet.</p> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="users-table">
              <thead><tr><th>Admin</th><th>Viewed account</th><th>Role</th><th>Started</th><th>Ended</th></tr></thead>
              <tbody>
                {previewAudits.map((audit) => (
                  <tr key={audit._id}>
                    <td>{formatAuditUser(audit.admin)}</td>
                    <td>{formatAuditUser(audit.targetUser)}</td>
                    <td>{audit.targetRole}</td>
                    <td>{new Date(audit.startedAt).toLocaleString()}</td>
                    <td>{audit.endedAt
                      ? new Date(audit.endedAt).toLocaleString()
                      : new Date(audit.expiresAt).getTime() <= Date.now()
                        ? `Expired ${new Date(audit.expiresAt).toLocaleString()}`
                        : `Open until ${new Date(audit.expiresAt).toLocaleTimeString()}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default SupportPreviewAuditsTab;
