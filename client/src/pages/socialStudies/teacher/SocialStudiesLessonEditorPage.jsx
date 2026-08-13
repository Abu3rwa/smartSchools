import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import DOMPurify from 'isomorphic-dompurify';
import toast from 'react-hot-toast';
import {
    fetchLesson, updateLesson, generateAIQuestions,
    selectActiveLesson, selectActiveLessonLoading, clearActiveLesson,
    selectAIGenerating, selectAIDraftQuestions, clearAIDraftQuestions,
} from '../../../store/slices/socialStudiesSlice';
import FeatureGate from '../../../components/FeatureGate';
import '../SocialStudies.css';

const newQuestion = () => ({
    _tempId: Date.now() + Math.random(),
    questionText: '', questionType: 'multiple_choice',
    options: [{ label: 'A', text: '' }, { label: 'B', text: '' }, { label: 'C', text: '' }, { label: 'D', text: '' }],
    correctAnswer: '', explanation: '', difficulty: 'medium', points: 1,
});

const buildLessonSrcDoc = (rawContent) => {
    const raw = String(rawContent || '').trim();
    if (!raw) return '';

    const allowTags = ['iframe'];
    const allowAttrs = ['allowfullscreen', 'frameborder', 'src', 'title', 'style'];
    const hasFullDocument = /<!doctype|<html[\s>]|<head[\s>]|<body[\s>]/i.test(raw);

    if (hasFullDocument) {
        return DOMPurify.sanitize(raw, {
            ADD_TAGS: allowTags,
            ADD_ATTR: allowAttrs,
            FORBID_TAGS: ['script'],
        });
    }

    const safeFragment = DOMPurify.sanitize(raw, {
        ADD_TAGS: allowTags,
        ADD_ATTR: allowAttrs,
        FORBID_TAGS: ['script'],
    });

    return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head><body style="margin:0;padding:0;">${safeFragment}</body></html>`;
};

// ── Question Editor ───────────────────────────────────────────────────────
function QuestionEditor({ q, idx, onChange, onDelete }) {
    const update = (field, val) => onChange({ ...q, [field]: val });
    return (
        <div style={{ border: '1.5px solid var(--border-color,#e5e7eb)', borderRadius: 12, padding: 18, background: 'var(--bg-card,#fff)', marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-secondary,#6b7280)' }}>Q{idx + 1}</span>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <select value={q.questionType} onChange={e => update('questionType', e.target.value)} style={selectStyle}>
                        <option value="multiple_choice">Multiple Choice</option>
                        <option value="true_false">True / False</option>
                        <option value="short_answer">Short Answer</option>
                    </select>
                    <select value={q.difficulty} onChange={e => update('difficulty', e.target.value)} style={selectStyle}>
                        <option value="easy">Easy</option>
                        <option value="medium">Medium</option>
                        <option value="hard">Hard</option>
                    </select>
                    <input type="number" min={1} max={10} value={q.points} onChange={e => update('points', Number(e.target.value))}
                        style={{ width: 58, ...selectStyle }} title="Points" />
                    <button className="btn-icon btn-icon-danger" onClick={onDelete} title="Delete question" style={iconBtn}>✕</button>
                </div>
            </div>

            <textarea style={{ ...inputStyle, minHeight: 64 }} value={q.questionText}
                onChange={e => update('questionText', e.target.value)} placeholder="Question text…" />

            {q.questionType === 'multiple_choice' && (
                <div style={{ marginTop: 10 }}>
                    {q.options.map((opt, i) => (
                        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 7, alignItems: 'center' }}>
                            <label style={{ fontSize: 13, fontWeight: 700, width: 20, flexShrink: 0, color: 'var(--text-primary,#0f172a)' }}>{opt.label}.</label>
                            <input style={{ ...inputStyle, flex: 1 }} value={opt.text} placeholder={`Option ${opt.label}`}
                                onChange={e => { const next = [...q.options]; next[i] = { ...opt, text: e.target.value }; update('options', next); }} />
                            <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 12, color: q.correctAnswer === opt.label ? '#166534' : 'var(--text-secondary,#6b7280)', fontWeight: q.correctAnswer === opt.label ? 700 : 400 }}>
                                <input type="radio" name={`correct-${q._id || q._tempId}`} value={opt.label}
                                    checked={q.correctAnswer === opt.label} onChange={() => update('correctAnswer', opt.label)} />
                                Correct
                            </label>
                        </div>
                    ))}
                </div>
            )}
            {q.questionType === 'true_false' && (
                <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
                    {['True', 'False'].map(v => (
                        <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '8px 16px', borderRadius: 8, border: `1.5px solid ${q.correctAnswer === v ? '#86efac' : 'var(--border-color,#e5e7eb)'}`, background: q.correctAnswer === v ? '#f0fdf4' : 'transparent', fontWeight: q.correctAnswer === v ? 700 : 400 }}>
                            <input type="radio" value={v} checked={q.correctAnswer === v} onChange={() => update('correctAnswer', v)} />{v}
                        </label>
                    ))}
                </div>
            )}
            {q.questionType === 'short_answer' && (
                <input style={{ ...inputStyle, marginTop: 8 }} value={q.correctAnswer}
                    onChange={e => update('correctAnswer', e.target.value)} placeholder="Model answer (teacher reference only)" />
            )}

            <textarea style={{ ...inputStyle, marginTop: 8, minHeight: 48 }} value={q.explanation}
                onChange={e => update('explanation', e.target.value)} placeholder="Explanation shown to students after submission (optional)" />
        </div>
    );
}

// ── Main Page ─────────────────────────────────────────────────────────────
export default function SocialStudiesLessonEditorPage() {
    const { lessonId } = useParams();
    const navigate = useNavigate();
    const dispatch = useDispatch();
    const lesson = useSelector(selectActiveLesson);
    const loading = useSelector(selectActiveLessonLoading);
    const aiGenerating = useSelector(selectAIGenerating);
    const aiDraftQuestions = useSelector(selectAIDraftQuestions);

    const [title, setTitle] = useState('');
    const [duration, setDuration] = useState('');
    const [content, setContent] = useState('');
    const [questions, setQuestions] = useState([]);
    const [activeTab, setActiveTab] = useState('content');
    const [previewMode, setPreviewMode] = useState(false);
    const [saving, setSaving] = useState(false);

    // AI generate config
    const [showAIPanel, setShowAIPanel] = useState(false);
    const [aiConfig, setAIConfig] = useState({ count: 5, difficulty: 'medium', questionTypes: ['multiple_choice', 'true_false'] });
    // Per-draft accept/reject tracking
    const [draftSelections, setDraftSelections] = useState({});

    const previewSrcDoc = buildLessonSrcDoc(content);

    useEffect(() => {
        dispatch(fetchLesson(lessonId));
        return () => dispatch(clearActiveLesson());
    }, [dispatch, lessonId]);

    useEffect(() => {
        if (lesson) {
            setTitle(lesson.title || '');
            setDuration(lesson.estimatedDuration || '');
            setContent(lesson.content || '');
            setQuestions((lesson.questions || []).map((q, i) => ({ ...q, _tempId: q._id || i })));
        }
    }, [lesson]);

    // Reset draft selections when new drafts arrive
    useEffect(() => {
        if (aiDraftQuestions.length > 0) {
            const sel = {};
            aiDraftQuestions.forEach((_, i) => { sel[i] = true; });
            setDraftSelections(sel);
        }
    }, [aiDraftQuestions]);

    const handleSave = async (publish = false) => {
        if (!title.trim()) return toast.error('Title is required');
        setSaving(true);
        try {
            await dispatch(updateLesson({
                id: lessonId,
                data: {
                    title: title.trim(),
                    estimatedDuration: duration ? Number(duration) : null,
                    content,
                    questions,
                    ...(publish ? { isPublished: true } : {}),
                },
            })).unwrap();
            toast.success(publish ? 'Lesson published!' : 'Lesson saved');
        } catch (err) {
            toast.error(err || 'Save failed');
        } finally {
            setSaving(false);
        }
    };

    const addQuestion = () => setQuestions(prev => [...prev, newQuestion()]);
    const updateQuestion = (idx, updated) => setQuestions(prev => prev.map((q, i) => i === idx ? updated : q));
    const deleteQuestion = (idx) => setQuestions(prev => prev.filter((_, i) => i !== idx));

    const handleGenerate = async () => {
        if (!content || content.length < 50) {
            return toast.error('Add lesson content first — the AI needs it to generate questions.');
        }
        try {
            await dispatch(generateAIQuestions({ lessonId, ...aiConfig })).unwrap();
            toast.success('Questions drafted! Review and add the ones you want to keep.');
        } catch (err) {
            toast.error(err || 'Generation failed');
        }
    };

    const handleAcceptDrafts = () => {
        const accepted = aiDraftQuestions
            .filter((_, i) => draftSelections[i] !== false)
            .map(q => ({ ...q, _tempId: Date.now() + Math.random() }));
        if (accepted.length === 0) return toast.error('Select at least one question');
        setQuestions(prev => [...prev, ...accepted]);
        dispatch(clearAIDraftQuestions());
        setShowAIPanel(false);
        toast.success(`${accepted.length} question${accepted.length !== 1 ? 's' : ''} added`);
    };

    if (loading) return <div style={{ padding: 32 }}>Loading lesson…</div>;

    return (
            <div className="ss-page" style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>

                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, gap: 12, flexWrap: 'wrap' }}>
                    <button className="btn btn-ghost" onClick={() => navigate(-1)} style={{ padding: '6px 0' }}>← Back</button>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-secondary" onClick={() => handleSave(false)} disabled={saving}>Save Draft</button>
                        <button className="btn btn-primary" onClick={() => handleSave(true)} disabled={saving}>
                            {lesson?.isPublished ? 'Save & Update' : 'Publish Lesson'}
                        </button>
                    </div>
                </div>

                {/* Title + Duration */}
                <input
                    style={{ width: '100%', fontSize: 22, fontWeight: 800, border: 'none', borderBottom: '2.5px solid var(--border-color,#e5e7eb)', padding: '4px 0', marginBottom: 10, outline: 'none', background: 'transparent', color: 'var(--text-primary,#0f172a)', boxSizing: 'border-box' }}
                    value={title} onChange={e => setTitle(e.target.value)} placeholder="Lesson title…"
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary,#6b7280)' }}>Estimated duration:</span>
                    <input type="number" min={1} value={duration} onChange={e => setDuration(e.target.value)} placeholder="min"
                        style={{ width: 72, padding: '5px 10px', border: '1.5px solid var(--border-color,#e5e7eb)', borderRadius: 8, fontSize: 13 }} />
                    <span style={{ fontSize: 13, color: 'var(--text-secondary,#6b7280)' }}>minutes</span>
                    {lesson?.isPublished && <span className="ss-badge ss-badge-published" style={{ marginLeft: 8 }}>Published</span>}
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', borderBottom: '2px solid var(--border-color,#e5e7eb)', marginBottom: 20 }}>
                    {[
                        ['content', '📄 Lesson Content'],
                        ['questions', `❓ Questions (${questions.length})`],
                    ].map(([key, label]) => (
                        <button key={key} onClick={() => setActiveTab(key)} style={{ padding: '9px 20px', border: 'none', background: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14, borderBottom: `2.5px solid ${activeTab === key ? '#2563eb' : 'transparent'}`, color: activeTab === key ? '#2563eb' : 'var(--text-secondary,#6b7280)', marginBottom: -2 }}>
                            {label}
                        </button>
                    ))}
                </div>

                {/* ── Content Tab ── */}
                {activeTab === 'content' && (
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary,#6b7280)' }}>
                                Paste the AI-generated HTML here. Use the prompt from the lesson guide to generate it.
                            </p>
                            <button
                                onClick={() => setPreviewMode(p => !p)}
                                className="btn btn-secondary btn-sm"
                                style={{ flexShrink: 0 }}
                            >
                                {previewMode ? '✏️ Edit HTML' : '👁 Preview'}
                            </button>
                        </div>

                        {previewMode ? (
                            previewSrcDoc ? (
                                <iframe
                                    title="Lesson HTML preview"
                                    srcDoc={previewSrcDoc}
                                    sandbox="allow-popups allow-popups-to-escape-sandbox"
                                    style={{ width: '100%', minHeight: 520, border: '1.5px solid var(--border-color,#e5e7eb)', borderRadius: 12, background: 'var(--bg-card,#fff)' }}
                                />
                            ) : (
                                <div style={{ border: '1.5px dashed var(--border-color,#e5e7eb)', borderRadius: 12, minHeight: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary,#6b7280)', background: 'var(--bg-card,#fff)' }}>
                                    Add lesson HTML to preview it.
                                </div>
                            )
                        ) : (
                            <>
                                <textarea
                                    style={{ width: '100%', minHeight: 420, padding: '14px 16px', border: '1.5px solid var(--border-color,#e5e7eb)', borderRadius: 12, fontSize: 13, fontFamily: 'ui-monospace, monospace', lineHeight: 1.6, resize: 'vertical', boxSizing: 'border-box', background: 'var(--bg-tertiary,#f9fafb)', color: 'var(--text-primary,#0f172a)', outline: 'none' }}
                                    value={content}
                                    onChange={e => setContent(e.target.value)}
                                    placeholder={'Paste your HTML here…\n\nExample:\n<h2 style="font-size:20px;font-weight:700;color:#1e293b;">Section Title</h2>\n<p style="font-size:15px;line-height:1.75;color:#374151;">Paragraph text…</p>'}
                                    spellCheck={false}
                                />
                                {content && (
                                    <p style={{ fontSize: 12, color: 'var(--text-secondary,#6b7280)', marginTop: 6 }}>
                                        {content.length.toLocaleString()} characters · click <strong>👁 Preview</strong> to see how it looks
                                    </p>
                                )}
                            </>
                        )}
                    </div>
                )}

                {/* ── Questions Tab ── */}
                {activeTab === 'questions' && (
                    <div>
                        {/* Action bar */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary,#6b7280)' }}>
                                Add questions manually or let AI draft them from the lesson content.
                            </p>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button className="btn btn-secondary" onClick={addQuestion}>+ Manual</button>
                                <button
                                    className="btn btn-primary"
                                    onClick={() => setShowAIPanel(p => !p)}
                                    style={{ background: 'linear-gradient(135deg,#7c3aed,#4f46e5)', gap: 6 }}
                                >
                                    ✨ Generate with AI
                                </button>
                            </div>
                        </div>

                        {/* ── AI Generate Panel ── */}
                        {showAIPanel && (
                            <div style={{ background: 'linear-gradient(135deg,#f5f3ff,#ede9fe)', border: '1.5px solid #c4b5fd', borderRadius: 14, padding: 20, marginBottom: 20 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                                    <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: '#4f46e5' }}>✨ AI Question Generator</p>
                                    <button onClick={() => { setShowAIPanel(false); dispatch(clearAIDraftQuestions()); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#6b7280' }}>✕</button>
                                </div>

                                {aiDraftQuestions.length === 0 ? (
                                    /* Config form */
                                    <div>
                                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
                                            <div style={{ flex: '0 0 80px' }}>
                                                <label style={{ ...labelSm }}>Count</label>
                                                <input type="number" min={1} max={15} value={aiConfig.count}
                                                    onChange={e => setAIConfig(c => ({ ...c, count: Number(e.target.value) }))}
                                                    style={selectStyle} />
                                            </div>
                                            <div style={{ flex: '0 0 130px' }}>
                                                <label style={{ ...labelSm }}>Difficulty</label>
                                                <select value={aiConfig.difficulty} onChange={e => setAIConfig(c => ({ ...c, difficulty: e.target.value }))} style={selectStyle}>
                                                    <option value="easy">Easy</option>
                                                    <option value="medium">Medium</option>
                                                    <option value="hard">Hard</option>
                                                </select>
                                            </div>
                                            <div style={{ flex: 1, minWidth: 200 }}>
                                                <label style={{ ...labelSm }}>Question Types</label>
                                                <div style={{ display: 'flex', gap: 10, marginTop: 2 }}>
                                                    {[['multiple_choice', 'Multiple Choice'], ['true_false', 'True/False'], ['short_answer', 'Short Answer']].map(([val, label]) => (
                                                        <label key={val} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 13 }}>
                                                            <input type="checkbox" checked={aiConfig.questionTypes.includes(val)}
                                                                onChange={e => setAIConfig(c => ({
                                                                    ...c,
                                                                    questionTypes: e.target.checked
                                                                        ? [...c.questionTypes, val]
                                                                        : c.questionTypes.filter(t => t !== val)
                                                                }))} />
                                                            {label}
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                        <button
                                            className="btn btn-primary"
                                            onClick={handleGenerate}
                                            disabled={aiGenerating || aiConfig.questionTypes.length === 0}
                                            style={{ background: 'linear-gradient(135deg,#7c3aed,#4f46e5)', minWidth: 160 }}
                                        >
                                            {aiGenerating ? '⏳ Generating…' : `✨ Generate ${aiConfig.count} Questions`}
                                        </button>
                                        {aiGenerating && <p style={{ margin: '10px 0 0', fontSize: 13, color: '#6b7280' }}>AI is reading the lesson and drafting questions…</p>}
                                    </div>
                                ) : (
                                    /* Draft review */
                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                            <p style={{ margin: 0, fontSize: 13, color: '#374151' }}>
                                                Review the AI-drafted questions. Uncheck any you don't want.
                                            </p>
                                            <div style={{ display: 'flex', gap: 8 }}>
                                                <button className="btn btn-secondary btn-sm" onClick={() => dispatch(clearAIDraftQuestions())}>Regenerate</button>
                                                <button className="btn btn-primary btn-sm" onClick={handleAcceptDrafts}
                                                    style={{ background: 'linear-gradient(135deg,#7c3aed,#4f46e5)' }}>
                                                    ✓ Add Selected ({Object.values(draftSelections).filter(Boolean).length})
                                                </button>
                                            </div>
                                        </div>
                                        {aiDraftQuestions.map((q, idx) => {
                                            const accepted = draftSelections[idx] !== false;
                                            return (
                                                <div key={idx} style={{ background: accepted ? '#fff' : '#f9fafb', border: `1.5px solid ${accepted ? '#c4b5fd' : '#e5e7eb'}`, borderRadius: 10, padding: 14, marginBottom: 10, opacity: accepted ? 1 : 0.55 }}>
                                                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                                                        <input type="checkbox" checked={accepted}
                                                            onChange={e => setDraftSelections(prev => ({ ...prev, [idx]: e.target.checked }))}
                                                            style={{ marginTop: 3, flexShrink: 0 }} />
                                                        <div style={{ flex: 1 }}>
                                                            <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                                                                <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: '#ede9fe', color: '#4f46e5' }}>{q.questionType.replace('_', ' ')}</span>
                                                                <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: '#f3f4f6', color: '#6b7280' }}>{q.difficulty}</span>
                                                                <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 99, background: '#f3f4f6', color: '#6b7280' }}>{q.points} pt</span>
                                                            </div>
                                                            <p style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 500 }}>{q.questionText}</p>
                                                            {q.questionType === 'multiple_choice' && (
                                                                <div style={{ paddingLeft: 8 }}>
                                                                    {q.options.map(o => (
                                                                        <p key={o.label} style={{ margin: '2px 0', fontSize: 13, color: q.correctAnswer === o.label ? '#166534' : '#374151', fontWeight: q.correctAnswer === o.label ? 700 : 400 }}>
                                                                            {q.correctAnswer === o.label ? '✓ ' : ''}{o.label}. {o.text}
                                                                        </p>
                                                                    ))}
                                                                </div>
                                                            )}
                                                            {q.questionType === 'true_false' && (
                                                                <p style={{ margin: '4px 0 0', fontSize: 13, color: '#166534', fontWeight: 700 }}>✓ Answer: {q.correctAnswer}</p>
                                                            )}
                                                            {q.questionType === 'short_answer' && (
                                                                <p style={{ margin: '4px 0 0', fontSize: 13, color: '#166534' }}>Model answer: {q.correctAnswer}</p>
                                                            )}
                                                            {q.explanation && <p style={{ margin: '6px 0 0', fontSize: 12, color: '#6b7280', fontStyle: 'italic' }}>💬 {q.explanation}</p>}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Manual questions */}
                        {questions.length === 0 && !showAIPanel ? (
                            <div className="ss-empty" style={{ marginBottom: 0 }}>
                                <p>No questions yet</p>
                                <p>Add questions manually or generate them with AI from the lesson content.</p>
                            </div>
                        ) : (
                            questions.map((q, idx) => (
                                <QuestionEditor key={q._tempId || idx} q={q} idx={idx}
                                    onChange={updated => updateQuestion(idx, updated)}
                                    onDelete={() => deleteQuestion(idx)} />
                            ))
                        )}

                        {questions.length > 0 && (
                            <button className="btn btn-secondary" onClick={addQuestion} style={{ marginTop: 4 }}>+ Add Another Question</button>
                        )}
                    </div>
                )}
            </div>
    );
}

const inputStyle = { width: '100%', padding: '8px 12px', border: '1.5px solid var(--border-color,#e5e7eb)', borderRadius: 9, fontSize: 14, boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit', background: 'var(--bg-card,#fff)', color: 'var(--text-primary,#0f172a)', outline: 'none' };
const selectStyle = { padding: '5px 9px', border: '1.5px solid var(--border-color,#e5e7eb)', borderRadius: 8, fontSize: 13, background: 'var(--bg-card,#fff)', color: 'var(--text-primary,#0f172a)', cursor: 'pointer' };
const iconBtn = { background: 'var(--bg-tertiary,#f3f4f6)', border: '1px solid var(--border-color,#e5e7eb)', borderRadius: 8, padding: '5px 9px', cursor: 'pointer', fontSize: 14, lineHeight: 1 };
const labelSm = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary,#6b7280)', marginBottom: 4 };
