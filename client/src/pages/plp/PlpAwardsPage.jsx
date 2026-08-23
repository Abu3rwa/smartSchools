import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
    fetchPlpAwardCandidates, setPlpAwardDecision,
    selectPlpAwardCandidates, selectPlpLoading, selectPlpError, clearPlpError,
    fetchPlpTraits, selectPlpTraits, fetchPlpCycles, selectPlpCycles,
} from '../../store/slices/plpSlice';
import { selectCurrentAcademicYear } from '../../store/slices/uiSlice';
import toast from 'react-hot-toast';
import api from '../../config/api';
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
    const cycles = useSelector(selectPlpCycles);
    const academicYear = useSelector(selectCurrentAcademicYear);
    const now = new Date();
    const [month, setMonth] = useState(now.getMonth() + 1);
    const [selectedCycleId, setSelectedCycleId] = useState('');
    const [selectedTraitId, setSelectedTraitId] = useState('all');
    const [selectedClassId, setSelectedClassId] = useState('all');
    const [classes, setClasses] = useState([]);
    const [decisionModal, setDecisionModal] = useState(null);
    const [reason, setReason] = useState('');
    const monthTraits = traits.filter((trait) => trait.isActive && Number(trait.month) === Number(month));
    const handleMonthChange = (event) => {
        setMonth(Number(event.target.value));
        setSelectedTraitId('all');
    };

    useEffect(() => { dispatch(fetchPlpTraits()); dispatch(fetchPlpCycles({ academicYear })); }, [dispatch, academicYear]);
    useEffect(() => {
        const params = { academicYear, month, ...(selectedCycleId ? { cycleId: selectedCycleId } : {}), ...(selectedTraitId !== 'all' ? { traitId: selectedTraitId } : {}), ...(selectedClassId !== 'all' ? { classId: selectedClassId } : {}) };
        dispatch(fetchPlpAwardCandidates(params));
    }, [dispatch, academicYear, month, selectedCycleId, selectedTraitId, selectedClassId]);
    useEffect(() => { if (error) { toast.error(error); dispatch(clearPlpError()); } }, [error, dispatch]);
    useEffect(() => {
        const loadClasses = async () => {
            try {
                const response = await api.get('/classes', { params: { academicYear, limit: 200 } });
                setClasses(response?.data?.data?.classes || []);
            } catch (_error) {
                setClasses([]);
            }
        };
        loadClasses();
    }, [academicYear]);

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
                <div className="plp-form-group" style={{ marginBottom: 0 }}>
                    <label>Round</label>
                    <select value={selectedCycleId} onChange={(e) => setSelectedCycleId(e.target.value)}>
                        <option value="">All rounds</option>
                        {cycles.filter((cycle) => cycle.academicYear === academicYear).map((cycle) => (
                            <option key={cycle._id} value={cycle._id}>{cycle.title}</option>
                        ))}
                    </select>
                </div>
                <div className="plp-form-group" style={{ marginBottom: 0 }}>
                    <label>Class</label>
                    <select value={selectedClassId} onChange={(e) => setSelectedClassId(e.target.value)}>
                        <option value="all">All classes</option>
                        {classes.map((cls) => <option key={cls._id} value={cls._id}>{cls.name}</option>)}
                    </select>
                </div>
                <div className="plp-form-group" style={{ marginBottom: 0 }}>
                    <label>Trait</label>
                    <select value={selectedTraitId} onChange={(e) => setSelectedTraitId(e.target.value)}>
                        <option value="all">All traits</option>
                        {monthTraits.map((trait) => (
                            <option key={trait._id} value={trait._id}>{trait.name}</option>
                        ))}
                    </select>
                </div>
            </div>
            {loading && <div className="plp-loading">Loading…</div>}
            {!loading && candidates.length === 0 && <div className="plp-empty">No award candidates for this month.</div>}
            {candidates.length > 0 && (
                <div className="plp-section" style={{ padding: 0 }}>
                    <table className="plp-table">
                        <thead>
                            <tr><th>Student</th><th>Class</th><th>Theme</th><th>Level</th><th>Score</th><th>Decision</th><th>Reason</th><th></th></tr>
                        </thead>
                        <tbody>
                            {candidates.map((r) => (
                                <tr key={r._id}>
                                    <td>{r.student?.firstName} {r.student?.lastName}</td>
                                    <td>{r.class?.name}</td>
                                    <td style={{ textTransform: 'capitalize' }}>{r.theme}</td>
                                    <td><span className={`plp-badge plp-badge-${r.level}`}>{r.level}</span></td>
                                    <td>{r.weightedScore?.toFixed(1)}</td>
                                    <td><span className={`plp-badge plp-badge-${r.awardDecision}`}>{r.awardDecision?.replace('_', ' ')}</span></td>
                                    <td style={{ maxWidth: 200, fontSize: '0.8rem', color: 'var(--text-muted)' }}>{r.awardDecisionReason || '—'}</td>
                                    <td>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            <button className="btn btn-primary btn-sm" onClick={() => openDecision(r, 'selected')}>Select</button>
                                            <button className="btn btn-secondary btn-sm" onClick={() => openDecision(r, 'not_selected')}>Not Select</button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
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
