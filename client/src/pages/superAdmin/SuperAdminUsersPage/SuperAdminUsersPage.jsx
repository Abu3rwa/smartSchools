import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../../config/api';
import {
    HiOutlineUserGroup,
    HiOutlineSearch,
    HiOutlineShieldCheck,
    HiOutlineMail
} from 'react-icons/hi';
import '../../../components/superAdmin/SuperAdminBase.css';

const SuperAdminUsersPage = () => {
    const { t } = useTranslation(['superAdminUsers']);
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

    const getRoleLabel = (role = '') => {
        const normalized = String(role || '').toLowerCase();
        return t(`superAdminUsers:role.${normalized}`, { defaultValue: normalized });
    };

    return (
        <div className="admin-dashboard">
            <h1>{t('superAdminUsers:page.title')}</h1>

            {/* Search */}
            <div className="admin-toolbar">
                <div className="admin-toolbar-search">
                    <HiOutlineSearch size={18} className="search-icon" />
                    <input
                        className="admin-toolbar-input"
                        type="text"
                        placeholder={t('superAdminUsers:search.placeholder')}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
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
                        <p>{t('superAdminUsers:empty.noUsers')}</p>
                    </div>
                ) : (
                    <div className="admin-table-wrap">
                        <table className="admin-table">
                            <thead>
                                <tr>
                                    <th>{t('superAdminUsers:table.name')}</th>
                                    <th>{t('superAdminUsers:table.email')}</th>
                                    <th>{t('superAdminUsers:table.role')}</th>
                                    <th>{t('superAdminUsers:table.school')}</th>
                                    <th>{t('superAdminUsers:table.status')}</th>
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
                                                {getRoleLabel(user.role)}
                                            </span>
                                        </td>
                                        <td>{user.school?.name || t('superAdminUsers:common.na')}</td>
                                        <td>
                                            <span className={`status-badge ${user.isActive ? 'active' : 'inactive'}`}>
                                                {user.isActive
                                                    ? t('superAdminUsers:status.active')
                                                    : t('superAdminUsers:status.inactive')}
                                            </span>
                                        </td>
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

export default SuperAdminUsersPage;
