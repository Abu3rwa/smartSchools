import { Outlet } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { selectSidebarOpen } from '../../store/slices/uiSlice';
import Sidebar from './Sidebar';
import Header from './Header';
import './MainLayout.css';

const MainLayout = () => {
    const sidebarOpen = useSelector(selectSidebarOpen);

    return (
        <div className={`main-layout ${sidebarOpen ? '' : 'sidebar-collapsed'}`}>
            <Sidebar />
            <div className="main-content">
                <Header />
                <main className="page-content">
                    <Outlet />
                </main>
            </div>
        </div>
    );
};

export default MainLayout;
