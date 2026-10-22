import React, { useCallback, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import api from '../../../config/api';
import { selectUser } from '../../../store/slices/authSlice';
import { selectCurrentAcademicYear } from '../../../store/slices/uiSlice';
import { fetchBehaviorSettings } from '../../../api/behaviorApi';
import ConsequencesWorkspace from './consequences/ConsequencesWorkspace';
import BehaviorSetupGate from './consequences/BehaviorSetupGate';
import './BehaviorManagementPage.css';

const ADMIN_ROLES = ['super_admin', 'admin', 'department_principal', 'behavior_manager'];

const BehaviorManagementPage = () => {
    const { t } = useTranslation(['behaviorConsequences']);
    const user = useSelector(selectUser);
    const academicYear = useSelector(selectCurrentAcademicYear);
    const [settings, setSettings] = useState(null);
    const [loading, setLoading] = useState(true);
    const [students, setStudents] = useState([]);

    const readSettings = useCallback(async () => {
        const payload = await fetchBehaviorSettings();
        setSettings(payload?.settings || null);
    }, []);

    useEffect(() => {
        let cancelled = false;
        fetchBehaviorSettings()
            .then((payload) => { if (!cancelled) setSettings(payload?.settings || null); })
            .catch(() => { if (!cancelled) setSettings(null); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, []);

    const enabled = settings?.enabled === true;

    // The roster is only needed to log an incident, so a switched-off module must
    // not pay for a 500-student query on every visit.
    useEffect(() => {
        if (!enabled) return undefined;
        let cancelled = false;
        api.get('/students', { params: { status: 'active', limit: 500, academicYear } })
            .then((response) => {
                if (!cancelled) setStudents(response?.data?.data?.students || []);
            })
            .catch(() => { if (!cancelled) setStudents([]); });
        return () => { cancelled = true; };
    }, [academicYear, enabled]);

    return (
        <div className="behavior-management-page">
            {loading ? (
                <div className="bc-loading">{t('common.loading')}</div>
            ) : (
                enabled ? (
                    <ConsequencesWorkspace
                        students={students}
                        user={user}
                        initialSettings={settings}
                    />
                ) : (
                    <BehaviorSetupGate
                        isAdmin={ADMIN_ROLES.includes(user?.role)}
                        onEnabled={readSettings}
                    />
                )
            )}
        </div>
    );
};

export default BehaviorManagementPage;
