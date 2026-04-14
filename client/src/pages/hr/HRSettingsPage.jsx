import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchHRSettings, updateHRSettings, selectHRSettings, selectHRLoading, selectHRError } from '../../store/slices/hrSlice';
import './HR.css';

const HRSettingsPage = () => {
  const dispatch = useDispatch();
  const settings = useSelector(selectHRSettings);
  const loading = useSelector(selectHRLoading);
  const error = useSelector(selectHRError);
  const [form, setForm] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => { dispatch(fetchHRSettings()); }, [dispatch]);
  useEffect(() => { if (settings) setForm(JSON.parse(JSON.stringify(settings))); }, [settings]);

  const handleSave = async () => {
    await dispatch(updateHRSettings(form));
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const updateNested = (path, value) => {
    const newForm = JSON.parse(JSON.stringify(form));
    const keys = path.split('.');
    let obj = newForm;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!obj[keys[i]]) obj[keys[i]] = {};
      obj = obj[keys[i]];
    }
    obj[keys[keys.length - 1]] = value;
    setForm(newForm);
  };

  if (loading || !form) return <div className="hr-page"><div className="hr-loading">Loading settings...</div></div>;

  return (
    <div className="hr-page">
      <div className="hr-header">
        <h1>HR Settings</h1>
        <button className="btn-primary" onClick={handleSave}>Save Settings</button>
      </div>

      {error && <div className="hr-error">{error}</div>}
      {saved && <div style={{ background: 'var(--status-success-bg)', color: 'var(--status-success)', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px' }}>Settings saved successfully!</div>}

      {/* Academic Year */}
      <div className="hr-card">
        <h3>General</h3>
        <div className="hr-form-group">
          <label>Current Academic Year</label>
          <input value={form.currentAcademicYear || ''} onChange={(e) => setForm({ ...form, currentAcademicYear: e.target.value })} placeholder="e.g. 2025-2026" />
        </div>
      </div>

      {/* Leave Policy */}
      <div className="hr-card">
        <h3>Leave Policy</h3>
        <div className="hr-form-row">
          <div className="hr-form-group">
            <label>Year Start Month (1-12)</label>
            <input type="number" min={1} max={12} value={form.leavePolicy?.yearStartMonth || 9}
              onChange={(e) => updateNested('leavePolicy.yearStartMonth', Number(e.target.value))} />
          </div>
          <div className="hr-form-group">
            <label>Min Days for Document Required</label>
            <input type="number" min={0} value={form.leavePolicy?.minDaysForDocumentRequired || 3}
              onChange={(e) => updateNested('leavePolicy.minDaysForDocumentRequired', Number(e.target.value))} />
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginTop: '8px' }}>
          {[
            ['leavePolicy.autoAllocateOnYearStart', 'Auto-Allocate on Year Start'],
            ['leavePolicy.allowCarryOverGlobal', 'Allow Carry Over (Global)'],
            ['leavePolicy.excludeHolidaysFromCount', 'Exclude Holidays from Count'],
          ].map(([path, label]) => (
            <label key={path} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}>
              <input type="checkbox"
                checked={path.split('.').reduce((o, k) => o?.[k], form) || false}
                onChange={(e) => updateNested(path, e.target.checked)} />
              {label}
            </label>
          ))}
        </div>
      </div>

      {/* Contract Policy */}
      <div className="hr-card">
        <h3>Contract Policy</h3>
        <div className="hr-form-row">
          <div className="hr-form-group">
            <label>Renewal Alert Days</label>
            <input type="number" min={1} value={form.contractPolicy?.renewalAlertDays || 60}
              onChange={(e) => updateNested('contractPolicy.renewalAlertDays', Number(e.target.value))} />
          </div>
          <div className="hr-form-group">
            <label>Probation Duration (months)</label>
            <input type="number" min={0} value={form.contractPolicy?.probationDurationMonths || 3}
              onChange={(e) => updateNested('contractPolicy.probationDurationMonths', Number(e.target.value))} />
          </div>
        </div>
        <div className="hr-form-row">
          <div className="hr-form-group">
            <label>Default Hours/Week</label>
            <input type="number" min={1} value={form.contractPolicy?.defaultHoursPerWeek || 40}
              onChange={(e) => updateNested('contractPolicy.defaultHoursPerWeek', Number(e.target.value))} />
          </div>
        </div>
      </div>

      {/* Certification Policy */}
      <div className="hr-card">
        <h3>Certification Policy</h3>
        <div className="hr-form-group">
          <label>Expiry Alert Days</label>
          <input type="number" min={1} value={form.certificationPolicy?.expiryAlertDays || 30}
            onChange={(e) => updateNested('certificationPolicy.expiryAlertDays', Number(e.target.value))} />
        </div>
      </div>

      {/* PD Policy */}
      <div className="hr-card">
        <h3>Professional Development Policy</h3>
        <div className="hr-form-row">
          <div className="hr-form-group">
            <label>Required Hours/Year</label>
            <input type="number" min={0} value={form.pdPolicy?.requiredHoursPerYear || 0}
              onChange={(e) => updateNested('pdPolicy.requiredHoursPerYear', Number(e.target.value))} />
          </div>
          <div className="hr-form-group">
            <label>Budget Per Staff</label>
            <input type="number" min={0} value={form.pdPolicy?.budgetPerStaff || 0}
              onChange={(e) => updateNested('pdPolicy.budgetPerStaff', Number(e.target.value))} />
          </div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', marginTop: '8px' }}>
          <input type="checkbox" checked={form.pdPolicy?.requireApproval || false}
            onChange={(e) => updateNested('pdPolicy.requireApproval', e.target.checked)} />
          Require Approval for PD Activities
        </label>
      </div>

      {/* Review Defaults */}
      <div className="hr-card">
        <h3>Review Defaults</h3>
        <div className="hr-form-row">
          <div className="hr-form-group">
            <label>Rating Scale (max)</label>
            <input type="number" min={3} max={10} value={form.reviewDefaults?.ratingScale || 5}
              onChange={(e) => updateNested('reviewDefaults.ratingScale', Number(e.target.value))} />
          </div>
          <div className="hr-form-group">
            <label>Review Cycles/Year</label>
            <input type="number" min={1} max={4} value={form.reviewDefaults?.reviewCyclesPerYear || 1}
              onChange={(e) => updateNested('reviewDefaults.reviewCyclesPerYear', Number(e.target.value))} />
          </div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', marginTop: '8px' }}>
          <input type="checkbox" checked={form.reviewDefaults?.selfAssessmentEnabled !== false}
            onChange={(e) => updateNested('reviewDefaults.selfAssessmentEnabled', e.target.checked)} />
          Enable Self-Assessment
        </label>
      </div>

      {/* Employee ID Format */}
      <div className="hr-card">
        <h3>Employee ID Format</h3>
        <div className="hr-form-row">
          <div className="hr-form-group">
            <label>Prefix</label>
            <input value={form.employeeIdFormat?.prefix || 'EMP'}
              onChange={(e) => updateNested('employeeIdFormat.prefix', e.target.value)} />
          </div>
          <div className="hr-form-group">
            <label>Zero Padding</label>
            <input type="number" min={1} max={8} value={form.employeeIdFormat?.zeroPadding || 4}
              onChange={(e) => updateNested('employeeIdFormat.zeroPadding', Number(e.target.value))} />
          </div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', marginTop: '8px' }}>
          <input type="checkbox" checked={form.employeeIdFormat?.autoGenerate !== false}
            onChange={(e) => updateNested('employeeIdFormat.autoGenerate', e.target.checked)} />
          Auto-Generate Employee IDs
        </label>
      </div>

      {/* Notifications */}
      <div className="hr-card">
        <h3>Notification Settings</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {[
            ['notifications.leaveRequestNotifyAdmin', 'Notify admin on new leave request'],
            ['notifications.leaveApprovalNotifyStaff', 'Notify staff on leave approval/rejection'],
            ['notifications.certExpiryNotifyStaff', 'Notify staff on certification expiry'],
            ['notifications.certExpiryNotifyAdmin', 'Notify admin on certification expiry'],
            ['notifications.contractRenewalNotifyAdmin', 'Notify admin on contract renewal due'],
            ['notifications.reviewDueNotifyReviewer', 'Notify reviewer when review is due'],
            ['notifications.reviewDueNotifyStaff', 'Notify staff when review is due'],
          ].map(([path, label]) => (
            <label key={path} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
              <input type="checkbox"
                checked={path.split('.').reduce((o, k) => o?.[k], form) || false}
                onChange={(e) => updateNested(path, e.target.checked)} />
              {label}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
};

export default HRSettingsPage;
