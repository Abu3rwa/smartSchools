import { useMemo } from 'react';

const SchoolYearTab = ({
  academicYears,
  fromYear,
  toYear,
  setFromYear,
  setToYear,
  rolloverLoading,
  classesCreated,
  deactivateCount,
  promoteResult,
  currentAcademicYear,
  onCopyClasses,
  onDeactivateYear,
  onPromoteStudents,
  onSwitchToNewYear,
  schoolYearStartDate,
  schoolYearEndDate,
  setSchoolYearStartDate,
  setSchoolYearEndDate,
  schoolYearDatesSaving,
  academicYearSaving,
  onSaveSchoolYearDates,
  onNavigateClasses,
  onEditUsersTab
}) => {
  const sortedYears = useMemo(() => [...academicYears].sort(), [academicYears]);

  return (
    <div className="tab-content">
      <div className="tab-header">
        <span>
          Set up a new school year: create classes from the previous year, deactivate old classes, and promote students. Then assign teachers and principals for the new year.
        </span>
      </div>
      <div className="rollover-wizard card">
        <div className="wizard-step">
          <h4>0. Set school year dates</h4>
          <p className="text-muted">These dates are used for performance trends and reports.</p>
          <div className="form-row">
            <div className="form-group">
              <label>Start date</label>
              <input type="date" value={schoolYearStartDate} onChange={(event) => setSchoolYearStartDate(event.target.value)} />
            </div>
            <div className="form-group">
              <label>End date</label>
              <input type="date" value={schoolYearEndDate} onChange={(event) => setSchoolYearEndDate(event.target.value)} />
            </div>
          </div>
          <button
            className="btn btn-primary"
            onClick={onSaveSchoolYearDates}
            disabled={schoolYearDatesSaving || !schoolYearStartDate || !schoolYearEndDate}
          >
            {schoolYearDatesSaving ? 'Saving...' : 'Save school year dates'}
          </button>
        </div>
        <div className="wizard-step">
          <h4>1. Choose years</h4>
          <div className="form-row">
            <div className="form-group">
              <label>From (previous year)</label>
              <select value={fromYear} onChange={(event) => setFromYear(event.target.value)}>
                <option value="">— Select —</option>
                {sortedYears.map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>To (new year)</label>
              <input
                type="text"
                value={toYear}
                onChange={(event) => setToYear(event.target.value)}
                placeholder="e.g. 2026-2027"
              />
            </div>
          </div>
        </div>
        <div className="wizard-step">
          <h4>2. Create classes for new year</h4>
          <p className="text-muted">Creates classes with the same grade/section structure. Teachers are not copied — assign them after.</p>
          <button className="btn btn-primary" onClick={onCopyClasses} disabled={rolloverLoading || !fromYear || !toYear}>
            {rolloverLoading ? 'Creating...' : 'Create classes from previous year'}
          </button>
          {classesCreated !== null && <p className="result-msg">Created {classesCreated} classes.</p>}
        </div>
        <div className="wizard-step">
          <h4>3. Deactivate previous year classes (optional)</h4>
          <p className="text-muted">Marks all classes for the selected year as inactive. Past data is kept.</p>
          <button className="btn btn-secondary" onClick={onDeactivateYear} disabled={rolloverLoading || !fromYear}>
            {rolloverLoading ? 'Updating...' : `Deactivate all classes for ${fromYear || '…'}`}
          </button>
          {deactivateCount !== null && <p className="result-msg">Deactivated {deactivateCount} classes.</p>}
        </div>
        <div className="wizard-step">
          <h4>4. Promote students</h4>
          <p className="text-muted">Moves active students to the next grade in the new year. Grade 12 students are marked graduated. Enrollment history is preserved.</p>
          <button className="btn btn-primary" onClick={onPromoteStudents} disabled={rolloverLoading || !fromYear || !toYear}>
            {rolloverLoading ? 'Promoting...' : 'Promote students to next grade'}
          </button>
          {promoteResult && (
            <div className="result-msg">
              <p>Promoted: {promoteResult.promoted} · Graduated: {promoteResult.graduated} · Skipped: {promoteResult.skipped}</p>
              {promoteResult.errors?.length > 0 && (
                <details>
                  <summary>Errors</summary>
                  <ul>{promoteResult.errors.map((errorItem, index) => <li key={index}>{errorItem}</li>)}</ul>
                </details>
              )}
            </div>
          )}
        </div>
        <div className="wizard-step">
          <h4>5. Switch to new year</h4>
          <p className="text-muted">Current school academic year: <strong>{currentAcademicYear}</strong></p>
          <button className="btn btn-primary" onClick={onSwitchToNewYear} disabled={!toYear || academicYearSaving}>
            {academicYearSaving ? 'Switching...' : `Switch to ${toYear || 'new year'}`}
          </button>
        </div>
        <div className="wizard-step">
          <h4>6. Assign teachers and principals</h4>
          <p className="text-muted">Edit the new year&apos;s classes and user roles.</p>
          <button className="btn btn-secondary" onClick={onNavigateClasses}>Edit classes</button>
          <span style={{ marginLeft: 8 }} />
          <button className="btn btn-secondary" onClick={onEditUsersTab}>Edit users & roles</button>
        </div>
      </div>
    </div>
  );
};

export default SchoolYearTab;