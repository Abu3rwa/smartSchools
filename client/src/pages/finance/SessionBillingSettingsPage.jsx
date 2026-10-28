import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../finance/Finance.css';
import './SessionBillingPage.css';
import { Icon } from './sessionBilling/ui';
import SettingsTab from './sessionBilling/SettingsTab';

const SessionBillingSettingsPage = () => {
    const navigate = useNavigate();
    const [refreshKey, setRefreshKey] = useState(0);

    return (
        <div className="session-billing-page sb-workspace">
            <header className="sb-workspace-head">
                <div className="sb-workspace-title">
                    <span className="sb-eyebrow">Tutoring · Live lessons</span>
                    <h1>Session billing settings</h1>
                    <p>Rates, billing rules, packages and the statement wording that families receive.</p>
                </div>
                <div className="sb-workspace-actions">
                    <button className="btn-secondary btn-sm" onClick={() => navigate('/portal/finance/session-billing')}>
                        <Icon name="chevron" size={14} /> Back to billing
                    </button>
                </div>
            </header>

            <main className="sb-workspace-body">
                <SettingsTab
                    key={`settings-page-${refreshKey}`}
                    range={{}}
                    filters={{}}
                    refreshKey={refreshKey}
                    initialSection="rates"
                    onMutated={() => setRefreshKey((key) => key + 1)}
                />
            </main>
        </div>
    );
};

export default SessionBillingSettingsPage;

