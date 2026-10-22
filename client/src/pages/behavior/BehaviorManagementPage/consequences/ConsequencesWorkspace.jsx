import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    HiOutlineClipboardList,
    HiOutlineInboxIn,
    HiOutlineChartBar,
    HiOutlineSparkles,
    HiOutlineTrendingUp,
    HiOutlineCog
} from 'react-icons/hi';
import { fetchBehaviorSettings } from '../../../../api/behaviorApi';
import LogConsequencePanel from './LogConsequencePanel';
import ApprovalQueuePanel from './ApprovalQueuePanel';
import TaskBoardPanel from './TaskBoardPanel';
import IncidentLedgerPanel from './IncidentLedgerPanel';
import RulesSetupPanel from './RulesSetupPanel';
import LadderSetupPanel, { TemplateSetupPanel } from './LadderSetupPanel';
import ReportsPanel from './ReportsPanel';
import './consequences.css';

const ADMIN_ROLES = ['super_admin', 'admin', 'department_principal', 'behavior_manager'];

const ConsequencesWorkspace = ({ students = [], user = null, initialSettings = null }) => {
    const { t } = useTranslation(['behaviorConsequences']);
    const [savedSettings, setSavedSettings] = useState(null);
    const [fetchedSettings, setFetchedSettings] = useState(null);
    const [tab, setTab] = useState('log');
    const [approvalCount, setApprovalCount] = useState(0);
    const [taskCount, setTaskCount] = useState(0);
    const [catalogReload, setCatalogReload] = useState(0);

    const isAdmin = useMemo(() => ADMIN_ROLES.includes(user?.role), [user?.role]);

    // The page already reads the flag to decide whether this workspace exists,
    // so the full settings row is only fetched when it was not handed over.
    useEffect(() => {
        if (initialSettings) return undefined;
        let cancelled = false;
        fetchBehaviorSettings()
            .then((payload) => { if (!cancelled) setFetchedSettings(payload?.settings || null); })
            .catch(() => { if (!cancelled) setFetchedSettings(null); });
        return () => { cancelled = true; };
    }, [initialSettings]);

    const settings = savedSettings || initialSettings || fetchedSettings;

    const onApprovalCountChange = useCallback((value) => setApprovalCount(value || 0), []);
    const onTaskCountChange = useCallback((value) => setTaskCount(value || 0), []);
    const onLogged = useCallback(() => setCatalogReload((value) => value + 1), []);

    if (!settings) {
        return <div className="bc-loading">{t('common.loading')}</div>;
    }

    const seriousRoles = settings.seriousIncident?.allowedRoles || [];

    const tabs = [
        { key: 'log', label: t('tabs.log'), icon: <HiOutlineSparkles /> },
        { key: 'approvals', label: t('tabs.approvals'), icon: <HiOutlineInboxIn />, count: approvalCount },
        { key: 'tasks', label: t('tabs.tasks'), icon: <HiOutlineClipboardList />, count: taskCount },
        { key: 'ledger', label: t('tabs.ledger'), icon: <HiOutlineTrendingUp /> },
        { key: 'setup', label: t('tabs.setup'), icon: <HiOutlineCog /> },
        ...(isAdmin ? [{ key: 'reports', label: t('tabs.reports'), icon: <HiOutlineChartBar /> }] : [])
    ];

    return (
        <div className="bc-workspace">
            <div className="bc-tabs" role="tablist">
                {tabs.map((entry) => (
                    <button
                        type="button"
                        key={entry.key}
                        role="tab"
                        aria-selected={tab === entry.key}
                        className={`bc-tab ${tab === entry.key ? 'is-active' : ''}`}
                        onClick={() => setTab(entry.key)}
                    >
                        {entry.icon}
                        {entry.label}
                        {entry.count > 0 && <span className="bc-tab-count">{entry.count}</span>}
                    </button>
                ))}
            </div>

            {tab === 'log' && (
                <LogConsequencePanel
                    key={catalogReload}
                    students={students}
                    user={user}
                    seriousRoles={seriousRoles}
                    onLogged={onLogged}
                />
            )}
            {tab === 'approvals' && <ApprovalQueuePanel onCountChange={onApprovalCountChange} />}
            {tab === 'tasks' && <TaskBoardPanel onCountChange={onTaskCountChange} />}
            {tab === 'ledger' && <IncidentLedgerPanel isAdmin={isAdmin} />}
            {tab === 'setup' && (
                <>
                    <RulesSetupPanel
                        isAdmin={isAdmin}
                        settings={settings}
                        onSaved={(next) => setSavedSettings(next)}
                    />
                    <LadderSetupPanel isAdmin={isAdmin} onTypesChanged={onLogged} />
                    {isAdmin && <TemplateSetupPanel isAdmin={isAdmin} />}
                </>
            )}
            {tab === 'reports' && isAdmin && <ReportsPanel />}
        </div>
    );
};

export default ConsequencesWorkspace;
