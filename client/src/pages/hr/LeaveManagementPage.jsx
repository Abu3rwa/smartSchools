import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchLeaveRequests, selectLeaveRequests, selectLeaveRequestsPagination,
  approveLeaveRequest, rejectLeaveRequest,
  fetchLeaveCalendar, selectLeaveCalendar,
  selectHRLoading, selectHRError,
} from '../../store/slices/hrSlice';
import './HR.css';

const LeaveManagementPage = () => {
  const dispatch = useDispatch();
  const requests = useSelector(selectLeaveRequests);
  const pagination = useSelector(selectLeaveRequestsPagination);
  const calendar = useSelector(selectLeaveCalendar);
  const loading = useSelector(selectHRLoading);
  const error = useSelector(selectHRError);

  const [tab, setTab] = useState('requests');
  const [filters, setFilters] = useState({ status: 'pending', page: 1 });
  const now = new Date();
  const [calMonth, setCalMonth] = useState(now.getMonth() + 1);
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [actionNote, setActionNote] = useState('');
  const [actionId, setActionId] = useState(null);
  const [actionType, setActionType] = useState(null);

  useEffect(() => { dispatch(fetchLeaveRequests(filters)); }, [dispatch, filters]);
  useEffect(() => { if (tab === 'calendar') dispatch(fetchLeaveCalendar({ month: calMonth, year: calYear })); }, [dispatch, tab, calMonth, calYear]);

  const handleAction = async () => {
    if (!actionId) return;
    if (actionType === 'approve') {
      await dispatch(approveLeaveRequest({ id: actionId, note: actionNote }));
    } else {
      await dispatch(rejectLeaveRequest({ id: actionId, note: actionNote }));
    }
    setActionId(null);
    setActionNote('');
    setActionType(null);
    dispatch(fetchLeaveRequests(filters));
  };

  return (
    <div className="hr-page">
      <div className="hr-header">
        <h1>Leave Management</h1>
      </div>

      {error && <div className="hr-error">{error}</div>}

      <div className="hr-tabs">
        <button className={tab === 'requests' ? 'active' : ''} onClick={() => setTab('requests')}>Requests</button>
        <button className={tab === 'calendar' ? 'active' : ''} onClick={() => setTab('calendar')}>Calendar</button>
      </div>

      {tab === 'requests' && (
        <>
          <div className="hr-toolbar">
            <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value, page: 1 })}>
              <option value="">All</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          {loading ? (
            <div className="hr-loading">Loading...</div>
          ) : requests.length === 0 ? (
            <div className="hr-empty"><h3>No leave requests</h3></div>
          ) : (
            <table className="hr-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Leave Type</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Days</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r._id}>
                    <td>{r.staff?.user?.firstName} {r.staff?.user?.lastName}</td>
                    <td>
                      {r.leaveType?.color && <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: r.leaveType.color, marginRight: 6 }} />}
                      {r.leaveType?.name}
                    </td>
                    <td>{new Date(r.startDate).toLocaleDateString()}</td>
                    <td>{new Date(r.endDate).toLocaleDateString()}</td>
                    <td>{r.days}{r.isHalfDay ? ' (½)' : ''}</td>
                    <td><span className={`hr-badge ${r.status}`}>{r.status}</span></td>
                    <td>
                      {r.status === 'pending' && (
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button className="btn-success btn-sm" onClick={() => { setActionId(r._id); setActionType('approve'); }}>Approve</button>
                          <button className="btn-danger btn-sm" onClick={() => { setActionId(r._id); setActionType('reject'); }}>Reject</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {pagination && pagination.pages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '1rem' }}>
              {Array.from({ length: pagination.pages }, (_, i) => (
                <button key={i + 1}
                  className={filters.page === i + 1 ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}
                  onClick={() => setFilters({ ...filters, page: i + 1 })}
                >{i + 1}</button>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'calendar' && (
        <div className="hr-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <button className="btn-secondary btn-sm" onClick={() => {
              if (calMonth === 1) { setCalMonth(12); setCalYear(calYear - 1); } else setCalMonth(calMonth - 1);
            }}>← Prev</button>
            <h3 style={{ margin: 0 }}>
              {new Date(calYear, calMonth - 1).toLocaleString('default', { month: 'long', year: 'numeric' })}
            </h3>
            <button className="btn-secondary btn-sm" onClick={() => {
              if (calMonth === 12) { setCalMonth(1); setCalYear(calYear + 1); } else setCalMonth(calMonth + 1);
            }}>Next →</button>
          </div>

          <div className="hr-calendar-grid">
            {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d) => (
              <div key={d} className="hr-calendar-header">{d}</div>
            ))}
            {(() => {
              const firstDay = new Date(calYear, calMonth - 1, 1).getDay();
              const daysInMonth = new Date(calYear, calMonth, 0).getDate();
              const cells = [];
              for (let i = 0; i < firstDay; i++) cells.push(<div key={`e-${i}`} className="hr-calendar-day other-month" />);
              for (let d = 1; d <= daysInMonth; d++) {
                const date = new Date(calYear, calMonth - 1, d);
                const dayEvents = (calendar || []).filter((ev) => {
                  const start = new Date(ev.startDate);
                  const end = new Date(ev.endDate);
                  return date >= new Date(start.getFullYear(), start.getMonth(), start.getDate()) &&
                         date <= new Date(end.getFullYear(), end.getMonth(), end.getDate());
                });
                cells.push(
                  <div key={d} className="hr-calendar-day">
                    <div className="day-number">{d}</div>
                    {dayEvents.map((ev) => (
                      <div key={ev._id} className="hr-calendar-event"
                        style={{ background: ev.leaveType?.color ? `${ev.leaveType.color}30` : 'var(--bg-tertiary)', color: ev.leaveType?.color || 'var(--text-secondary)' }}>
                        {ev.staff?.user?.firstName?.[0]}{ev.staff?.user?.lastName?.[0]}
                      </div>
                    ))}
                  </div>
                );
              }
              return cells;
            })()}
          </div>
        </div>
      )}

      {/* Action Modal */}
      {actionId && (
        <div className="hr-modal-overlay" onClick={() => { setActionId(null); setActionType(null); }}>
          <div className="hr-modal" onClick={(e) => e.stopPropagation()}>
            <h2>{actionType === 'approve' ? 'Approve' : 'Reject'} Leave Request</h2>
            <div className="hr-form-group">
              <label>Note (optional)</label>
              <textarea rows={3} value={actionNote} onChange={(e) => setActionNote(e.target.value)} placeholder="Add a note..." />
            </div>
            <div className="hr-modal-actions">
              <button className="btn-secondary" onClick={() => { setActionId(null); setActionType(null); }}>Cancel</button>
              <button className={actionType === 'approve' ? 'btn-success' : 'btn-danger'} onClick={handleAction}>
                {actionType === 'approve' ? 'Approve' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LeaveManagementPage;
