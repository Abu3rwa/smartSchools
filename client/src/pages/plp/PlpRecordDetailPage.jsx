import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
    fetchPlpRecord, updatePlpRecord, submitPlpRecord,
    fetchPlpEvidence, createPlpEvidence, deletePlpEvidence,
    selectSelectedPlpRecord, selectPlpEvidence, selectPlpLoading, selectPlpError, clearPlpError,
} from '../../store/slices/plpSlice';
import toast from 'react-hot-toast';
import './PLP.css';

const TRAIT_LABELS = {
    confidence: { core: 'Confidence', s1: 'Humility', s2: 'Purpose', s3: 'Courage' },
    hope: { core: 'Hope', s1: 'Persistence', s2: 'Compassion', s3: 'Service' },
    wisdom: { core: 'Wisdom', s1: 'Curiosity', s2: 'Connection', s3: 'Discernment' },
};

const EVIDENCE_TYPES = ['observation', 'incident', 'positive_example', 'reflection'];

export default function PlpRecordDetailPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const dispatch = useDispatch();
    const record = useSelector(selectSelectedPlpRecord);
    const evidence = useSelector(selectPlpEvidence(id));
    const loading = useSelector(selectPlpLoading);
    const error = useSelector(selectPlpError);

    const [scores, setScores] = useState({ coreTrait: 0, secondaryTrait1: 0, secondaryTrait2: 0, secondaryTrait3: 0 });
    const [showEvidenceForm, setShowEvidenceForm] = useState(false);
    const [evForm, setEvForm] = useState({ type: 'observation', note: '', taggedTraits: [] });

    useEffect(() => {
        dispatch(fetchPlpRecord(id));
        dispatch(fetchPlpEvidence(id));
    }, [dispatch, id]);

    useEffect(() => {
        if (record?.scores) {
            setScores({
                coreTrait: record.scores.coreTrait || 0,
                secondaryTrait1: record.scores.secondaryTrait1 || 0,
                secondaryTrait2: record.scores.secondaryTrait2 || 0,
                secondaryTrait3: record.scores.secondaryTrait3 || 0,
            });
        }
    }, [record]);

    useEffect(() => {
        if (error) { toast.error(error); dispatch(clearPlpError()); }
    }, [error, dispatch]);

    const saveScores = async () => {
        const r = await dispatch(updatePlpRecord({ id, data: { scores } }));
        if (!r.error) toast.success('Scores saved');
    };

    const handleSubmit = async () => {
        const r = await dispatch(submitPlpRecord(id));
        if (!r.error) toast.success('Submitted');
        else toast.error(r.payload);
    };

    const addEvidence = async () => {
        if (!evForm.note.trim()) return;
        const r = await dispatch(createPlpEvidence({ recordId: id, data: evForm }));
        if (!r.error) { setEvForm({ type: 'observation', note: '', taggedTraits: [] }); setShowEvidenceForm(false); toast.success('Evidence added'); dispatch(fetchPlpRecord(id)); }
    };

    const removeEvidence = async (evId) => {
        if (!window.confirm('Delete this evidence?')) return;
        await dispatch(deletePlpEvidence(evId));
        dispatch(fetchPlpRecord(id));
    };

    if (loading && !record) return <div className="plp-loading">Loading…</div>;
    if (!record) return <div className="plp-empty">Record not found.</div>;

    const traits = TRAIT_LABELS[record.theme] || {};
    const locked = record.status === 'locked';

    return (
        <div className="plp-page">
            <div className="plp-header">
                <div>
                    <button className="btn btn-secondary btn-sm" onClick={() => navigate(-1)} style={{ marginBottom: 8 }}>← Back</button>
                    <h1>{record.student?.firstName} {record.student?.lastName} — {record.theme?.charAt(0).toUpperCase() + record.theme?.slice(1)}</h1>
                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                        <span className={`plp-badge plp-badge-${record.level}`}>{record.level}</span>
                        <span className={`plp-badge plp-badge-${record.status}`}>{record.status}</span>
                    </div>
                </div>
                {!locked && record.status === 'in_progress' && (
                    <button className="btn btn-primary" onClick={handleSubmit}>Submit Record</button>
                )}
            </div>

            {/* Scores */}
            <div className="plp-section">
                <h2>Trait Scores (0–5)</h2>
                {[
                    ['coreTrait', traits.core],
                    ['secondaryTrait1', traits.s1],
                    ['secondaryTrait2', traits.s2],
                    ['secondaryTrait3', traits.s3],
                ].map(([key, label]) => (
                    <div key={key} className="plp-score-row">
                        <label>{label}</label>
                        <input type="range" min={0} max={5} step={0.5} value={scores[key]} disabled={locked}
                            onChange={(e) => setScores({ ...scores, [key]: Number(e.target.value) })} />
                        <span className="plp-score-val">{scores[key]}</span>
                    </div>
                ))}
                {!locked && (
                    <button className="btn btn-primary btn-sm" onClick={saveScores} style={{ marginTop: 8 }}>Save Scores</button>
                )}
                <div style={{ marginTop: 12 }}>
                    <strong>Weighted score:</strong> {record.weightedScore?.toFixed(1)}&nbsp;
                    <span className={`plp-badge plp-badge-${record.level}`}>{record.level}</span>
                </div>
            </div>

            {/* Recommendations */}
            <div className="plp-section">
                <h2>Personalized Activities</h2>
                {record.recommendedActivities?.length ? (
                    <ul className="plp-activity-list">
                        {record.recommendedActivities.map((a, i) => <li key={i}>{a}</li>)}
                    </ul>
                ) : <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No activities yet. Save scores to generate.</p>}
            </div>

            {/* Evidence */}
            <div className="plp-section">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <h2 style={{ margin: 0 }}>Evidence ({record.evidenceCount})</h2>
                    {!locked && <button className="btn btn-secondary btn-sm" onClick={() => setShowEvidenceForm(!showEvidenceForm)}>+ Add Evidence</button>}
                </div>

                {showEvidenceForm && (
                    <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: 14, marginBottom: 14 }}>
                        <div className="plp-form-group">
                            <label>Type</label>
                            <select value={evForm.type} onChange={(e) => setEvForm({ ...evForm, type: e.target.value })}>
                                {EVIDENCE_TYPES.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                            </select>
                        </div>
                        <div className="plp-form-group">
                            <label>Note</label>
                            <textarea value={evForm.note} onChange={(e) => setEvForm({ ...evForm, note: e.target.value })} placeholder="Describe what you observed…" />
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button className="btn btn-primary btn-sm" onClick={addEvidence}>Save</button>
                            <button className="btn btn-secondary btn-sm" onClick={() => setShowEvidenceForm(false)}>Cancel</button>
                        </div>
                    </div>
                )}

                {evidence.map((ev) => (
                    <div key={ev._id} className="plp-evidence-item">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                                <span className={`plp-badge plp-badge-draft`} style={{ marginBottom: 4 }}>{ev.type?.replace('_', ' ')}</span>
                                <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--text-primary)' }}>{ev.note}</p>
                            </div>
                            {!locked && (
                                <button className="btn btn-secondary btn-sm" onClick={() => removeEvidence(ev._id)}>×</button>
                            )}
                        </div>
                        <div className="plp-evidence-meta">
                            {ev.teacher?.firstName} {ev.teacher?.lastName} · {new Date(ev.createdAt).toLocaleDateString()}
                        </div>
                    </div>
                ))}
                {evidence.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No evidence recorded yet.</p>}
            </div>
        </div>
    );
}
