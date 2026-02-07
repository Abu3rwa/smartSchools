import { useEffect, useState } from 'react';
import api from '../../config/api';
import {
    HiOutlineUserGroup,
    HiOutlineSearch,
    HiOutlineShieldCheck,
    HiOutlineMail
} from 'react-icons/hi';
import './AdminDashboardPage.css';

const AdminUsersPage = () => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        try {
            const response = await api.get('/users');
            setUsers(response.data.data || response.data.users || []);
        } catch (error) {
            console.error('Error fetching users:', error);
        } finally {
            setLoading(false);
        }
    };

    const filtered = users.filter(u =>
        `${u.firstName} ${u.lastName}`.toLowerCase().includes(search.toLowerCase()) ||
        u.email?.toLowerCase().includes(search.toLowerCase()) ||
        u.role?.toLowerCase().includes(search.toLowerCase())
    );

    const getRoleBadgeClass = (role) => {
        switch (role) {
            case 'super_admin': return 'trial';
            case 'admin': return 'active';
            case 'teacher': return 'active';
            default: return 'inactive';
        }
    };

    return (
        <div className="admin-dashboard">
            <h1>Users Management</h1>

            {/* Search */}
            <div style={{ display: 'flex', gap: 'var(--spacing-md)', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
                    <HiOutlineSearch size={18} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input
                        type="text"
                        placeholder="Search users by name, email, or role..."
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
            </div>

            {/* Users Table */}
            <div className="admin-section">
                {loading ? (
                    <div className="admin-empty"><div className="spinner"></div></div>
                ) : filtered.length === 0 ? (
                    <div className="admin-empty">
                        <HiOutlineUserGroup size={32} style={{ marginBottom: 8, opacity: 0.5 }} />
                        <p>No users found</p>
                    </div>
                ) : (
                    <table className="admin-table">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Email</th>
                                <th>Role</th>
                                <th>School</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((user) => (
                                <tr key={user._id}>
                                    <td style={{ fontWeight: 500 }}>
                                        {user.firstName} {user.lastName}
                                    </td>
                                    <td>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <HiOutlineMail size={14} style={{ color: 'var(--text-muted)' }} />
                                            {user.email}
                                        </span>
                                    </td>
                                    <td>
                                        <span className={`status-badge ${getRoleBadgeClass(user.role)}`}>
                                            {user.role === 'super_admin' && <HiOutlineShieldCheck size={12} style={{ marginRight: 4 }} />}
                                            {user.role}
                                        </span>
                                    </td>
                                    <td>{user.school?.name || '—'}</td>
                                    <td>
                                        <span className={`status-badge ${user.isActive ? 'active' : 'inactive'}`}>
                                            {user.isActive ? 'Active' : 'Inactive'}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

export default AdminUsersPage;
