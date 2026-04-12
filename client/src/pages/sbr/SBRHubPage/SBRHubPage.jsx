import { lazy, Suspense, useState } from 'react';
import { useSelector } from 'react-redux';
import './SBRHubPage.css';

const SBRGenerationPage = lazy(() => import('../SBRGenerationPage/SBRGenerationPage'));
const SBRParentReportsPage = lazy(() => import('../SBRParentReportsPage/SBRParentReportsPage'));

const TABS = { GENERATE: 'generate', REPORTS: 'reports' };

const SBRHubPage = () => {
  const user = useSelector((state) => state.auth?.user);
  const role = user?.role || '';
  const canGenerate = ['admin', 'teacher'].includes(role);
  const canView = ['admin', 'teacher', 'parent'].includes(role);

  const [activeTab, setActiveTab] = useState(canGenerate ? TABS.GENERATE : TABS.REPORTS);

  return (
    <div className="sbr-hub-page">
      <h1 className="sbr-hub-title">Standards-Based Report Cards</h1>
      <div className="sbr-hub-tabs">
        {canGenerate && (
          <button
            className={`tab-btn ${activeTab === TABS.GENERATE ? 'active' : ''}`}
            onClick={() => setActiveTab(TABS.GENERATE)}
          >
            Generate Reports
          </button>
        )}
        {canView && (
          <button
            className={`tab-btn ${activeTab === TABS.REPORTS ? 'active' : ''}`}
            onClick={() => setActiveTab(TABS.REPORTS)}
          >
            View Reports
          </button>
        )}
      </div>

      {activeTab === TABS.GENERATE && canGenerate && (
        <Suspense fallback={<div className="tab-loading">Loading...</div>}>
          <SBRGenerationPage />
        </Suspense>
      )}

      {activeTab === TABS.REPORTS && canView && (
        <Suspense fallback={<div className="tab-loading">Loading...</div>}>
          <SBRParentReportsPage />
        </Suspense>
      )}
    </div>
  );
};

export default SBRHubPage;
