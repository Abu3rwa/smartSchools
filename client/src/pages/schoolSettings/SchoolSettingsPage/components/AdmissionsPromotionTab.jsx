import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

const formatDateValue = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
};

const AdmissionsPromotionTab = ({ settings, loading, saving, onChange, onSave }) => {
  const { t } = useTranslation(['schoolSettings']);

  const reasonCodesValue = useMemo(
    () => (Array.isArray(settings?.reasonCodes) ? settings.reasonCodes.join(', ') : ''),
    [settings?.reasonCodes]
  );

  const approvalRolesValue = useMemo(
    () => (Array.isArray(settings?.approvalWorkflow?.roles) ? settings.approvalWorkflow.roles.join(', ') : ''),
    [settings?.approvalWorkflow?.roles]
  );

  return (
    <div className="card admissions-promotion-settings-card">
      <div className="tab-header">
        <div>
          <h3>{t('schoolSettings:admissionsPromotion.title')}</h3>
          <span>{t('schoolSettings:admissionsPromotion.helpText')}</span>
        </div>
      </div>

      {loading ? (
        <p className="text-muted">{t('schoolSettings:admissionsPromotion.loading')}</p>
      ) : (
        <>
          <div className="wizard-step">
            <label className="communication-toggle-row">
              <input
                type="checkbox"
                checked={Boolean(settings?.enabled)}
                onChange={(event) => onChange({ enabled: event.target.checked })}
              />
              {t('schoolSettings:admissionsPromotion.enabled')}
            </label>
          </div>

          <div className="wizard-step">
            <h4>{t('schoolSettings:admissionsPromotion.promotionPolicyTitle')}</h4>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="minimum-academic-threshold">
                  {t('schoolSettings:admissionsPromotion.minimumAcademicThreshold')}
                </label>
                <input
                  id="minimum-academic-threshold"
                  type="number"
                  min="0"
                  max="100"
                  value={settings?.promotionPolicy?.minimumAcademicThreshold ?? 0}
                  onChange={(event) => onChange({
                    promotionPolicy: {
                      minimumAcademicThreshold: Number(event.target.value)
                    }
                  })}
                />
              </div>
              <div className="form-group">
                <label htmlFor="attendance-minimum-percent">
                  {t('schoolSettings:admissionsPromotion.attendanceMinimumPercent')}
                </label>
                <input
                  id="attendance-minimum-percent"
                  type="number"
                  min="0"
                  max="100"
                  value={settings?.promotionPolicy?.attendanceMinimumPercent ?? 0}
                  onChange={(event) => onChange({
                    promotionPolicy: {
                      attendanceMinimumPercent: Number(event.target.value)
                    }
                  })}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="section-assignment-strategy">
                  {t('schoolSettings:admissionsPromotion.sectionAssignmentStrategy')}
                </label>
                <select
                  id="section-assignment-strategy"
                  value={settings?.sectionAssignmentStrategy || 'manual'}
                  onChange={(event) => onChange({ sectionAssignmentStrategy: event.target.value })}
                >
                  <option value="manual">{t('schoolSettings:admissionsPromotion.strategy.manual')}</option>
                  <option value="capacity_based">{t('schoolSettings:admissionsPromotion.strategy.capacityBased')}</option>
                  <option value="ai_assisted">{t('schoolSettings:admissionsPromotion.strategy.aiAssisted')}</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="approval-depth">{t('schoolSettings:admissionsPromotion.approvalDepth')}</label>
                <input
                  id="approval-depth"
                  type="number"
                  min="1"
                  max="5"
                  value={settings?.approvalWorkflow?.depth ?? 1}
                  onChange={(event) => onChange({
                    approvalWorkflow: {
                      depth: Number(event.target.value)
                    }
                  })}
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="approval-roles">{t('schoolSettings:admissionsPromotion.approvalRoles')}</label>
              <input
                id="approval-roles"
                type="text"
                value={approvalRolesValue}
                onChange={(event) => onChange({
                  approvalWorkflow: {
                    roles: event.target.value
                      .split(',')
                      .map((item) => item.trim().toLowerCase())
                      .filter(Boolean)
                  }
                })}
              />
              <span className="form-hint">{t('schoolSettings:admissionsPromotion.approvalRolesHint')}</span>
            </div>

            <div className="form-row">
              <label className="communication-toggle-row">
                <input
                  type="checkbox"
                  checked={Boolean(settings?.promotionPolicy?.requiredClearanceChecks?.fees)}
                  onChange={(event) => onChange({
                    promotionPolicy: {
                      requiredClearanceChecks: {
                        fees: event.target.checked
                      }
                    }
                  })}
                />
                {t('schoolSettings:admissionsPromotion.clearanceFees')}
              </label>
              <label className="communication-toggle-row">
                <input
                  type="checkbox"
                  checked={Boolean(settings?.promotionPolicy?.requiredClearanceChecks?.library)}
                  onChange={(event) => onChange({
                    promotionPolicy: {
                      requiredClearanceChecks: {
                        library: event.target.checked
                      }
                    }
                  })}
                />
                {t('schoolSettings:admissionsPromotion.clearanceLibrary')}
              </label>
              <label className="communication-toggle-row">
                <input
                  type="checkbox"
                  checked={Boolean(settings?.promotionPolicy?.requiredClearanceChecks?.devices)}
                  onChange={(event) => onChange({
                    promotionPolicy: {
                      requiredClearanceChecks: {
                        devices: event.target.checked
                      }
                    }
                  })}
                />
                {t('schoolSettings:admissionsPromotion.clearanceDevices')}
              </label>
            </div>
          </div>

          <div className="wizard-step">
            <h4>{t('schoolSettings:admissionsPromotion.calendarTitle')}</h4>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="new-admissions-start">
                  {t('schoolSettings:admissionsPromotion.newAdmissionsLockStart')}
                </label>
                <input
                  id="new-admissions-start"
                  type="date"
                  value={formatDateValue(settings?.calendar?.newAdmissionsLockWindow?.startDate)}
                  onChange={(event) => onChange({
                    calendar: {
                      newAdmissionsLockWindow: {
                        startDate: event.target.value || null
                      }
                    }
                  })}
                />
              </div>
              <div className="form-group">
                <label htmlFor="new-admissions-end">
                  {t('schoolSettings:admissionsPromotion.newAdmissionsLockEnd')}
                </label>
                <input
                  id="new-admissions-end"
                  type="date"
                  value={formatDateValue(settings?.calendar?.newAdmissionsLockWindow?.endDate)}
                  onChange={(event) => onChange({
                    calendar: {
                      newAdmissionsLockWindow: {
                        endDate: event.target.value || null
                      }
                    }
                  })}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="returning-admissions-start">
                  {t('schoolSettings:admissionsPromotion.returningAdmissionsLockStart')}
                </label>
                <input
                  id="returning-admissions-start"
                  type="date"
                  value={formatDateValue(settings?.calendar?.returningAdmissionsLockWindow?.startDate)}
                  onChange={(event) => onChange({
                    calendar: {
                      returningAdmissionsLockWindow: {
                        startDate: event.target.value || null
                      }
                    }
                  })}
                />
              </div>
              <div className="form-group">
                <label htmlFor="returning-admissions-end">
                  {t('schoolSettings:admissionsPromotion.returningAdmissionsLockEnd')}
                </label>
                <input
                  id="returning-admissions-end"
                  type="date"
                  value={formatDateValue(settings?.calendar?.returningAdmissionsLockWindow?.endDate)}
                  onChange={(event) => onChange({
                    calendar: {
                      returningAdmissionsLockWindow: {
                        endDate: event.target.value || null
                      }
                    }
                  })}
                />
              </div>
            </div>
          </div>

          <div className="wizard-step">
            <h4>{t('schoolSettings:admissionsPromotion.permissionsTitle')}</h4>
            <label className="communication-toggle-row">
              <input
                type="checkbox"
                checked={Boolean(settings?.permissions?.allowAdmissionsOfficerPlacementOverride)}
                onChange={(event) => onChange({
                  permissions: {
                    allowAdmissionsOfficerPlacementOverride: event.target.checked
                  }
                })}
              />
              {t('schoolSettings:admissionsPromotion.allowPlacementOverride')}
            </label>
            <label className="communication-toggle-row">
              <input
                type="checkbox"
                checked={Boolean(settings?.permissions?.allowFinanceGate)}
                onChange={(event) => onChange({
                  permissions: {
                    allowFinanceGate: event.target.checked
                  }
                })}
              />
              {t('schoolSettings:admissionsPromotion.allowFinanceGate')}
            </label>
          </div>

          <div className="wizard-step">
            <h4>{t('schoolSettings:admissionsPromotion.reasonCodesTitle')}</h4>
            <div className="form-group">
              <label htmlFor="reason-codes">{t('schoolSettings:admissionsPromotion.reasonCodes')}</label>
              <textarea
                id="reason-codes"
                rows={4}
                value={reasonCodesValue}
                onChange={(event) => onChange({
                  reasonCodes: event.target.value
                    .split(',')
                    .map((item) => item.trim().toUpperCase())
                    .filter(Boolean)
                })}
              />
              <span className="form-hint">{t('schoolSettings:admissionsPromotion.reasonCodesHint')}</span>
            </div>
          </div>

          <button className="btn btn-primary" onClick={onSave} disabled={saving}>
            {saving ? t('schoolSettings:common.saving') : t('schoolSettings:admissionsPromotion.save')}
          </button>
        </>
      )}
    </div>
  );
};

export default AdmissionsPromotionTab;
