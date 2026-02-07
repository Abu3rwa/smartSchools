import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { selectUser } from '../../store/slices/authSlice';
import api from '../../config/api';
import {
    HiOutlineOfficeBuilding,
    HiOutlineUserGroup,
    HiOutlineAcademicCap,
    HiOutlineCurrencyDollar,
    HiOutlinePlus,
    HiOutlineEye
} from 'react-icons/hi';
import './AdminDashboardPage.css';

const AdminDashboardPage = () => {
    const navigate = useNavigate();
    const user = useSelector(selectUser);
    const [schools, setSchools] = useState([]);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({ schools: 0, users: 0, students: 0 });

    useEffect(() => {
        fetchSchools();
    }, []);

    const fetchSchools = async () => {
        try {
            const response = await api.get('/schools');
            const data = response.data.data;
            setSchools(data.schools);
            setStats({
                schools: data.pagination.total,
                users: data.schools.reduce((sum, s) => sum + (s.userCount || 0), 0),
                students: data.schools.reduce((sum, s) => sum + (s.studentCount || 0), 0)
            });
        } catch (error) {
            console.error('Error fetching schools:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="admin-dashboard">
            <h1>
                Platform Dashboard
                <span>Welcome back, {user?.firstName}</span>
            </h1>

            {/* Stats */}
            <div className="admin-stats">
                <div className="admin-stat-card">
                    <div className="admin-stat-icon schools">
                        <HiOutlineOfficeBuilding size={24} />
                    </div>
                    <div className="admin-stat-info">
                        <h3>{stats.schools}</h3>
                        <p>Total Schools</p>
                    </div>
                </div>
                <div className="admin-stat-card">
                    <div className="admin-stat-icon users">
                        <HiOutlineUserGroup size={24} />
                    </div>
                    <div className="admin-stat-info">
                        <h3>{stats.users}</h3>
                        <p>Total Users</p>
                    </div>
                </div>
                <div className="admin-stat-card">
                    <div className="admin-stat-icon students">
                        <HiOutlineAcademicCap size={24} />
                    </div>
                    <div className="admin-stat-info">
                        <h3>{stats.students}</h3>
                        <p>Total Students</p>
                    </div>
                </div>
                <div className="admin-stat-card">
                    <div className="admin-stat-icon revenue">
                        <HiOutlineCurrencyDollar size={24} />
                    </div>
                    <div className="admin-stat-info">
                        <h3>$0</h3>
                        <p>Monthly Revenue</p>
                    </div>
                </div>
            </div>

            {/* Schools Table */}
            <div className="admin-section">
                <div className="admin-section-header">
                    <h2>Schools</h2>
                    <button
                        className="admin-action-btn primary"
                        onClick={() => navigate('/admin/schools/new')}
                    >
                        <HiOutlinePlus size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                        Add School
                    </button>
                </div>

                {loading ? (
                    <div className="admin-empty">
                        <div className="spinner"></div>
                    </div>
                ) : schools.length === 0 ? (
                    <div className="admin-empty">
                        <p>No schools yet. Create your first school to get started.</p>
                    </div>
                ) : (
                    <table className="admin-table">
                        <thead>
                            <tr>
                                <th>School</th>
                                <th>Admin</th>
                                <th>Users</th>
                                <th>Students</th>
                                <th>Plan</th>
                                <th>Status</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {schools.map((school) => (
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
                                        <button
                                            className="admin-action-btn"
                                            onClick={() => navigate(`/admin/schools/${school._id}`)}
                                        >
                                            <HiOutlineEye size={14} />
                                        </button>
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

export default AdminDashboardPage;
