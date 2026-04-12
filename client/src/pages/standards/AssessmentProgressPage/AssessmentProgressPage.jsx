import React, { useState, useEffect, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchProgressTable, sendProgressTable, clearSendResult } from '../../../store/slices/standardAssessmentSlice';
import './AssessmentProgressPage.css';

const AssessmentProgressPage = () => {
  const dispatch = useDispatch();
  const { rows, loading, error } = useSelector((state) => state.standardAssessment.progressTable);
  const sendResult = useSelector((state) => state.standardAssessment.sendResult);

  const [filters, setFilters] = useState({
    classId: '', studentId: '', subjectId: '', dateFrom: '', dateTo: '',
  });

  const [selectedRowIds, setSelectedRowIds] = useState(new Set());
  const [showSendModal, setShowSendModal] = useState(false);
  const [sendForm, setSendForm] = useState({
    sendToStudent: true, sendToParent: true, teacherNote: '',
  });
  const [sending, setSending] = useState(false);

  const loadTable = useCallback(() => {
    const params = {};
    if (filters.classId) params.classId = filters.classId;
    if (filters.studentId) params.studentId = filters.studentId;
    if (filters.subjectId) params.subjectId = filters.subjectId;
    if (filters.dateFrom) params.dateFrom = filters.dateFrom;
    if (filters.dateTo) params.dateTo = filters.dateTo;
    dispatch(fetchProgressTable(params));
  }, [dispatch, filters]);

  useEffect(() => { loadTable(); }, [loadTable]);

  const handleFilterChange = (key, value) => {
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
    setSending(true);
    try {
      await dispatch(sendProgressTable({
        studentId: filters.studentId,
        classId: filters.classId,
        subjectId: filters.subjectId,
        selectedStandardRowIds: [...selectedRowIds],
        sendToStudent: sendForm.sendToStudent,
        sendToParent: sendForm.sendToParent,
        teacherNote: sendForm.teacherNote || undefined,
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
    <div className="progress-table-page">
      <div className="progress-header">
        <h1>Standards Progress Table</h1>
        {selectedRowIds.size > 0 && (
          <button className="btn-primary" onClick={() => setShowSendModal(true)}>
            Send Progress ({selectedRowIds.size} standards)
          </button>
        )}
      </div>

      {error && <div className="error-banner">{error}</div>}
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
          <input type="text" placeholder="Class ID" value={filters.classId} onChange={(e) => handleFilterChange('classId', e.target.value)} />
        </div>
        <div className="filter-group">
          <label>Student</label>
          <input type="text" placeholder="Student ID" value={filters.studentId} onChange={(e) => handleFilterChange('studentId', e.target.value)} />
        </div>
        <div className="filter-group">
          <label>Subject</label>
          <input type="text" placeholder="Subject ID" value={filters.subjectId} onChange={(e) => handleFilterChange('subjectId', e.target.value)} />
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
          <p>Select a student and class to view their standards progress.</p>
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
                  <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{row.standardName}</div>
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
            <p style={{ color: '#64748b', marginBottom: 8 }}>
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
