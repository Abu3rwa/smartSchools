import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useParams, Link } from 'react-router-dom';
import {
    fetchPlpStudentEvidence, fetchPlpTraits, selectPlpTraits,
    selectPlpStudentEvidence, selectPlpLoading, selectPlpError, clearPlpError,
} from '../../store/slices/plpSlice';
import toast from 'react-hot-toast';
import './PLP.css';

const EVIDENCE_TYPES = ['observation', 'incident', 'positive_example', 'reflection'];

export default function PlpStudentEvidencePage() {
    const { studentId } = useParams();
    const dispatch = useDispatch();
    const traits = useSelector(selectPlpTraits);
    const loading = useSelector(selectPlpLoading);
    const error = useSelector(selectPlpError);
    const [filters, setFilters] = useState({ traitId: '', type: '', academicYear: '', month: '', from: '', to: '' });
    const data = useSelector(selectPlpStudentEvidence);

    const loadEvidence = async () => {
        await dispatch(fetchPlpStudentEvidence({ studentId, params: filters }));
    };

    useEffect(() => { dispatch(fetchPlpTraits()); }, [dispatch]);
    useEffect(() => { dispatch(fetchPlpStudentEvidence({ studentId })); }, [dispatch, studentId]);
    useEffect(() => {
        if (error) { toast.error(error); dispatch(clearPlpError()); }
    }, [error, dispatch]);

    const updateFilter = (key, value) => setFilters((previous) => ({ ...previous, [key]: value }));
    const student = data?.student;
    const evidence = data?.evidence || [];
    const tallies = data?.tallies || {};

    return (
        <div className="plp-page">
            <div className="plp-header">
                <div>
                    <Link to="/portal/plp/records" className="btn btn-secondary btn-sm">Back to Classboard</Link>
                    <h1>{student ? `${student.firstName || ''} ${student.lastName || ''}`.trim() : 'Student Evidence History'}</h1>
                    <p style={{ margin: 0, color: 'var(--text-muted)' }}>All recorded PLP evidence across periods.</p>
                </div>
            </div>

            <div className="plp-section">
                <h2>Filters</h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
                    <select value={filters.traitId} onChange={(event) => updateFilter('traitId', event.target.value)}>
                        <option value="">All traits</option>
                        {traits.filter((trait) => trait.isActive).map((trait) => <option key={trait._id} value={trait._id}>{trait.name}</option>)}
                    </select>
                    <select value={filters.type} onChange={(event) => updateFilter('type', event.target.value)}>
                        <option value="">All evidence types</option>
                        {EVIDENCE_TYPES.map((type) => <option key={type} value={type}>{type.replace('_', ' ')}</option>)}
                    </select>
                    <input placeholder="Academic year" value={filters.academicYear} onChange={(event) => updateFilter('academicYear', event.target.value)} />
                    <input type="number" min="1" max="12" placeholder="Month" value={filters.month} onChange={(event) => updateFilter('month', event.target.value)} />
                    <input type="date" value={filters.from} onChange={(event) => updateFilter('from', event.target.value)} />
                    <input type="date" value={filters.to} onChange={(event) => updateFilter('to', event.target.value)} />
                </div>
                <button className="btn btn-primary btn-sm" onClick={loadEvidence} style={{ marginTop: 10 }}>Apply Filters</button>
            </div>

            <div className="plp-section">
                <h2>Positive Trait Tallies</h2>
                {Object.keys(tallies).length === 0 && <p style={{ color: 'var(--text-muted)' }}>No positive trait evidence found.</p>}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {Object.entries(tallies).map(([traitId, count]) => {
                        const trait = traits.find((item) => item._id === traitId);
                        return <span key={traitId} className="plp-badge plp-badge-developing">{trait?.name || 'Trait'}: {count}</span>;
                    })}
                </div>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Incident evidence remains visible below but is excluded from positive tallies.</p>
            </div>

            <div className="plp-section" style={{ padding: 0 }}>
                {loading && <div className="plp-loading" style={{ padding: 16 }}>Loading evidence…</div>}
                {!loading && evidence.length === 0 && <div className="plp-empty" style={{ padding: 16 }}>No evidence found.</div>}
                {!loading && evidence.length > 0 && (
                    <table className="plp-table">
                        <thead><tr><th>Date</th><th>Trait</th><th>Type</th><th>Teacher</th><th>Period</th><th>Evidence</th></tr></thead>
                        <tbody>{evidence.map((item) => (
                            <tr key={item._id}>
                                <td>{new Date(item.createdAt).toLocaleDateString()}</td>
                                <td>{item.traitId?.name || 'Unlinked'}</td>
                                <td>{item.type?.replace('_', ' ')}</td>
                                <td>{item.teacher?.firstName} {item.teacher?.lastName}</td>
                                <td>{item.record?.academicYear} · {item.record?.cycle?.title || `Month ${item.record?.month}`}</td>
                                <td>{item.note}</td>
                            </tr>
                        ))}</tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
