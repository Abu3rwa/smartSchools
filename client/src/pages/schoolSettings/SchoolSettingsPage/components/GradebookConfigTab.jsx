import { useState, useCallback, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlineChevronDown,
  HiOutlineChevronUp,
  HiOutlineDuplicate,
  HiOutlineArrowUp,
  HiOutlineArrowDown
} from 'react-icons/hi';
import {
  fetchGradebookConfig,
  saveGradebookConfig,
  cloneGradebookConfig,
  selectGradebookConfig,
  selectGradebookConfigLoading,
  selectGradebookConfigSaving,
  selectGradebookConfigError
} from '../../../../store/slices/gradebookConfigSlice';
import { selectCurrentAcademicYear } from '../../../../store/slices/uiSlice';

const EMPTY_SEMESTER = {
  number: 1,
  label: 'Semester 1',
  labelAr: '',
  startDate: '',
  endDate: '',
  examPeriods: [],
  courseworkWeight: 100
};

const EMPTY_EXAM_PERIOD = {
  type: 'midterm',
  label: 'Midterm Exam',
  labelAr: '',
  startDate: '',
  endDate: '',
  weight: 30
};

const EMPTY_CATEGORY = {
  key: '',
  label: '',
  labelAr: '',
  color: '#64748b',
  isExam: false,
  sortOrder: 0,
  isActive: true
};

const DEFAULT_GRADING_POLICY = {
  passingPercentage: 50,
  allowExtraCredit: true,
  roundingMode: 'round',
  decimalPlaces: 2,
  showLetterGrades: true,
  showPercentages: true
};

const toInputDate = (dateStr) => {
  if (!dateStr) return '';
  return new Date(dateStr).toISOString().split('T')[0];
};

const GradebookConfigTab = () => {
  const { t } = useTranslation(['schoolSettings']);
  const dispatch = useDispatch();
  const config = useSelector(selectGradebookConfig);
  const loading = useSelector(selectGradebookConfigLoading);
  const saving = useSelector(selectGradebookConfigSaving);
  const error = useSelector(selectGradebookConfigError);
  const currentAcademicYear = useSelector(selectCurrentAcademicYear);

  const [localConfig, setLocalConfig] = useState(null);
  const [expandedSemesters, setExpandedSemesters] = useState({});
  const [cloneYear, setCloneYear] = useState('');
  const [showCloneDialog, setShowCloneDialog] = useState(false);

  useEffect(() => {
    if (currentAcademicYear) {
      dispatch(fetchGradebookConfig(currentAcademicYear));
    }
  }, [dispatch, currentAcademicYear]);

  useEffect(() => {
    if (config) {
      setLocalConfig({
        semesters: config.semesters?.length ? config.semesters.map(s => ({
          ...s,
          startDate: toInputDate(s.startDate),
          endDate: toInputDate(s.endDate),
          examPeriods: (s.examPeriods || []).map(ep => ({
            ...ep,
            startDate: toInputDate(ep.startDate),
            endDate: toInputDate(ep.endDate)
          }))
        })) : [],
        categories: config.categories || [],
        gradingPolicy: { ...DEFAULT_GRADING_POLICY, ...config.gradingPolicy }
      });
    } else if (!loading) {
      setLocalConfig({
        semesters: [],
        categories: [],
        gradingPolicy: { ...DEFAULT_GRADING_POLICY }
      });
    }
  }, [config, loading]);

  const handleSave = useCallback(async () => {
    if (!localConfig || !currentAcademicYear) return;
    try {
      await dispatch(saveGradebookConfig({
        id: config?._id,
        data: {
          academicYear: currentAcademicYear,
          ...localConfig
        }
      })).unwrap();
      toast.success(t('schoolSettings:gradebookConfig.saved', 'Gradebook configuration saved'));
    } catch (err) {
      toast.error(err || t('schoolSettings:gradebookConfig.saveFailed', 'Failed to save configuration'));
    }
  }, [localConfig, config, currentAcademicYear, dispatch, t]);

  const handleClone = useCallback(async () => {
    if (!config?._id || !cloneYear) return;
    try {
      await dispatch(cloneGradebookConfig({ id: config._id, academicYear: cloneYear })).unwrap();
      toast.success(t('schoolSettings:gradebookConfig.cloned', 'Configuration cloned successfully'));
      setShowCloneDialog(false);
      setCloneYear('');
    } catch (err) {
      toast.error(err || t('schoolSettings:gradebookConfig.cloneFailed', 'Failed to clone configuration'));
    }
  }, [config, cloneYear, dispatch, t]);

  // --- Semester handlers ---
  const addSemester = () => {
    const semNum = (localConfig.semesters?.length || 0) + 1;
    if (semNum > 2) return;
    setLocalConfig(prev => ({
      ...prev,
      semesters: [...prev.semesters, {
        ...EMPTY_SEMESTER,
        number: semNum,
        label: `Semester ${semNum}`
      }]
    }));
    setExpandedSemesters(prev => ({ ...prev, [semNum - 1]: true }));
  };

  const removeSemester = (idx) => {
    setLocalConfig(prev => ({
      ...prev,
      semesters: prev.semesters.filter((_, i) => i !== idx)
    }));
  };

  const updateSemester = (idx, field, value) => {
    setLocalConfig(prev => ({
      ...prev,
      semesters: prev.semesters.map((s, i) => i === idx ? { ...s, [field]: value } : s)
    }));
  };

  const toggleSemester = (idx) => {
    setExpandedSemesters(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  // --- Exam Period handlers ---
  const addExamPeriod = (semIdx) => {
    setLocalConfig(prev => ({
      ...prev,
      semesters: prev.semesters.map((s, i) => i === semIdx ? {
        ...s,
        examPeriods: [...s.examPeriods, { ...EMPTY_EXAM_PERIOD }]
      } : s)
    }));
  };

  const removeExamPeriod = (semIdx, epIdx) => {
    setLocalConfig(prev => ({
      ...prev,
      semesters: prev.semesters.map((s, i) => i === semIdx ? {
        ...s,
        examPeriods: s.examPeriods.filter((_, j) => j !== epIdx)
      } : s)
    }));
  };

  const updateExamPeriod = (semIdx, epIdx, field, value) => {
    setLocalConfig(prev => ({
      ...prev,
      semesters: prev.semesters.map((s, i) => i === semIdx ? {
        ...s,
        examPeriods: s.examPeriods.map((ep, j) => j === epIdx ? { ...ep, [field]: value } : ep)
      } : s)
    }));
  };

  // --- Category handlers ---
  const addCategory = () => {
    const nextOrder = (localConfig.categories?.length || 0) + 1;
    setLocalConfig(prev => ({
      ...prev,
      categories: [...prev.categories, { ...EMPTY_CATEGORY, sortOrder: nextOrder }]
    }));
  };

  const removeCategory = (idx) => {
    setLocalConfig(prev => ({
      ...prev,
      categories: prev.categories.filter((_, i) => i !== idx)
    }));
  };

  const updateCategory = (idx, field, value) => {
    setLocalConfig(prev => ({
      ...prev,
      categories: prev.categories.map((c, i) => i === idx ? { ...c, [field]: value } : c)
    }));
  };

  const moveCategoryUp = (idx) => {
    if (idx === 0) return;
    setLocalConfig(prev => {
      const cats = [...prev.categories];
      [cats[idx - 1], cats[idx]] = [cats[idx], cats[idx - 1]];
      return { ...prev, categories: cats.map((c, i) => ({ ...c, sortOrder: i + 1 })) };
    });
  };

  const moveCategoryDown = (idx) => {
    setLocalConfig(prev => {
      if (idx >= prev.categories.length - 1) return prev;
      const cats = [...prev.categories];
      [cats[idx], cats[idx + 1]] = [cats[idx + 1], cats[idx]];
      return { ...prev, categories: cats.map((c, i) => ({ ...c, sortOrder: i + 1 })) };
    });
  };

  // --- Grading Policy handlers ---
  const updatePolicy = (field, value) => {
    setLocalConfig(prev => ({
      ...prev,
      gradingPolicy: { ...prev.gradingPolicy, [field]: value }
    }));
  };

  if (loading) {
    return (
      <div className="card">
        <p className="text-muted">Loading gradebook configuration...</p>
      </div>
    );
  }

  if (!localConfig) return null;

  return (
    <div className="card admissions-promotion-settings-card">
      <div className="tab-header">
        <div>
          <h3>{t('schoolSettings:gradebookConfig.title', 'Gradebook Configuration')}</h3>
          <span>{t('schoolSettings:gradebookConfig.helpText', 'Configure semester structure, exam periods, grade categories, and grading policies for the current academic year.')}</span>
        </div>
        {config?._id && (
          <button
            className="btn btn-outline-secondary btn-sm"
            onClick={() => setShowCloneDialog(!showCloneDialog)}
            title="Clone this configuration to another academic year"
          >
            <HiOutlineDuplicate size={16} style={{ marginRight: 4 }} />
            Clone to Year
          </button>
        )}
      </div>

      {error && <div className="alert alert-danger" style={{ margin: '12px 0' }}>{error}</div>}

      {showCloneDialog && (
        <div className="wizard-step" style={{ background: '#f8fafc', borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <h4 style={{ marginTop: 0 }}>Clone Configuration</h4>
          <div className="form-group" style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
            <div>
              <label htmlFor="clone-year">Target Academic Year</label>
              <input
                id="clone-year"
                type="text"
                placeholder="e.g. 2025-2026"
                value={cloneYear}
                onChange={(e) => setCloneYear(e.target.value)}
                style={{ width: 180 }}
              />
            </div>
            <button className="btn btn-primary btn-sm" onClick={handleClone} disabled={saving || !cloneYear}>
              {saving ? 'Cloning...' : 'Clone'}
            </button>
            <button className="btn btn-outline-secondary btn-sm" onClick={() => setShowCloneDialog(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div style={{ marginBottom: 8, color: '#6b7280', fontSize: 13 }}>
        Academic Year: <strong>{currentAcademicYear || 'Not set'}</strong>
        {config?._id && <span style={{ marginLeft: 12 }} className="badge badge-success">Saved</span>}
        {!config?._id && <span style={{ marginLeft: 12 }} className="badge badge-warning">New — Not yet saved</span>}
      </div>

      {/* ── SECTION 1: Semesters ── */}
      <div className="wizard-step" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h4 style={{ margin: 0 }}>Semesters</h4>
          {localConfig.semesters.length < 2 && (
            <button className="btn btn-outline-primary btn-sm" onClick={addSemester}>
              <HiOutlinePlus size={14} style={{ marginRight: 4 }} /> Add Semester
            </button>
          )}
        </div>

        {localConfig.semesters.length === 0 && (
          <p className="text-muted" style={{ fontSize: 13 }}>
            No semesters configured. Add semesters to define the academic year structure and enable automatic semester detection for grades.
          </p>
        )}

        {localConfig.semesters.map((semester, semIdx) => (
          <div key={semIdx} style={{ border: '1px solid #e5e7eb', borderRadius: 8, marginBottom: 12, overflow: 'hidden' }}>
            <div
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 14px', background: '#f9fafb', cursor: 'pointer'
              }}
              onClick={() => toggleSemester(semIdx)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {expandedSemesters[semIdx] ? <HiOutlineChevronUp size={16} /> : <HiOutlineChevronDown size={16} />}
                <strong>{semester.label || `Semester ${semester.number}`}</strong>
                {semester.startDate && semester.endDate && (
                  <span style={{ color: '#6b7280', fontSize: 12 }}>
                    ({semester.startDate} → {semester.endDate})
                  </span>
                )}
              </div>
              <button
                className="btn btn-outline-danger btn-sm"
                onClick={(e) => { e.stopPropagation(); removeSemester(semIdx); }}
                title="Remove semester"
              >
                <HiOutlineTrash size={14} />
              </button>
            </div>

            {expandedSemesters[semIdx] && (
              <div style={{ padding: '14px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Label (English)</label>
                    <input
                      type="text"
                      value={semester.label}
                      onChange={(e) => updateSemester(semIdx, 'label', e.target.value)}
                      placeholder="Semester 1"
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Label (Arabic)</label>
                    <input
                      type="text"
                      value={semester.labelAr || ''}
                      onChange={(e) => updateSemester(semIdx, 'labelAr', e.target.value)}
                      placeholder="الفصل الأول"
                      dir="rtl"
                    />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Start Date</label>
                    <input
                      type="date"
                      value={semester.startDate}
                      onChange={(e) => updateSemester(semIdx, 'startDate', e.target.value)}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>End Date</label>
                    <input
                      type="date"
                      value={semester.endDate}
                      onChange={(e) => updateSemester(semIdx, 'endDate', e.target.value)}
                    />
                  </div>
                </div>

                {/* Exam Periods within Semester */}
                <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <h5 style={{ margin: 0, fontSize: 14 }}>Exam Periods</h5>
                    <button className="btn btn-outline-primary btn-sm" onClick={() => addExamPeriod(semIdx)}>
                      <HiOutlinePlus size={12} style={{ marginRight: 4 }} /> Add Exam Period
                    </button>
                  </div>

                  {semester.examPeriods.length === 0 && (
                    <p className="text-muted" style={{ fontSize: 12 }}>No exam periods configured for this semester.</p>
                  )}

                  {semester.examPeriods.map((ep, epIdx) => {
                    const totalExamWeight = semester.examPeriods.reduce((sum, p) => sum + (p.weight || 0), 0);
                    return (
                      <div key={epIdx} style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: 12, marginBottom: 8, background: '#fefefe' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <span style={{ fontWeight: 500, fontSize: 13 }}>{ep.label || ep.type}</span>
                          <button
                            className="btn btn-outline-danger btn-sm"
                            onClick={() => removeExamPeriod(semIdx, epIdx)}
                          >
                            <HiOutlineTrash size={12} />
                          </button>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label style={{ fontSize: 12 }}>Type</label>
                            <select
                              value={ep.type}
                              onChange={(e) => updateExamPeriod(semIdx, epIdx, 'type', e.target.value)}
                            >
                              <option value="midterm">Midterm</option>
                              <option value="final">Final</option>
                            </select>
                          </div>
                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label style={{ fontSize: 12 }}>Label</label>
                            <input
                              type="text"
                              value={ep.label}
                              onChange={(e) => updateExamPeriod(semIdx, epIdx, 'label', e.target.value)}
                              placeholder="Midterm Exam"
                            />
                          </div>
                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label style={{ fontSize: 12 }}>Weight (%)</label>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={ep.weight}
                              onChange={(e) => updateExamPeriod(semIdx, epIdx, 'weight', Number(e.target.value))}
                            />
                          </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label style={{ fontSize: 12 }}>Start Date</label>
                            <input
                              type="date"
                              value={ep.startDate}
                              onChange={(e) => updateExamPeriod(semIdx, epIdx, 'startDate', e.target.value)}
                            />
                          </div>
                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label style={{ fontSize: 12 }}>End Date</label>
                            <input
                              type="date"
                              value={ep.endDate}
                              onChange={(e) => updateExamPeriod(semIdx, epIdx, 'endDate', e.target.value)}
                            />
                          </div>
                        </div>
                        {totalExamWeight > 100 && (
                          <div style={{ color: '#dc2626', fontSize: 12, marginTop: 6 }}>
                            Total exam weight exceeds 100% ({totalExamWeight}%)
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {semester.examPeriods.length > 0 && (
                    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                      Coursework weight: <strong>{100 - semester.examPeriods.reduce((sum, p) => sum + (p.weight || 0), 0)}%</strong>
                      {' | '}Exam weight: <strong>{semester.examPeriods.reduce((sum, p) => sum + (p.weight || 0), 0)}%</strong>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── SECTION 2: Grade Categories ── */}
      <div className="wizard-step" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h4 style={{ margin: 0 }}>Grade Categories</h4>
          <button className="btn btn-outline-primary btn-sm" onClick={addCategory}>
            <HiOutlinePlus size={14} style={{ marginRight: 4 }} /> Add Category
          </button>
        </div>

        {localConfig.categories.length === 0 && (
          <p className="text-muted" style={{ fontSize: 13 }}>
            No categories configured. Default categories will be used when the configuration is first saved.
          </p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {localConfig.categories.map((cat, idx) => (
            <div
              key={idx}
              style={{
                display: 'grid',
                gridTemplateColumns: '32px 40px 1fr 1fr 120px 60px 60px 32px 32px',
                gap: 8,
                alignItems: 'center',
                padding: '6px 8px',
                border: '1px solid #e5e7eb',
                borderRadius: 6,
                background: cat.isActive ? '#fff' : '#f3f4f6',
                opacity: cat.isActive ? 1 : 0.6
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <button
                  className="btn btn-sm"
                  onClick={() => moveCategoryUp(idx)}
                  disabled={idx === 0}
                  style={{ padding: '1px 4px', lineHeight: 1 }}
                  title="Move up"
                >
                  <HiOutlineArrowUp size={10} />
                </button>
                <button
                  className="btn btn-sm"
                  onClick={() => moveCategoryDown(idx)}
                  disabled={idx === localConfig.categories.length - 1}
                  style={{ padding: '1px 4px', lineHeight: 1 }}
                  title="Move down"
                >
                  <HiOutlineArrowDown size={10} />
                </button>
              </div>
              <input
                type="color"
                value={cat.color || '#64748b'}
                onChange={(e) => updateCategory(idx, 'color', e.target.value)}
                title="Category color"
                style={{ width: 32, height: 28, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}
              />
              <input
                type="text"
                value={cat.label}
                onChange={(e) => {
                  updateCategory(idx, 'label', e.target.value);
                  if (!cat.key || cat.key === cat.label.toLowerCase().replace(/\s+/g, '_')) {
                    updateCategory(idx, 'key', e.target.value.toLowerCase().replace(/\s+/g, '_'));
                  }
                }}
                placeholder="Category name"
                style={{ fontSize: 13 }}
              />
              <input
                type="text"
                value={cat.labelAr || ''}
                onChange={(e) => updateCategory(idx, 'labelAr', e.target.value)}
                placeholder="الاسم بالعربية"
                dir="rtl"
                style={{ fontSize: 13 }}
              />
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer', margin: 0 }}>
                <input
                  type="checkbox"
                  checked={cat.isExam || false}
                  onChange={(e) => updateCategory(idx, 'isExam', e.target.checked)}
                />
                Is Exam
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer', margin: 0 }}>
                <input
                  type="checkbox"
                  checked={cat.isActive !== false}
                  onChange={(e) => updateCategory(idx, 'isActive', e.target.checked)}
                />
                Active
              </label>
              <span style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center' }}>#{cat.sortOrder}</span>
              <button
                className="btn btn-outline-danger btn-sm"
                onClick={() => removeCategory(idx)}
                style={{ padding: '2px 6px' }}
                title="Remove category"
              >
                <HiOutlineTrash size={12} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ── SECTION 3: Grading Policy ── */}
      <div className="wizard-step" style={{ marginTop: 16 }}>
        <h4 style={{ marginBottom: 12 }}>Grading Policy</h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          <div className="form-group">
            <label>Passing Percentage</label>
            <input
              type="number"
              min={0}
              max={100}
              value={localConfig.gradingPolicy.passingPercentage}
              onChange={(e) => updatePolicy('passingPercentage', Number(e.target.value))}
            />
            <span className="form-hint">Minimum score to pass (0-100)</span>
          </div>
          <div className="form-group">
            <label>Rounding Mode</label>
            <select
              value={localConfig.gradingPolicy.roundingMode}
              onChange={(e) => updatePolicy('roundingMode', e.target.value)}
            >
              <option value="round">Round (standard)</option>
              <option value="floor">Floor (round down)</option>
              <option value="ceil">Ceil (round up)</option>
            </select>
          </div>
          <div className="form-group">
            <label>Decimal Places</label>
            <input
              type="number"
              min={0}
              max={4}
              value={localConfig.gradingPolicy.decimalPlaces}
              onChange={(e) => updatePolicy('decimalPlaces', Number(e.target.value))}
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 24, marginTop: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={localConfig.gradingPolicy.showLetterGrades}
              onChange={(e) => updatePolicy('showLetterGrades', e.target.checked)}
            />
            Show Letter Grades
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={localConfig.gradingPolicy.showPercentages}
              onChange={(e) => updatePolicy('showPercentages', e.target.checked)}
            />
            Show Percentages
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={localConfig.gradingPolicy.allowExtraCredit}
              onChange={(e) => updatePolicy('allowExtraCredit', e.target.checked)}
            />
            Allow Extra Credit
          </label>
        </div>
      </div>

      {/* ── Save Button ── */}
      <div style={{ marginTop: 20, display: 'flex', gap: 12 }}>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : (config?._id ? 'Update Configuration' : 'Save Configuration')}
        </button>
      </div>
    </div>
  );
};

export default GradebookConfigTab;
