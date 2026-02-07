import { Outlet } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { selectSidebarOpen } from '../../store/slices/uiSlice';
import AdminSidebar from './AdminSidebar';
import Header from './Header';
import './MainLayout.css';

const AdminLayout = () => {
    const sidebarOpen = useSelector(selectSidebarOpen);

    return (
        <div className={`main-layout ${sidebarOpen ? '' : 'sidebar-collapsed'}`}>
            <AdminSidebar />
            <div className="main-content">
                <Header />
                <main className="page-content">
                    <Outlet />
                </main>
            </div>
        </div>
    );
};

export default AdminLayout;
