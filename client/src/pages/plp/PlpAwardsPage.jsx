import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
    fetchPlpAwardCandidates, setPlpAwardDecision,
    selectPlpAwardCandidates, selectPlpLoading, selectPlpError, clearPlpError,
    fetchPlpTraits, selectPlpTraits,
} from '../../store/slices/plpSlice';
import { selectCurrentAcademicYear } from '../../store/slices/uiSlice';
import toast from 'react-hot-toast';
import { AWARD_LABELS, studentInitials } from './plpTableLabels';
import './PLP.css';

const MONTHS = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export default function PlpAwardsPage() {
    const dispatch = useDispatch();
    const candidates = useSelector(selectPlpAwardCandidates);
    const loading = useSelector(selectPlpLoading);
    const error = useSelector(selectPlpError);
    const traits = useSelector(selectPlpTraits);
    const academicYear = useSelector(selectCurrentAcademicYear);
    const now = new Date();
    const [month, setMonth] = useState(now.getMonth() + 1);
    const [decisionModal, setDecisionModal] = useState(null);
    const [reason, setReason] = useState('');
    const monthTraits = traits.filter((trait) => trait.isActive && Number(trait.month) === Number(month));
    const monthTraitNames = monthTraits.map((trait) => trait.name).join(', ') || '—';
    const handleMonthChange = (event) => {
        setMonth(Number(event.target.value));
    };

    useEffect(() => { dispatch(fetchPlpTraits()); }, [dispatch]);
    useEffect(() => {
        dispatch(fetchPlpAwardCandidates({ academicYear, month }));
    }, [dispatch, academicYear, month]);
    useEffect(() => { if (error) { toast.error(error); dispatch(clearPlpError()); } }, [error, dispatch]);

    const openDecision = (record, decision) => {
        setDecisionModal({ record, decision });
        setReason('');
    };

    const confirm = async () => {
        if (decisionModal.decision === 'not_selected' && !reason.trim()) {
            toast.error('Reason required when not selecting');
            return;
        }
        const r = await dispatch(setPlpAwardDecision({ recordId: decisionModal.record._id, decision: decisionModal.decision, reason }));
        if (!r.error) { setDecisionModal(null); toast.success('Decision saved'); }
        else toast.error(r.payload);
    };

    return (
        <div className="plp-page">
            <div className="plp-header" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'end' }}>
                <h1 style={{ margin: 0 }}>Award Decisions</h1>
                <div className="plp-form-group" style={{ marginBottom: 0 }}>
                    <label>Month</label>
                    <select value={month} onChange={handleMonthChange}>
                        {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                    </select>
                </div>
            </div>
            <p style={{ marginTop: 8, color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                {monthTraits.length > 0
                    ? `Students for ${MONTHS[month - 1]}, ranked from most to least observations for: ${monthTraitNames}.`
                    : `No active character trait is assigned to ${MONTHS[month - 1]} yet.`}
            </p>
            {loading && <div className="plp-loading">Loading…</div>}
            {!loading && candidates.length === 0 && <div className="plp-empty">No students found for this month.</div>}
            {candidates.length > 0 && (
                <div className="plp-section" style={{ padding: 0 }}>
                    <div className="plp-table-wrap">
                        <table className="plp-table">
                            <thead>
                                <tr><th>Student</th><th className="plp-col-optional">Class</th><th className="plp-col-optional">Round</th><th>Trait</th><th className="plp-cell-number">Observations</th><th>Decision</th><th className="plp-col-optional">Reason</th><th className="plp-cell-actions">Set decision</th></tr>
                            </thead>
                            <tbody>
                                {candidates.map((r) => {
                                    const studentName = `${r.student?.firstName || ''} ${r.student?.lastName || ''}`.trim();
                                    const observations = Number(r.matchedEvidenceCount || 0);
                                    return (
                                    <tr key={r._id}>
                                        <td>
                                            <div className="plp-student-cell">
                                                <span className="plp-student-avatar" aria-hidden="true">{studentInitials(r.student)}</span>
                                                <Link className="plp-student-name" to={`/portal/plp/records/${r._id}`}>{studentName || 'Unnamed student'}</Link>
                                            </div>
                                        </td>
                                        <td className="plp-col-optional">{r.class?.name || '-'}</td>
                                        <td className="plp-col-optional">{r.cycle?.title || 'Unassigned round'}</td>
                                        <td>{r.focusTrait?.name || '—'}</td>
                                        <td className="plp-cell-number">
                                            <span className={`plp-count-pill${observations ? '' : ' is-empty'}`}>{observations}</span>
                                        </td>
                                        <td><span className={`plp-badge plp-badge-${r.awardDecision}`}>{AWARD_LABELS[r.awardDecision] || r.awardDecision || 'No decision'}</span></td>
                                        <td className="plp-col-optional" style={{ maxWidth: 200, fontSize: '0.8rem', color: 'var(--text-muted)' }}>{r.awardDecisionReason || '—'}</td>
                                        <td>
                                            <div className="plp-row-actions plp-cell-actions">
                                                <button className="btn btn-primary btn-sm" onClick={() => openDecision(r, 'selected')}>Select</button>
                                                <button className="btn btn-secondary btn-sm" onClick={() => openDecision(r, 'not_selected')}>Not selected</button>
                                            </div>
                                        </td>
                                    </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {decisionModal && (
                <div className="plp-modal-overlay" onClick={() => setDecisionModal(null)}>
                    <div className="plp-modal" onClick={(e) => e.stopPropagation()}>
                        <h2>{decisionModal.decision === 'selected' ? 'Select Award' : 'Not Selecting'}</h2>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 12 }}>
                            {decisionModal.record.student?.firstName} {decisionModal.record.student?.lastName}
                        </p>
                        {decisionModal.decision === 'not_selected' && (
                            <div className="plp-form-group">
                                <label>Reason (required)</label>
                                <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why was this student not selected?" />
                            </div>
                        )}
                        {decisionModal.decision === 'selected' && (
                            <div className="plp-form-group">
                                <label>Note (optional)</label>
                                <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Any note about this selection…" />
                            </div>
                        )}
                        <div className="plp-modal-actions">
                            <button className="btn btn-secondary" onClick={() => setDecisionModal(null)}>Cancel</button>
                            <button className="btn btn-primary" onClick={confirm}>Confirm</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
