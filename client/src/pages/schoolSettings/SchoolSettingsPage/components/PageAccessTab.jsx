import { useCallback, useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import api from '../../../../config/api';
import { fetchSchoolFeatures } from '../../../../store/slices/schoolFeaturesSlice';

const formatAuditUser = (user) => {
  if (!user) return 'Unknown user';
  const name = `${user.firstName || ''} ${user.lastName || ''}`.trim();
  return name ? `${name} (${user.email})` : user.email;
};

const PageAccessTab = () => {
  const dispatch = useDispatch();
  const [pages, setPages] = useState([]);
  const [pageAccess, setPageAccess] = useState({ teacher: {}, student: {} });
  const [previewAudits, setPreviewAudits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/schools/me/page-access');
      setPages(response.data.data.pages || []);
      setPageAccess(response.data.data.pageAccess || { teacher: {}, student: {} });
      setPreviewAudits(response.data.data.previewAudits || []);
    } catch (loadError) {
      setError(loadError.response?.data?.message || 'Could not load page access settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const updateAccess = (role, pageKey, enabled) => {
    setSaved(false);
    setPageAccess((current) => ({
      ...current,
      [role]: { ...current[role], [pageKey]: enabled },
    }));
  };

  const save = async () => {
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const response = await api.patch('/schools/me/page-access', { pageAccess });
      setPageAccess(response.data.data.pageAccess);
      setSaved(true);
      dispatch(fetchSchoolFeatures());
      await loadSettings();
    } catch (saveError) {
      setError(saveError.response?.data?.message || 'Could not save page access settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="tab-content">
      <div className="card" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
        <h2>Teacher and student page access</h2>
        <p>These controls apply only to your school. Locked pages are blocked in navigation and by the API. School administrators retain access. A platform-wide super-admin disable cannot be overridden here.</p>
        <p>Turning access off temporarily does not delete lesson or student data.</p>
        {loading ? <p>Loading page access settings…</p> : (
          <>
            {error && <p role="alert" style={{ color: '#b42318' }}>{error}</p>}
            <div style={{ overflowX: 'auto' }}>
              <table className="users-table">
                <thead>
                  <tr><th>Page or feature</th><th>Teacher access</th><th>Student access</th></tr>
                </thead>
                <tbody>
                  {pages.map((page) => (
                    <tr key={page.key}>
                      <td><strong>{page.label}</strong><br /><small>{page.description}</small></td>
                      {['teacher', 'student'].map((role) => (
                        <td key={role}>
                          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '.5rem' }}>
                            <input
                              type="checkbox"
                              checked={pageAccess[role]?.[page.key] !== false}
                              onChange={(event) => updateAccess(role, page.key, event.target.checked)}
                            />
                            {pageAccess[role]?.[page.key] === false ? 'Locked' : 'Available'}
                          </label>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', marginTop: '1rem' }}>
              <button type="button" className="btn btn-primary" onClick={save} disabled={saving || loading}>
                {saving ? 'Saving…' : 'Save availability'}
              </button>
              {saved && <span role="status">Saved for this school.</span>}
            </div>
          </>
        )}
      </div>

      <div className="card" style={{ padding: '1.25rem' }}>
        <h2>Recent support previews</h2>
        <p>Preview activity is recorded for school support auditing.</p>
        {previewAudits.length === 0 ? <p>No support previews recorded yet.</p> : (
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

export default PageAccessTab;
