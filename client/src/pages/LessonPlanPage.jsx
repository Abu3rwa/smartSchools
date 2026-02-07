import { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { fetchClasses, selectClasses } from '../store/slices/classSlice';
import { fetchSubjects, selectSubjects } from '../store/slices/subjectSlice';
import { fetchLessons, createLesson, selectLessons, selectLessonsLoading, deleteLesson } from '../store/slices/lessonSlice';
import { selectCurrentAcademicYear } from '../store/slices/uiSlice';
import { HiOutlinePlus, HiOutlineTrash, HiOutlineLink, HiOutlineCalendar } from 'react-icons/hi';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import './LessonPlanPage.css';

const LessonPlanPage = () => {
    const dispatch = useDispatch();
    const classes = useSelector(selectClasses);
    const subjects = useSelector(selectSubjects);
    const lessons = useSelector(selectLessons);
    const loading = useSelector(selectLessonsLoading);
    const academicYear = useSelector(selectCurrentAcademicYear);

    const [showModal, setShowModal] = useState(false);
    const [formData, setFormData] = useState({
        date: format(new Date(), 'yyyy-MM-dd'),
        classId: '',
        subjectId: '',
        title: '',
        description: '',
        resources: [{ title: '', url: '' }]
    });

    useEffect(() => {
        dispatch(fetchClasses({ academicYear }));
        dispatch(fetchSubjects());
        dispatch(fetchLessons({ academicYear }));
    }, [dispatch, academicYear]);

    const handleAddResource = () => {
        setFormData({
            ...formData,
            resources: [...formData.resources, { title: '', url: '' }]
        });
    };

    const handleResourceChange = (index, field, value) => {
        const updatedResources = [...formData.resources];
        updatedResources[index][field] = value;
        setFormData({ ...formData, resources: updatedResources });
    };

    const handleRemoveResource = (index) => {
        const updatedResources = formData.resources.filter((_, i) => i !== index);
        setFormData({ ...formData, resources: updatedResources });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        // Filter out empty resources
        const sanitizedData = {
            ...formData,
            resources: formData.resources.filter(r => r.title || r.url)
        };

        const result = await dispatch(createLesson(sanitizedData));
        if (createLesson.fulfilled.match(result)) {
            toast.success('Lesson plan saved successfully');
            setShowModal(false);
            setFormData({
                date: format(new Date(), 'yyyy-MM-dd'),
                classId: '',
                subjectId: '',
                title: '',
                description: '',
                resources: [{ title: '', url: '' }]
            });
        } else {
            toast.error(result.payload || 'Failed to save lesson plan');
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm('Are you sure you want to delete this lesson plan?')) {
            const result = await dispatch(deleteLesson(id));
            if (deleteLesson.fulfilled.match(result)) {
                toast.success('Lesson plan deleted');
            }
        }
    };

    return (
        <div className="lesson-plan-page">
            <div className="page-header">
                <div>
                    <h1>Lesson Plans</h1>
                    <p className="text-muted">Plan and share lessons with parents</p>
                </div>
                <button className="btn btn-primary" onClick={() => setShowModal(true)}>
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
                        {lessons.map(lesson => (
                            <div key={lesson._id} className="card lesson-card">
                                <div className="lesson-header">
                                    <div className="lesson-date">
                                        <HiOutlineCalendar />
                                        {format(new Date(lesson.date), 'MMM d, yyyy')}
                                    </div>
                                    <button 
                                        className="btn btn-ghost btn-sm text-danger"
                                        onClick={() => handleDelete(lesson._id)}
                                    >
                                        <HiOutlineTrash />
                                    </button>
                                </div>
                                <h3>{lesson.title}</h3>
                                <p className="lesson-meta">
                                    {lesson.classId?.name} • {lesson.subjectId?.name}
                                </p>
                                <p className="lesson-desc">{lesson.description}</p>
                                
                                {lesson.resources?.length > 0 && (
                                    <div className="lesson-resources">
                                        <h4>Resources:</h4>
                                        <ul>
                                            {lesson.resources.map((res, i) => (
                                                <li key={i}>
                                                    <a href={res.url} target="_blank" rel="noopener noreferrer">
                                                        <HiOutlineLink />
                                                        {res.title || res.url}
                                                    </a>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
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

            {/* Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>Create Lesson Plan</h3>
                            <button className="modal-close" onClick={() => setShowModal(false)}>&times;</button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="modal-body">
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Date *</label>
                                        <input 
                                            type="date" 
                                            value={formData.date}
                                            onChange={(e) => setFormData({...formData, date: e.target.value})}
                                            required
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Class *</label>
                                        <select 
                                            value={formData.classId}
                                            onChange={(e) => setFormData({...formData, classId: e.target.value})}
                                            required
                                        >
                                            <option value="">Select Class</option>
                                            {classes.map(cls => (
                                                <option key={cls._id} value={cls._id}>{cls.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label>Subject *</label>
                                        <select 
                                            value={formData.subjectId}
                                            onChange={(e) => setFormData({...formData, subjectId: e.target.value})}
                                            required
                                        >
                                            <option value="">Select Subject</option>
                                            {subjects.map(sub => (
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
                                        onChange={(e) => setFormData({...formData, title: e.target.value})}
                                        placeholder="e.g. Introduction to Fractions"
                                        required
                                    />
                                </div>

                                <div className="form-group">
                                    <label>Description</label>
                                    <textarea 
                                        rows="4"
                                        value={formData.description}
                                        onChange={(e) => setFormData({...formData, description: e.target.value})}
                                        placeholder="What will be covered in this lesson?"
                                    ></textarea>
                                </div>

                                <div className="resources-section">
                                    <div className="section-header">
                                        <h4>Resources & Links</h4>
                                        <button type="button" className="btn btn-ghost btn-sm" onClick={handleAddResource}>
                                            <HiOutlinePlus /> Add Link
                                        </button>
                                    </div>
                                    {formData.resources.map((res, index) => (
                                        <div key={index} className="resource-row">
                                            <input 
                                                type="text" 
                                                placeholder="Title (e.g. Video Tutorial)"
                                                value={res.title}
                                                onChange={(e) => handleResourceChange(index, 'title', e.target.value)}
                                            />
                                            <input 
                                                type="url" 
                                                placeholder="URL (https://...)"
                                                value={res.url}
                                                onChange={(e) => handleResourceChange(index, 'url', e.target.value)}
                                            />
                                            <button 
                                                type="button" 
                                                className="btn btn-ghost btn-sm text-danger"
                                                onClick={() => handleRemoveResource(index)}
                                            >
                                                <HiOutlineTrash />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary">Save Lesson Plan</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LessonPlanPage;
