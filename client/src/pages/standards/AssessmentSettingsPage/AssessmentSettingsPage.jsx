import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { fetchSettings, updateSettings } from '../../../store/slices/standardAssessmentSlice';
import './AssessmentSettingsPage.css';

const SETTINGS_SECTIONS = [
    { id: 'pool', label: 'Pool' },
    { id: 'comms', label: 'Communications' }
];

const SETTINGS_FIELDS = {
    pool: [
        { key: 'maxQuestionsPerAssessment', label: 'Max questions per assessment', type: 'number' },
        { key: 'minQuestionsPerAssessment', label: 'Min questions per assessment', type: 'number' },
        { key: 'visibilityScope', label: 'Visibility scope', type: 'select', options: ['school', 'grade', 'teacher'] },
        { key: 'allowCrossSubjectBrowsing', label: 'Allow cross-subject browsing', type: 'toggle' },
        { key: 'allowCrossGradeBrowsing', label: 'Allow cross-grade browsing', type: 'toggle' },
        { key: 'requireAdminApprovalForPoolDraft', label: 'Require approval before pooling', type: 'toggle' },
        { key: 'maxDraftsPerTeacherPerDay', label: 'Max drafts per teacher per day', type: 'number' },
        { key: 'showReusedCount', label: 'Show reused count', type: 'toggle' },
        { key: 'allowDuplicateQuestionsInAssessment', label: 'Allow duplicate questions', type: 'toggle' }
    ],
    comms: [
        { key: 'emailFromName', label: 'Email sender name', type: 'text' },
        { key: 'emailReplyTo', label: 'Email reply-to address', type: 'text' },
        { key: 'emailFooterText', label: 'Email footer text', type: 'text' },
        { key: 'inAppNotificationEnabled', label: 'Enable in-app notifications', type: 'toggle' },
        { key: 'parentPreferredLanguage', label: 'Parent preferred language', type: 'select', options: ['en', 'ar', 'fr'] },
        { key: 'includeSchoolLogo', label: 'Include school logo', type: 'toggle' },
        { key: 'quietHoursStart', label: 'Quiet hours start', type: 'text' },
        { key: 'quietHoursEnd', label: 'Quiet hours end', type: 'text' },
        { key: 'quietHoursTimezone', label: 'Quiet hours timezone', type: 'text' }
    ]
};

const AssessmentSettingsPage = ({ embedded = false }) => {
    const dispatch = useDispatch();
    const [section, setSection] = useState('pool');
    const [settings, setSettings] = useState({});
    const [initialSettings, setInitialSettings] = useState({});
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    useEffect(() => {
        let active = true;
        setLoading(true);
        setError('');
        dispatch(fetchSettings(section))
            .unwrap()
            .then((result) => {
                if (!active) return;
                const values = result?.[section] || {};
                setSettings(values);
                setInitialSettings(values);
                setDirty(false);
            })
            .catch((loadError) => {
                if (active) setError(loadError?.message || 'Failed to load settings');
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => { active = false; };
    }, [dispatch, section]);

    const updateField = (key, value) => {
        setSettings((current) => ({ ...current, [key]: value }));
        setDirty(true);
        setSuccess('');
    };

    const saveSettings = async () => {
        setSaving(true);
        setError('');
        setSuccess('');
        try {
            const result = await dispatch(updateSettings({ section, updates: settings })).unwrap();
            const savedSettings = result?.[section] || settings;
            setSettings(savedSettings);
            setInitialSettings(savedSettings);
            setDirty(false);
            setSuccess('Settings saved');
        } catch (saveError) {
            setError(saveError?.message || 'Failed to save settings');
        } finally {
            setSaving(false);
        }
    };

    return (
        <section className={`assessment-settings-page${embedded ? ' assessment-settings-page--embedded' : ''}`}>
            <h2>Standards settings</h2>
            {error && <div className="assessment-settings-message assessment-settings-message--error" role="alert">{error}</div>}
            {success && <div className="assessment-settings-message assessment-settings-message--success" role="status">{success}</div>}
            <div className="assessment-settings-sections" role="tablist" aria-label="Settings sections">
                {SETTINGS_SECTIONS.map((item) => (
                    <button
                        key={item.id}
                        type="button"
                        role="tab"
                        aria-selected={section === item.id}
                        className={section === item.id ? 'active' : ''}
                        onClick={() => setSection(item.id)}
                    >
                        {item.label}
                    </button>
                ))}
            </div>
            {loading ? (
                <p>Loading settings...</p>
            ) : (
                <>
                    <div className="assessment-settings-fields">
                        {SETTINGS_FIELDS[section].map((field) => (
                            <label key={field.key} className="assessment-settings-field">
                                <span>{field.label}</span>
                                {field.type === 'toggle' ? (
                                    <input
                                        type="checkbox"
                                        checked={Boolean(settings[field.key])}
                                        onChange={(event) => updateField(field.key, event.target.checked)}
                                    />
                                ) : field.type === 'select' ? (
                                    <select
                                        value={settings[field.key] ?? field.options[0]}
                                        onChange={(event) => updateField(field.key, event.target.value)}
                                    >
                                        {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
                                    </select>
                                ) : (
                                    <input
                                        type={field.type}
                                        value={settings[field.key] ?? ''}
                                        onChange={(event) => updateField(
                                            field.key,
                                            field.type === 'number' && event.target.value !== ''
                                                ? Number(event.target.value)
                                                : event.target.value
                                        )}
                                    />
                                )}
                            </label>
                        ))}
                    </div>
                    <div className="assessment-settings-actions">
                        <button
                            type="button"
                            className="assessment-settings-discard"
                            onClick={() => {
                                setSettings(initialSettings);
                                setDirty(false);
                                setSuccess('');
                            }}
                            disabled={!dirty || saving}
                        >
                            Discard
                        </button>
                        <button type="button" onClick={saveSettings} disabled={!dirty || saving}>
                            {saving ? 'Saving...' : 'Save changes'}
                        </button>
                    </div>
                </>
            )}
        </section>
    );
};

export default AssessmentSettingsPage;
