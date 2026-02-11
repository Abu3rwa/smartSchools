import { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { fetchClasses, selectClasses } from '../store/slices/classSlice';
import { fetchSubjects, selectSubjects } from '../store/slices/subjectSlice';
import {
    fetchLessons,
    createLesson,
    updateLesson,
    selectLessons,
    selectLessonsLoading,
    deleteLesson,
    generateSection
} from '../store/slices/lessonSlice';
import AISuggestButton from '../components/lessonPlan/AISuggestButton';
import StandardsSuggester from '../components/lessonPlan/StandardsSuggester';
import { selectCurrentAcademicYear } from '../store/slices/uiSlice';
import { HiOutlinePlus, HiOutlineTrash, HiOutlineCalendar, HiOutlinePencil } from 'react-icons/hi';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import './LessonPlanPage.css';

const DEFAULT_STAGES = [
    { name: 'Warm Up', procedure: '', materials: '', timing: '' },
    { name: 'Presentation of Content', procedure: '', materials: '', timing: '' },
    { name: 'Guided Practice', procedure: '', materials: '', timing: '' },
    { name: 'Individual Practice', procedure: '', materials: '', timing: '' },
    { name: 'Homework/Take Home Material', procedure: '', materials: '', timing: '' }
];

const getInitialFormData = () => ({
    date: format(new Date(), 'yyyy-MM-dd'),
    classId: '',
    subjectId: '',
    title: '',
    summary: '',
    description: '',
    homework: '',
    previousKnowledge: '',
    teachingObjectives: '',
    vocabulary: '',
    characterTraitLinks: '',
    techIntegration: '',
    standardIds: [],
    stages: DEFAULT_STAGES.map(s => ({ ...s }))
});

const lessonToFormData = (lesson) => {
    const d = lesson.date ? new Date(lesson.date) : new Date();
    const stdIds = Array.isArray(lesson.standardIds)
        ? lesson.standardIds.map(s => s._id || s)
        : [];
    return {
        date: format(d, 'yyyy-MM-dd'),
        classId: lesson.class?._id || lesson.class || '',
        subjectId: lesson.subject?._id || lesson.subject || '',
        title: lesson.title || '',
        summary: lesson.summary || '',
        description: lesson.description || '',
        homework: lesson.homework || '',
        previousKnowledge: lesson.previousKnowledge || '',
        teachingObjectives: lesson.teachingObjectives || '',
        vocabulary: lesson.vocabulary || '',
        characterTraitLinks: lesson.characterTraitLinks || '',
        techIntegration: lesson.techIntegration || '',
        standardIds: stdIds,
        stages: Array.isArray(lesson.stages) && lesson.stages.length
            ? lesson.stages.map(s => ({
                name: s.name ?? '',
                procedure: s.procedure ?? '',
                materials: s.materials ?? '',
                timing: s.timing ?? ''
            }))
            : DEFAULT_STAGES.map(s => ({ ...s }))
    };
};

const LessonPlanPage = () => {
    const dispatch = useDispatch();
    const classes = useSelector(selectClasses);
    const subjects = useSelector(selectSubjects);
    const lessons = useSelector(selectLessons);
    const loading = useSelector(selectLessonsLoading);
    const academicYear = useSelector(selectCurrentAcademicYear);

    const [showModal, setShowModal] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [formData, setFormData] = useState(getInitialFormData());
    const [activeSection, setActiveSection] = useState('basic');
    const [generatingSection, setGeneratingSection] = useState(false);

    useEffect(() => {
        dispatch(fetchClasses({ academicYear }));
        dispatch(fetchSubjects());
        dispatch(fetchLessons({ academicYear }));
    }, [dispatch, academicYear]);

    const openCreate = () => {
        setEditingId(null);
        setFormData(getInitialFormData());
        setActiveSection('basic');
        setShowModal(true);
    };

    const openEdit = (lesson) => {
        setEditingId(lesson._id);
        setFormData(lessonToFormData(lesson));
        setActiveSection('basic');
        setShowModal(true);
    };

    const closeModal = () => {
        setShowModal(false);
        setEditingId(null);
        setFormData(getInitialFormData());
    };

    const handleStageChange = (index, field, value) => {
        const next = formData.stages.map((s, i) =>
            i === index ? { ...s, [field]: value } : s
        );
        setFormData({ ...formData, stages: next });
    };

    const handleGenerateFromTitle = async () => {
        if (!formData.classId || !formData.subjectId || !formData.title?.trim()) {
            toast.error('Select Class, Subject, and enter a Title first');
            return;
        }
        setGeneratingSection(true);
        const result = await dispatch(generateSection({
            title: formData.title.trim(),
            subjectId: formData.subjectId,
            classId: formData.classId
        }));
        setGeneratingSection(false);
        if (generateSection.fulfilled.match(result)) {
            const g = result.payload?.generated || {};
            setFormData(prev => ({
                ...prev,
                summary: prev.summary || g.summary || '',
                description: prev.description || g.description || '',
                teachingObjectives: prev.teachingObjectives || g.teachingObjectives || '',
                vocabulary: prev.vocabulary || g.vocabulary || ''
            }));
            toast.success('Sections generated');
        } else {
            toast.error(result.payload || 'Generation failed');
        }
    };

    const buildPayload = () => ({
        class: formData.classId,
        subject: formData.subjectId,
        date: formData.date,
        title: formData.title.trim(),
        summary: formData.summary,
        description: formData.description,
        homework: formData.homework,
        previousKnowledge: formData.previousKnowledge,
        teachingObjectives: formData.teachingObjectives,
        vocabulary: formData.vocabulary,
        characterTraitLinks: formData.characterTraitLinks,
        techIntegration: formData.techIntegration,
        standardIds: formData.standardIds || [],
        stages: formData.stages
    });

    const handleSubmit = async (e) => {
        e.preventDefault();
        const payload = buildPayload();
        if (editingId) {
            const result = await dispatch(updateLesson({ id: editingId, lessonData: payload }));
            if (updateLesson.fulfilled.match(result)) {
                toast.success('Lesson plan updated');
                closeModal();
            } else {
                toast.error(result.payload || 'Failed to update lesson plan');
            }
        } else {
            const result = await dispatch(createLesson(payload));
            if (createLesson.fulfilled.match(result)) {
                toast.success('Lesson plan saved successfully');
                closeModal();
            } else {
                toast.error(result.payload || 'Failed to save lesson plan');
            }
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this lesson plan?')) return;
        const result = await dispatch(deleteLesson(id));
        if (deleteLesson.fulfilled.match(result)) {
            toast.success('Lesson plan deleted');
        } else {
            toast.error(result.payload || 'Failed to delete');
        }
    };

    return (
        <div className="lesson-plan-page">
            <div className="page-header">
                <div>
                    <h1>Lesson Plans</h1>
                    <p className="text-muted">Plan and share lessons with parents</p>
                </div>
                <button className="btn btn-primary" onClick={openCreate}>
                    <HiOutlinePlus size={20} />
                    New Lesson
                </button>
            </div>

            <div className="lessons-list mt-lg">
                {loading ? (
                    <div className="loading-container">
                        <div className="spinner"></div>
                    </div>
                ) : (
                    <div className="lessons-grid">
                        {lessons.map((lesson) => (
                            <div key={lesson._id} className="card lesson-card">
                                <div className="lesson-header">
                                    <div className="lesson-date">
                                        <HiOutlineCalendar />
                                        {format(new Date(lesson.date), 'MMM d, yyyy')}
                                    </div>
                                    <div className="lesson-actions">
                                        <button
                                            type="button"
                                            className="btn btn-ghost btn-sm"
                                            onClick={() => openEdit(lesson)}
                                            title="Edit"
                                        >
                                            <HiOutlinePencil />
                                        </button>
                                        <button
                                            type="button"
                                            className="btn btn-ghost btn-sm text-danger"
                                            onClick={() => handleDelete(lesson._id)}
                                            title="Delete"
                                        >
                                            <HiOutlineTrash />
                                        </button>
                                    </div>
                                </div>
                                <h3>{lesson.title}</h3>
                                <p className="lesson-meta">
                                    {lesson.class?.name} • {lesson.subject?.name}
                                </p>
                                {Array.isArray(lesson.standardIds) && lesson.standardIds.length > 0 && (
                                    <div className="lesson-standards-badges">
                                        {lesson.standardIds.map((s) => (
                                            <span key={s._id} className="badge">
                                                {s.code || s.name}
                                            </span>
                                        ))}
                                    </div>
                                )}
                                <p className="lesson-desc">
                                    {(lesson.summary || lesson.description || '').slice(0, 120)}
                                    {((lesson.summary || lesson.description || '').length > 120) ? '…' : ''}
                                </p>
                            </div>
                        ))}
                        {lessons.length === 0 && (
                            <div className="empty-state card">
                                <p>No lesson plans created yet.</p>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {showModal && (
                <div className="modal-overlay" onClick={closeModal}>
                    <div className="modal modal-lg lesson-plan-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>{editingId ? 'Edit Lesson Plan' : 'Create Lesson Plan'}</h3>
                            <button type="button" className="modal-close" onClick={closeModal}>&times;</button>
                        </div>
                        <div className="modal-tabs">
                            <button
                                type="button"
                                className={activeSection === 'basic' ? 'active' : ''}
                                onClick={() => setActiveSection('basic')}
                            >
                                Basic
                            </button>
                            <button
                                type="button"
                                className={activeSection === 'detailed' ? 'active' : ''}
                                onClick={() => setActiveSection('detailed')}
                            >
                                Detailed
                            </button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="modal-body">
                                {activeSection === 'basic' && (
                                    <>
                                        <div className="form-row">
                                            <div className="form-group">
                                                <label>Date *</label>
                                                <input
                                                    type="date"
                                                    value={formData.date}
                                                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                                                    required
                                                />
                                            </div>
                                            <div className="form-group">
                                                <label>Class *</label>
                                                <select
                                                    value={formData.classId}
                                                    onChange={(e) => setFormData({ ...formData, classId: e.target.value })}
                                                    required
                                                >
                                                    <option value="">Select Class</option>
                                                    {classes.map((cls) => (
                                                        <option key={cls._id} value={cls._id}>{cls.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="form-group">
                                                <label>Subject *</label>
                                                <select
                                                    value={formData.subjectId}
                                                    onChange={(e) => setFormData({ ...formData, subjectId: e.target.value })}
                                                    required
                                                >
                                                    <option value="">Select Subject</option>
                                                    {subjects.map((sub) => (
                                                        <option key={sub._id} value={sub._id}>{sub.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                        <div className="form-group form-group-with-suggest">
                                            <div>
                                                <label>Title *</label>
                                                <input
                                                    type="text"
                                                    value={formData.title}
                                                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                                    placeholder="e.g. Introduction to Fractions"
                                                    required
                                                />
                                            </div>
                                            <AISuggestButton
                                                field="title"
                                                currentValue={formData.title}
                                                subjectId={formData.subjectId}
                                                classId={formData.classId}
                                                onSuggestion={(s) => setFormData({ ...formData, title: s })}
                                            />
                                        </div>
                                        <button
                                            type="button"
                                            className="btn btn-secondary generate-from-title-btn"
                                            onClick={handleGenerateFromTitle}
                                            disabled={generatingSection || !formData.classId || !formData.subjectId || !formData.title?.trim()}
                                        >
                                            {generatingSection ? (
                                                <>
                                                    <span className="spinner-small" />
                                                    Generating…
                                                </>
                                            ) : (
                                                <>✨ Generate from title</>
                                            )}
                                        </button>
                                        <div className="form-group form-group-with-suggest">
                                            <div>
                                                <label>Summary</label>
                                                <textarea
                                                    rows={2}
                                                    value={formData.summary}
                                                    onChange={(e) => setFormData({ ...formData, summary: e.target.value })}
                                                    placeholder="Brief summary"
                                                />
                                            </div>
                                            <AISuggestButton
                                                field="summary"
                                                currentValue={formData.summary}
                                                subjectId={formData.subjectId}
                                                classId={formData.classId}
                                                title={formData.title}
                                                onSuggestion={(s) => setFormData({ ...formData, summary: s })}
                                            />
                                        </div>
                                        <div className="form-group form-group-with-suggest">
                                            <div>
                                                <label>Description</label>
                                                <textarea
                                                    rows={4}
                                                    value={formData.description}
                                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                                    placeholder="What will be covered in this lesson?"
                                                />
                                            </div>
                                            <AISuggestButton
                                                field="description"
                                                currentValue={formData.description}
                                                subjectId={formData.subjectId}
                                                classId={formData.classId}
                                                title={formData.title}
                                                summary={formData.summary}
                                                onSuggestion={(s) => setFormData({ ...formData, description: s })}
                                            />
                                        </div>
                                        <div className="form-group form-group-with-suggest">
                                            <div>
                                                <label>Homework</label>
                                                <textarea
                                                    rows={2}
                                                    value={formData.homework}
                                                    onChange={(e) => setFormData({ ...formData, homework: e.target.value })}
                                                    placeholder="Homework / take-home material"
                                                />
                                            </div>
                                            <AISuggestButton
                                                field="homework"
                                                currentValue={formData.homework}
                                                subjectId={formData.subjectId}
                                                classId={formData.classId}
                                                title={formData.title}
                                                summary={formData.summary}
                                                onSuggestion={(s) => setFormData({ ...formData, homework: s })}
                                            />
                                        </div>
                                    </>
                                )}
                                {activeSection === 'detailed' && (
                                    <>
                                        <div className="form-group form-group-with-suggest">
                                            <div>
                                                <label>Previous Knowledge / Skills</label>
                                                <textarea
                                                    rows={2}
                                                    value={formData.previousKnowledge}
                                                    onChange={(e) => setFormData({ ...formData, previousKnowledge: e.target.value })}
                                                />
                                            </div>
                                            <AISuggestButton
                                                field="previousKnowledge"
                                                currentValue={formData.previousKnowledge}
                                                subjectId={formData.subjectId}
                                                classId={formData.classId}
                                                title={formData.title}
                                                onSuggestion={(s) => setFormData({ ...formData, previousKnowledge: s })}
                                            />
                                        </div>
                                        <div className="form-group form-group-with-suggest">
                                            <div>
                                                <label>Teaching Objectives (Standards)</label>
                                                <textarea
                                                    rows={2}
                                                    value={formData.teachingObjectives}
                                                    onChange={(e) => setFormData({ ...formData, teachingObjectives: e.target.value })}
                                                />
                                            </div>
                                            <AISuggestButton
                                                field="teachingObjectives"
                                                currentValue={formData.teachingObjectives}
                                                subjectId={formData.subjectId}
                                                classId={formData.classId}
                                                title={formData.title}
                                                summary={formData.summary}
                                                onSuggestion={(s) => setFormData({ ...formData, teachingObjectives: s })}
                                            />
                                        </div>
                                        <StandardsSuggester
                                            subjectId={formData.subjectId}
                                            classId={formData.classId}
                                            lessonText={`${formData.title || ''}\n${formData.summary || ''}\n${formData.description || ''}\n${formData.teachingObjectives || ''}`}
                                            selectedStandardIds={formData.standardIds}
                                            onSelectionChange={(ids) => setFormData({ ...formData, standardIds: ids })}
                                        />
                                        <div className="form-group form-group-with-suggest">
                                            <div>
                                                <label>Vocabulary</label>
                                                <input
                                                    type="text"
                                                    value={formData.vocabulary}
                                                    onChange={(e) => setFormData({ ...formData, vocabulary: e.target.value })}
                                                    placeholder="Key vocabulary"
                                                />
                                            </div>
                                            <AISuggestButton
                                                field="vocabulary"
                                                currentValue={formData.vocabulary}
                                                subjectId={formData.subjectId}
                                                classId={formData.classId}
                                                title={formData.title}
                                                onSuggestion={(s) => setFormData({ ...formData, vocabulary: s })}
                                            />
                                        </div>
                                        <div className="form-group form-group-with-suggest">
                                            <div>
                                                <label>Links with Character Trait / Cognitive Skills</label>
                                                <input
                                                    type="text"
                                                    value={formData.characterTraitLinks}
                                                    onChange={(e) => setFormData({ ...formData, characterTraitLinks: e.target.value })}
                                                />
                                            </div>
                                            <AISuggestButton
                                                field="characterTraitLinks"
                                                currentValue={formData.characterTraitLinks}
                                                subjectId={formData.subjectId}
                                                classId={formData.classId}
                                                title={formData.title}
                                                onSuggestion={(s) => setFormData({ ...formData, characterTraitLinks: s })}
                                            />
                                        </div>
                                        <div className="form-group form-group-with-suggest">
                                            <div>
                                                <label>Tech Integration (if applicable)</label>
                                                <input
                                                    type="text"
                                                    value={formData.techIntegration}
                                                    onChange={(e) => setFormData({ ...formData, techIntegration: e.target.value })}
                                                />
                                            </div>
                                            <AISuggestButton
                                                field="techIntegration"
                                                currentValue={formData.techIntegration}
                                                subjectId={formData.subjectId}
                                                classId={formData.classId}
                                                title={formData.title}
                                                onSuggestion={(s) => setFormData({ ...formData, techIntegration: s })}
                                            />
                                        </div>
                                        <div className="stages-section">
                                            <h4>Stages – Procedure, Materials/Resources, Timing</h4>
                                            {formData.stages.map((stage, index) => (
                                                <div key={index} className="stage-block">
                                                    <div className="stage-name">{stage.name || `Stage ${index + 1}`}</div>
                                                    <div className="form-group form-group-with-suggest">
                                                        <div>
                                                            <label>Procedure</label>
                                                            <textarea
                                                                rows={2}
                                                                value={stage.procedure}
                                                                onChange={(e) => handleStageChange(index, 'procedure', e.target.value)}
                                                            />
                                                        </div>
                                                        <AISuggestButton
                                                            field="stageProcedure"
                                                            stageProcedure={stage.procedure}
                                                            stageIndex={index}
                                                            subjectId={formData.subjectId}
                                                            classId={formData.classId}
                                                            title={formData.title}
                                                            summary={formData.summary}
                                                            onSuggestion={(s) => handleStageChange(index, 'procedure', s)}
                                                        />
                                                    </div>
                                                    <div className="form-row">
                                                        <div className="form-group">
                                                            <label>Materials / Resources</label>
                                                            <input
                                                                type="text"
                                                                value={stage.materials}
                                                                onChange={(e) => handleStageChange(index, 'materials', e.target.value)}
                                                            />
                                                        </div>
                                                        <div className="form-group">
                                                            <label>Timing</label>
                                                            <input
                                                                type="text"
                                                                value={stage.timing}
                                                                onChange={(e) => handleStageChange(index, 'timing', e.target.value)}
                                                                placeholder="e.g. 10 min"
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={closeModal}>Cancel</button>
                                <button type="submit" className="btn btn-primary">
                                    {editingId ? 'Update Lesson Plan' : 'Save Lesson Plan'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LessonPlanPage;
