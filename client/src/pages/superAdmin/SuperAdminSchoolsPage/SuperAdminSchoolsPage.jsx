import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { impersonateUser } from '../../../store/slices/authSlice';
import api from '../../../config/api';
import toast from 'react-hot-toast';
import {
    HiOutlineOfficeBuilding,
    HiOutlinePlus,
    HiOutlineSearch,
    HiOutlineEye,
    HiOutlinePencil,
    HiOutlineX,
    HiOutlineLogin
} from 'react-icons/hi';
import '../../../components/superAdmin/SuperAdminBase.css';

const SuperAdminSchoolsPage = () => {
    const navigate = useNavigate();
    const dispatch = useDispatch();
    const [schools, setSchools] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [creating, setCreating] = useState(false);
    const [formData, setFormData] = useState({
        schoolName: '',
        adminName: '',
        adminEmail: '',
        adminPassword: '',
        plan: 'starter',
        maxStudents: 50
    });

    useEffect(() => {
        fetchSchools();
    }, []);

    const fetchSchools = async () => {
        try {
            const response = await api.get('/schools');
            setSchools(response.data.data.schools);
        } catch (error) {
            console.error('Error fetching schools:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        setCreating(true);
        try {
            await api.post('/schools', formData);
            toast.success('School created successfully');
            setShowCreateModal(false);
            setFormData({ schoolName: '', adminName: '', adminEmail: '', adminPassword: '', plan: 'starter', maxStudents: 50 });
            fetchSchools();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to create school');
        } finally {
            setCreating(false);
        }
    };

    const handleImpersonate = async (userId) => {
        if (!window.confirm('Are you sure you want to log in as this school\'s admin?')) return;

        const toastId = toast.loading('Initiating impersonation...');
        try {
            await dispatch(impersonateUser(userId)).unwrap();
            toast.success('Redirecting to school dashboard...', { id: toastId });
            navigate('/'); // Redirect to the main dashboard, which will now be the impersonated user's dashboard
        } catch (error) {
            toast.error(error, { id: toastId });
        }
    };

    const filtered = schools.filter(s =>
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.contact?.adminEmail?.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="admin-dashboard">
            <h1>Schools Management</h1>

            {/* Actions Bar */}
            <div style={{ display: 'flex', gap: 'var(--spacing-md)', alignItems: 'center', flexWrap: 'wrap' }}>
                <div className="search-input-wrapper" style={{ flex: 1, minWidth: 200 }}>
                    <HiOutlineSearch className="search-icon" size={18} />
                    <input
                        type="text"
                        placeholder="Search schools..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        style={{
                            width: '100%',
                            padding: 'var(--spacing-sm) var(--spacing-sm) var(--spacing-sm) 2.5rem',
                            border: '1px solid var(--border-color)',
                            borderRadius: 'var(--radius-md)',
                            background: 'var(--bg-card)',
                            color: 'var(--text-primary)',
                            fontSize: '0.9rem'
                        }}
                    />
                </div>
                <button className="admin-action-btn primary" onClick={() => setShowCreateModal(true)}>
                    <HiOutlinePlus size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                    Create School
                </button>
            </div>

            {/* Schools Table */}
            <div className="admin-section">
                {loading ? (
                    <div className="admin-empty"><div className="spinner"></div></div>
                ) : filtered.length === 0 ? (
                    <div className="admin-empty">
                        <HiOutlineOfficeBuilding size={32} style={{ marginBottom: 8, opacity: 0.5 }} />
                        <p>No schools found</p>
                    </div>
                ) : (
                    <table className="admin-table">
                        <thead>
                            <tr>
                                <th>School</th>
                                <th>Admin Email</th>
                                <th>Users</th>
                                <th>Students</th>
                                <th>Plan</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((school) => (
                                <tr key={school._id}>
                                    <td style={{ fontWeight: 500 }}>{school.name}</td>
                                    <td>{school.contact?.adminEmail}</td>
                                    <td>{school.userCount || 0}</td>
                                    <td>{school.studentCount || 0}</td>
                                    <td style={{ textTransform: 'capitalize' }}>{school.subscription?.plan || 'starter'}</td>
                                    <td>
                                        <span className={`status-badge ${school.subscription?.status || 'active'}`}>
                                            {school.subscription?.status || 'active'}
                                        </span>
                                    </td>
                                    <td>
                                        <div className="admin-actions">
                                            <button className="admin-action-btn" title="Login As Admin" onClick={() => handleImpersonate(school.adminId)}>
                                                <HiOutlineLogin size={14} />
                                            </button>
                                            <button className="admin-action-btn" title="View Details" onClick={() => navigate(`/admin/schools/${school._id}`)}>
                                                <HiOutlineEye size={14} />
                                            </button>
                                            <button className="admin-action-btn" title="Edit School">
                                                <HiOutlinePencil size={14} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Create Modal */}
            {showCreateModal && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 1000, padding: 'var(--spacing-xl)'
                }}>
                    <div style={{
                        background: 'var(--bg-card)', borderRadius: 'var(--radius-xl)',
                        padding: 'var(--spacing-2xl)', width: '100%', maxWidth: 480,
                        border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-lg)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-xl)' }}>
                            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)' }}>Create School</h2>
                            <button onClick={() => setShowCreateModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                                <HiOutlineX size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleCreate} className="register-form" style={{ gap: 'var(--spacing-md)' }}>
                            <div className="form-group">
                                <label>School Name *</label>
                                <input type="text" required value={formData.schoolName}
                                    onChange={(e) => setFormData({ ...formData, schoolName: e.target.value })}
                                    placeholder="Springfield High" />
                            </div>
                            <div className="form-group">
                                <label>Admin Name *</label>
                                <input type="text" required value={formData.adminName}
                                    onChange={(e) => setFormData({ ...formData, adminName: e.target.value })}
                                    placeholder="Jane Doe" />
                            </div>
                            <div className="form-group">
                                <label>Admin Email *</label>
                                <input type="email" required value={formData.adminEmail}
                                    onChange={(e) => setFormData({ ...formData, adminEmail: e.target.value })}
                                    placeholder="admin@school.edu" />
                            </div>
                            <div className="form-group">
                                <label>Admin Password *</label>
                                <input type="password" required value={formData.adminPassword}
                                    onChange={(e) => setFormData({ ...formData, adminPassword: e.target.value })}
                                    placeholder="Strong password" />
                            </div>
                            <div style={{ display: 'flex', gap: 'var(--spacing-md)' }}>
                                <div className="form-group" style={{ flex: 1 }}>
                                    <label>Plan</label>
                                    <select value={formData.plan} onChange={(e) => setFormData({ ...formData, plan: e.target.value })}>
                                        <option value="starter">Starter</option>
                                        <option value="professional">Professional</option>
                                        <option value="enterprise">Enterprise</option>
                                    </select>
                                </div>
                                <div className="form-group" style={{ flex: 1 }}>
                                    <label>Max Students</label>
                                    <input type="number" value={formData.maxStudents}
                                        onChange={(e) => setFormData({ ...formData, maxStudents: parseInt(e.target.value) })} />
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: 'var(--spacing-sm)', justifyContent: 'flex-end', marginTop: 'var(--spacing-md)' }}>
                                <button type="button" className="admin-action-btn" onClick={() => setShowCreateModal(false)}>Cancel</button>
                                <button type="submit" className="admin-action-btn primary" disabled={creating}>
                                    {creating ? 'Creating...' : 'Create School'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SuperAdminSchoolsPage;
