import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { fetchPool, createAssessmentFromPool, clearPoolError } from '../../../store/slices/standardAssessmentSlice';
import { fetchPoolQuestion } from '../../../api/standardAssessmentApi';
import { PERMISSIONS } from '../../../constants/permissions';
import './AssessmentPoolPage.css';

const AssessmentPoolPage = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { questions, pagination, loading, error } = useSelector((state) => state.standardAssessment.pool);

  // Filters
  const [filters, setFilters] = useState({
    subjectId: '', gradeLevel: '', questionType: '', difficulty: '', search: '',
  });
  const [page, setPage] = useState(1);

  // Selection
  const [selectedIds, setSelectedIds] = useState(new Set());

  // Create draft modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [draftForm, setDraftForm] = useState({ title: '', classId: '', dueDate: '' });
  const [creating, setCreating] = useState(false);

  // Preview drawer
  const [previewQuestion, setPreviewQuestion] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const loadPool = useCallback(() => {
    const params = { page, limit: 25 };
    if (filters.subjectId) params.subjectId = filters.subjectId;
    if (filters.gradeLevel) params.gradeLevel = filters.gradeLevel;
    if (filters.questionType) params.questionType = filters.questionType;
    if (filters.difficulty) params.difficulty = filters.difficulty;
    if (filters.search) params.search = filters.search;
    dispatch(fetchPool(params));
  }, [dispatch, filters, page]);

  useEffect(() => { loadPool(); }, [loadPool]);

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === questions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(questions.map((q) => q._id)));
    }
  };

  const handlePreview = async (q) => {
    if (q.poolId && q._id) {
      setPreviewLoading(true);
      try {
        const detail = await fetchPoolQuestion(q.poolId, q._id);
        setPreviewQuestion(detail);
      } catch {
        setPreviewQuestion(q);
      }
      setPreviewLoading(false);
    } else {
      setPreviewQuestion(q);
    }
  };

  const handleCreateDraft = async () => {
    if (selectedIds.size === 0 || !draftForm.classId) return;
    setCreating(true);
    try {
      const result = await dispatch(createAssessmentFromPool({
        selectedPoolQuestionIds: [...selectedIds],
        classId: draftForm.classId,
        title: draftForm.title || undefined,
        dueDate: draftForm.dueDate || undefined,
      })).unwrap();
      setShowCreateModal(false);
      setSelectedIds(new Set());
      navigate('/standards/assign');
    } catch {
      // Error handled in Redux
    }
    setCreating(false);
  };

  return (
    <div className="assessment-pool-page">
      <div className="pool-header">
        <h1>Question Pool Library</h1>
        {selectedIds.size > 0 && (
          <button
            className="btn-primary"
            onClick={() => setShowCreateModal(true)}
          >
            Create Assessment ({selectedIds.size} selected)
          </button>
        )}
      </div>

      {error && (
        <div className="error-banner">
          {error}
          <button onClick={() => dispatch(clearPoolError())} style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>×</button>
        </div>
      )}

      {/* Filters */}
      <div className="pool-filters">
        <div className="filter-group">
          <label>Search</label>
          <input
            type="text"
            placeholder="Search questions..."
            value={filters.search}
            onChange={(e) => handleFilterChange('search', e.target.value)}
          />
        </div>
        <div className="filter-group">
          <label>Question Type</label>
          <select value={filters.questionType} onChange={(e) => handleFilterChange('questionType', e.target.value)}>
            <option value="">All Types</option>
            <option value="multiple_choice">Multiple Choice</option>
            <option value="short_answer">Short Answer</option>
            <option value="true_false">True/False</option>
          </select>
        </div>
        <div className="filter-group">
          <label>Difficulty</label>
          <select value={filters.difficulty} onChange={(e) => handleFilterChange('difficulty', e.target.value)}>
            <option value="">All</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </div>
        <div className="filter-group">
          <label>Grade Level</label>
          <select value={filters.gradeLevel} onChange={(e) => handleFilterChange('gradeLevel', e.target.value)}>
            <option value="">All Grades</option>
            {[1,2,3,4,5,6,7,8,9,10,11,12].map((g) => (
              <option key={g} value={g}>Grade {g}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Selection bar */}
      {selectedIds.size > 0 && (
        <div className="pool-selection-bar">
          <span>
            <span className="count-badge">{selectedIds.size}</span> question(s) selected
          </span>
          <div className="pool-actions">
            <button className="btn-secondary" onClick={() => setSelectedIds(new Set())}>Clear Selection</button>
            <button className="btn-primary" onClick={() => setShowCreateModal(true)}>Create Assessment</button>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="loading-state">Loading pool questions...</div>
      ) : questions.length === 0 ? (
        <div className="empty-state">
          <h3>No questions found</h3>
          <p>Adjust your filters or generate more questions from the Standards page.</p>
        </div>
      ) : (
        <>
          <table className="pool-table">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    checked={selectedIds.size === questions.length && questions.length > 0}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th>Question</th>
                <th>Type</th>
                <th>Difficulty</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {questions.map((q) => (
                <tr key={q._id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(q._id)}
                      onChange={() => toggleSelect(q._id)}
                    />
                  </td>
                  <td>
                    <div className="question-preview">{q.questionText}</div>
                  </td>
                  <td>
                    <span className="type-badge">
                      {q.questionType?.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td>
                    <span className={`difficulty-badge ${q.difficulty || 'medium'}`}>
                      {q.difficulty || 'medium'}
                    </span>
                  </td>
                  <td>
                    <button className="btn-secondary" onClick={() => handlePreview(q)}>
                      Preview
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          {pagination && pagination.pages > 1 && (
            <div className="pagination-bar">
              <button disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
              <span>Page {pagination.page} of {pagination.pages} ({pagination.total} total)</span>
              <button disabled={page >= pagination.pages} onClick={() => setPage(page + 1)}>Next</button>
            </div>
          )}
        </>
      )}

      {/* Preview Drawer */}
      {previewQuestion && (
        <div className="question-preview-drawer">
          <button className="close-btn" onClick={() => setPreviewQuestion(null)}>×</button>
          <h3>Question Preview</h3>
          <p><strong>Type:</strong> {previewQuestion.questionType?.replace(/_/g, ' ')}</p>
          <p><strong>Difficulty:</strong> {previewQuestion.difficulty}</p>
          <div style={{ margin: '16px 0', padding: '12px', background: '#f8fafc', borderRadius: '8px' }}>
            {previewQuestion.questionText}
          </div>
          {previewQuestion.options?.length > 0 && (
            <ul className="option-list">
              {previewQuestion.options.map((opt, i) => (
                <li key={i} className={opt.text === previewQuestion.correctAnswer || opt.label === previewQuestion.correctAnswer ? 'correct' : ''}>
                  <strong>{opt.label}.</strong> {opt.text}
                </li>
              ))}
            </ul>
          )}
          {previewQuestion.explanation && (
            <div style={{ marginTop: 16 }}>
              <strong>Explanation:</strong>
              <p>{previewQuestion.explanation}</p>
            </div>
          )}
        </div>
      )}

      {/* Create Draft Modal */}
      {showCreateModal && (
        <div className="create-draft-modal" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Create Assessment from Pool</h2>
            <p style={{ color: '#64748b', marginBottom: 16 }}>
              {selectedIds.size} question(s) selected
            </p>
            <div className="form-group">
              <label>Assessment Title</label>
              <input
                type="text"
                placeholder="Auto-generated if empty"
                value={draftForm.title}
                onChange={(e) => setDraftForm((p) => ({ ...p, title: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label>Class *</label>
              <input
                type="text"
                placeholder="Enter Class ID"
                value={draftForm.classId}
                onChange={(e) => setDraftForm((p) => ({ ...p, classId: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label>Due Date</label>
              <input
                type="date"
                value={draftForm.dueDate}
                onChange={(e) => setDraftForm((p) => ({ ...p, dueDate: e.target.value }))}
              />
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowCreateModal(false)}>Cancel</button>
              <button
                className="btn-primary"
                disabled={!draftForm.classId || creating}
                onClick={handleCreateDraft}
              >
                {creating ? 'Creating...' : 'Create Draft'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AssessmentPoolPage;
