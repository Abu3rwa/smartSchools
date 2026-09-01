import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { selectUser } from '../../store/slices/authSlice';
import PlpTeacherClassboardPage from './PlpTeacherClassboardPage';
import PlpAwardsPage from './PlpAwardsPage';
import PlpSupervisorDashboard from './PlpSupervisorDashboard';
import PlpAdminConfigPage from './PlpAdminConfigPage';
import PlpSupervisorAssignmentsPage from './PlpSupervisorAssignmentsPage';
import PlpMyRecordPage from './PlpMyRecordPage';
import './PLP.css';

const TAB_DEFINITIONS = [
    { id: 'classboard', label: 'Character', roles: ['admin', 'teacher', 'department_principal'], component: PlpTeacherClassboardPage },
    { id: 'awards', label: 'Monthly Awards', roles: ['admin', 'teacher'], component: PlpAwardsPage },
    { id: 'supervisor', label: 'Supervisor View', roles: ['admin', 'department_principal'], component: PlpSupervisorDashboard },
    { id: 'config', label: 'PLP Config', roles: ['admin'], component: PlpAdminConfigPage },
    { id: 'assignments', label: 'Supervisor Assignments', roles: ['admin'], component: PlpSupervisorAssignmentsPage },
    { id: 'my-portfolio', label: 'My Portfolio', roles: ['student'], component: PlpMyRecordPage },
];

export default function PlpHubPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const user = useSelector(selectUser);
    const availableTabs = useMemo(
        () => TAB_DEFINITIONS.filter((tab) => tab.roles.includes(user?.role)),
        [user?.role]
    );
    const requestedTab = searchParams.get('tab');
    const activeTab = availableTabs.find((tab) => tab.id === requestedTab) || availableTabs[0];
    const ActivePage = activeTab?.component;

    const selectTab = (tabId) => {
        setSearchParams({ tab: tabId });
    };

    if (!ActivePage) {
        return <div className="plp-empty">You do not have access to PLP.</div>;
    }

    return (
        <div className="plp-hub">
            <header className="plp-hub-header">
                <div>
                    <p className="plp-hub-eyebrow">Character Development</p>
                    <h1>Personal Learning Portfolio</h1>
                    <p className="plp-hub-subtitle">Track character growth, evidence, goals, and student support in one place.</p>
                </div>
            </header>
            <nav className="plp-hub-tabs" aria-label="PLP sections">
                {availableTabs.map((tab) => (
                    <button
                        key={tab.id}
                        type="button"
                        className={`plp-hub-tab ${activeTab.id === tab.id ? 'is-active' : ''}`}
                        onClick={() => selectTab(tab.id)}
                        aria-current={activeTab.id === tab.id ? 'page' : undefined}
                    >
                        {tab.label}
                    </button>
                ))}
            </nav>
            <main className="plp-hub-content">
                <ActivePage />
            </main>
        </div>
    );
}
