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
    deleteLesson
} from '../store/slices/lessonSlice';
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
    stages: DEFAULT_STAGES.map(s => ({ ...s }))
});

const lessonToFormData = (lesson) => {
    const d = lesson.date ? new Date(lesson.date) : new Date();
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
                                        <div className="form-group">
                                            <label>Title *</label>
                                            <input
                                                type="text"
                                                value={formData.title}
                                                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                                placeholder="e.g. Introduction to Fractions"
                                                required
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label>Summary</label>
                                            <textarea
                                                rows={2}
                                                value={formData.summary}
                                                onChange={(e) => setFormData({ ...formData, summary: e.target.value })}
                                                placeholder="Brief summary"
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label>Description</label>
                                            <textarea
                                                rows={4}
                                                value={formData.description}
                                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                                placeholder="What will be covered in this lesson?"
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label>Homework</label>
                                            <textarea
                                                rows={2}
                                                value={formData.homework}
                                                onChange={(e) => setFormData({ ...formData, homework: e.target.value })}
                                                placeholder="Homework / take-home material"
                                            />
                                        </div>
                                    </>
                                )}
                                {activeSection === 'detailed' && (
                                    <>
                                        <div className="form-group">
                                            <label>Previous Knowledge / Skills</label>
                                            <textarea
                                                rows={2}
                                                value={formData.previousKnowledge}
                                                onChange={(e) => setFormData({ ...formData, previousKnowledge: e.target.value })}
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label>Teaching Objectives (Standards)</label>
                                            <textarea
                                                rows={2}
                                                value={formData.teachingObjectives}
                                                onChange={(e) => setFormData({ ...formData, teachingObjectives: e.target.value })}
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label>Vocabulary</label>
                                            <input
                                                type="text"
                                                value={formData.vocabulary}
                                                onChange={(e) => setFormData({ ...formData, vocabulary: e.target.value })}
                                                placeholder="Key vocabulary"
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label>Links with Character Trait / Cognitive Skills</label>
                                            <input
                                                type="text"
                                                value={formData.characterTraitLinks}
                                                onChange={(e) => setFormData({ ...formData, characterTraitLinks: e.target.value })}
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label>Tech Integration (if applicable)</label>
                                            <input
                                                type="text"
                                                value={formData.techIntegration}
                                                onChange={(e) => setFormData({ ...formData, techIntegration: e.target.value })}
                                            />
                                        </div>
                                        <div className="stages-section">
                                            <h4>Stages – Procedure, Materials/Resources, Timing</h4>
                                            {formData.stages.map((stage, index) => (
                                                <div key={index} className="stage-block">
                                                    <div className="stage-name">{stage.name || `Stage ${index + 1}`}</div>
                                                    <div className="form-group">
                                                        <label>Procedure</label>
                                                        <textarea
                                                            rows={2}
                                                            value={stage.procedure}
                                                            onChange={(e) => handleStageChange(index, 'procedure', e.target.value)}
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
