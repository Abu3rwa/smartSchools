import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchProgressTable,
  sendProgressTable,
  clearSendResult,
  clearProgressTable,
} from '../../../store/slices/standardAssessmentSlice';
import { fetchClasses, selectClasses } from '../../../store/slices/classSlice';
import { fetchStudentsByClass, selectClassStudents } from '../../../store/slices/studentSlice';
import { fetchSubjects, selectSubjects } from '../../../store/slices/subjectSlice';
import './AssessmentProgressPage.css';

const AssessmentProgressPage = ({ embedded }) => {
  const dispatch = useDispatch();
  const { rows, loading, error } = useSelector((state) => state.standardAssessment.progressTable);
  const sendResult = useSelector((state) => state.standardAssessment.sendResult);

  const classes = useSelector(selectClasses);
  const classStudents = useSelector(selectClassStudents);
  const subjects = useSelector(selectSubjects);

  const [filters, setFilters] = useState({
    classId: '', studentId: '', subjectId: '', dateFrom: '', dateTo: '',
  });

  const [selectedRowIds, setSelectedRowIds] = useState(new Set());
  const [showSendModal, setShowSendModal] = useState(false);
  const [sendForm, setSendForm] = useState({
    sendToStudent: true, sendToParent: true, teacherNote: '',
  });
  const [sending, setSending] = useState(false);
  const [validationMessage, setValidationMessage] = useState('');

  // Fetch reference data on mount
  useEffect(() => {
    dispatch(fetchClasses());
    dispatch(fetchSubjects());
  }, [dispatch]);

  // Load students when class changes
  useEffect(() => {
    if (filters.classId) {
      dispatch(fetchStudentsByClass(filters.classId));
    }
  }, [dispatch, filters.classId]);

  // Students for selected class (from store)
  const filteredClassStudents = useMemo(() => {
    if (!filters.classId) return [];
    return Array.isArray(classStudents) ? classStudents : [];
  }, [classStudents, filters.classId]);

  // Filtered subjects — scope to class when possible
  const filteredSubjects = useMemo(() => {
    const list = Array.isArray(subjects) ? subjects : [];
    if (!filters.classId) return list;
    const selectedClass = (Array.isArray(classes) ? classes : []).find(
      (c) => String(c._id) === String(filters.classId)
    );
    if (selectedClass?.subjects?.length) {
      const ids = new Set(selectedClass.subjects.map((s) => String(s._id || s)));
      return list.filter((s) => ids.has(String(s._id)));
    }
    return list;
  }, [subjects, classes, filters.classId]);

  const normalizedStudentId = String(filters.studentId || '').trim();
  const normalizedClassId = String(filters.classId || '').trim();
  const canQueryProgress = Boolean(normalizedStudentId);

  const loadTable = useCallback(() => {
    if (!canQueryProgress) {
      setValidationMessage('Student is required to load standards progress.');
      dispatch(clearProgressTable());
      return;
    }

    setValidationMessage('');
    const params = {};
    if (normalizedClassId) params.classId = normalizedClassId;
    params.studentId = normalizedStudentId;
    if (filters.subjectId) params.subjectId = String(filters.subjectId).trim();
    if (filters.dateFrom) params.dateFrom = filters.dateFrom;
    if (filters.dateTo) params.dateTo = filters.dateTo;
    dispatch(fetchProgressTable(params));
  }, [
    canQueryProgress,
    dispatch,
    filters.dateFrom,
    filters.dateTo,
    filters.subjectId,
    normalizedClassId,
    normalizedStudentId,
  ]);

  useEffect(() => {
    dispatch(clearProgressTable());
  }, [dispatch]);

  const handleFilterChange = (key, value) => {
    if (validationMessage) {
      setValidationMessage('');
    }
    if (key === 'classId') {
      // Reset student when class changes
      setFilters((prev) => ({ ...prev, classId: value, studentId: '' }));
      return;
    }
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const toggleRow = (id) => {
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllRows = () => {
    if (selectedRowIds.size === rows.length) {
      setSelectedRowIds(new Set());
    } else {
      setSelectedRowIds(new Set(rows.map((r) => r.standardId)));
    }
  };

  const getScoreClass = (score) => {
    if (score >= 80) return 'score-high';
    if (score >= 60) return 'score-mid';
    return 'score-low';
  };

  const handleSend = async () => {
    if (selectedRowIds.size === 0) return;
    if (!canQueryProgress) {
      setValidationMessage('Student is required before sending progress.');
      return;
    }

    const selectedRows = rows.filter((row) => selectedRowIds.has(row.standardId));
    if (selectedRows.length === 0) return;

    setSending(true);
    try {
      await dispatch(sendProgressTable({
        studentId: normalizedStudentId,
        classId: normalizedClassId || undefined,
        subjectId: filters.subjectId ? String(filters.subjectId).trim() : undefined,
        selectedRows,
        sendToStudent: sendForm.sendToStudent,
        sendToParent: sendForm.sendToParent,
        optionalMessage: sendForm.teacherNote || undefined,
      })).unwrap();
      setShowSendModal(false);
      setSelectedRowIds(new Set());
      setSendForm({ sendToStudent: true, sendToParent: true, teacherNote: '' });
    } catch {
      // Error in Redux
    }
    setSending(false);
  };

  return (
    <div className={embedded ? 'progress-table-page progress-table-page--embedded' : 'progress-table-page'}>
      <div className="progress-header">
        <h1>Standards Progress Table</h1>
        {selectedRowIds.size > 0 && (
          <button className="btn-primary" onClick={() => setShowSendModal(true)}>
            Send Progress ({selectedRowIds.size} standards)
          </button>
        )}
      </div>

      {validationMessage && <div className="error-banner">{validationMessage}</div>}
      {error && !validationMessage && <div className="error-banner">{error}</div>}
      {sendResult.success && (
        <div className="success-banner">
          Progress sent successfully!
          <button onClick={() => dispatch(clearSendResult())} style={{ marginLeft: 8, cursor: 'pointer', background: 'none', border: 'none', fontWeight: 700 }}>×</button>
        </div>
      )}

      {/* Filters */}
      <div className="progress-filters">
        <div className="filter-group">
          <label>Class</label>
          <select value={filters.classId} onChange={(e) => handleFilterChange('classId', e.target.value)}>
            <option value="">— Select Class —</option>
            {(Array.isArray(classes) ? classes : []).map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}{c.grade ? ` (Grade ${c.grade})` : ''}{c.section ? ` - ${c.section}` : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label>Student *</label>
          <select
            value={filters.studentId}
            onChange={(e) => handleFilterChange('studentId', e.target.value)}
            disabled={!filters.classId}
          >
            <option value="">{filters.classId ? '— Select Student —' : '— Select a class first —'}</option>
            {filteredClassStudents.map((s) => (
              <option key={s._id} value={s._id}>
                {s.name || `${s.firstName || ''} ${s.lastName || ''}`.trim() || s._id}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label>Subject</label>
          <select value={filters.subjectId} onChange={(e) => handleFilterChange('subjectId', e.target.value)}>
            <option value="">— All Subjects —</option>
            {filteredSubjects.map((s) => (
              <option key={s._id} value={s._id}>
                {s.name}{s.code ? ` (${s.code})` : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label>From</label>
          <input type="date" value={filters.dateFrom} onChange={(e) => handleFilterChange('dateFrom', e.target.value)} />
        </div>
        <div className="filter-group">
          <label>To</label>
          <input type="date" value={filters.dateTo} onChange={(e) => handleFilterChange('dateTo', e.target.value)} />
        </div>
        <div className="filter-group" style={{ justifyContent: 'flex-end' }}>
          <label>&nbsp;</label>
          <button className="btn-secondary" onClick={loadTable}>Refresh</button>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="loading-state">Loading progress data...</div>
      ) : rows.length === 0 ? (
        <div className="empty-state">
          <h3>No progress data</h3>
          <p>{canQueryProgress ? 'No standards progress matched the current filters.' : 'Select a student and click Refresh to view standards progress.'}</p>
        </div>
      ) : (
        <table className="progress-table">
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  className="row-select-checkbox"
                  checked={selectedRowIds.size === rows.length && rows.length > 0}
                  onChange={toggleAllRows}
                />
              </th>
              <th>Standard</th>
              <th>Attempts</th>
              <th>Average Score</th>
              <th>Latest Score</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.standardId}>
                <td>
                  <input
                    type="checkbox"
                    className="row-select-checkbox"
                    checked={selectedRowIds.has(row.standardId)}
                    onChange={() => toggleRow(row.standardId)}
                  />
                </td>
                <td>
                  <div style={{ fontWeight: 600 }}>{row.standardCode}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{row.standardName}</div>
                </td>
                <td>{row.attemptsCount}</td>
                <td className={`score-cell ${getScoreClass(row.averageScore)}`}>
                  {Math.round(row.averageScore)}%
                </td>
                <td className={`score-cell ${getScoreClass(row.latestScore)}`}>
                  {Math.round(row.latestScore)}%
                </td>
                <td>
                  <span className={row.status === 'Finished' ? 'status-finished' : 'status-unfinished'}>
                    {row.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Send Modal */}
      {showSendModal && (
        <div className="send-modal" onClick={() => setShowSendModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Send Progress Report</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 8 }}>
              Sending progress for {selectedRowIds.size} standard(s)
            </p>

            <div className="recipient-group">
              <label>
                <input
                  type="checkbox"
                  checked={sendForm.sendToStudent}
                  onChange={(e) => setSendForm((p) => ({ ...p, sendToStudent: e.target.checked }))}
                />
                Student
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={sendForm.sendToParent}
                  onChange={(e) => setSendForm((p) => ({ ...p, sendToParent: e.target.checked }))}
                />
                Parent
              </label>
            </div>

            <div>
              <label style={{ fontWeight: 600, fontSize: '0.875rem' }}>Teacher Note (optional)</label>
              <textarea
                className="teacher-note-area"
                placeholder="Add a personal note to the report..."
                value={sendForm.teacherNote}
                maxLength={300}
                onChange={(e) => setSendForm((p) => ({ ...p, teacherNote: e.target.value }))}
              />
              <div className="char-count">{sendForm.teacherNote.length}/300</div>
            </div>

            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowSendModal(false)}>Cancel</button>
              <button className="btn-primary" disabled={sending} onClick={handleSend}>
                {sending ? 'Sending...' : 'Send Report'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AssessmentProgressPage;
