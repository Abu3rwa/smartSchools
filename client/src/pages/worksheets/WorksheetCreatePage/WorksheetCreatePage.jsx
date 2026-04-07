import { useState, useCallback, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
    HiOutlineArrowLeft,
    HiOutlineCloudArrowUp,
    HiOutlineCheckCircle
} from 'react-icons/hi2';
import {
    createWorksheet,
    selectWorksheetCreating
} from '../../../store/slices/worksheetSlice';
import './WorksheetCreatePage.css';

const STEPS = ['details', 'uploads', 'review'];

const WorksheetCreatePage = () => {
    const { t } = useTranslation(['worksheet', 'common']);
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const creating = useSelector(selectWorksheetCreating);

    const [step, setStep] = useState(0);
    const [form, setForm] = useState({
        title: '',
        classId: '',
        subjectId: '',
        academicYear: '',
        language: 'en',
        markingMode: 'hybrid',
        totalQuestions: '',
        maxScore: '',
        gradeLevel: '',
        description: ''
    });
    const [templateFile, setTemplateFile] = useState(null);
    const [answerKeyFile, setAnswerKeyFile] = useState(null);
    const [templatePreview, setTemplatePreview] = useState(null);
    const [answerKeyPreview, setAnswerKeyPreview] = useState(null);
    const templateRef = useRef(null);
    const answerKeyRef = useRef(null);

    // Load classes, subjects, academic years from store
    const classes = useSelector((s) => s.classes?.classes || []);
    const subjects = useSelector((s) => s.subjects?.subjects || []);
    const currentAcademicYear = useSelector((s) => s.ui?.currentAcademicYear);

    const handleField = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

    const handleTemplateSelect = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            setTemplateFile(file);
            setTemplatePreview(URL.createObjectURL(file));
        }
    };

    const handleAnswerKeySelect = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            setAnswerKeyFile(file);
            setAnswerKeyPreview(URL.createObjectURL(file));
        }
    };

    const canProceed = () => {
        if (step === 0) return form.title && form.classId && form.subjectId;
        return true;
    };

    const handleSubmit = useCallback(async () => {
        const formData = new FormData();
        formData.append('title', form.title);
        formData.append('classId', form.classId);
        formData.append('subjectId', form.subjectId);
        formData.append('academicYear', form.academicYear || currentAcademicYear);
        formData.append('language', form.language);
        formData.append('markingMode', form.markingMode);
        if (form.totalQuestions) formData.append('totalQuestions', form.totalQuestions);
        if (form.maxScore) formData.append('maxScore', form.maxScore);
        if (form.gradeLevel) formData.append('gradeLevel', form.gradeLevel);
        if (form.description) formData.append('description', form.description);
        if (templateFile) formData.append('templateImage', templateFile);
        if (answerKeyFile) formData.append('answerKeyImage', answerKeyFile);

        const res = await dispatch(createWorksheet(formData));
        if (!res.error) {
            toast.success(t('worksheet:notifications.worksheetCreated'));
            navigate(`/portal/worksheets/${res.payload?._id || ''}`);
        } else {
            toast.error(res.payload || t('worksheet:errors.createFailed'));
        }
    }, [dispatch, form, templateFile, answerKeyFile, currentAcademicYear, navigate, t]);

    return (
        <div className="worksheet-create-page">
            <button className="worksheet-back-btn" onClick={() => navigate('/portal/worksheets')}>
                <HiOutlineArrowLeft size={20} /> {t('worksheet:actions.back')}
            </button>
            <h1>{t('worksheet:create.title')}</h1>

            {/* Step indicator */}
            <div className="worksheet-steps">
                {STEPS.map((s, i) => (
                    <div key={s} className={`worksheet-step ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}>
                        <span className="step-number">{i < step ? '✓' : i + 1}</span>
                        <span className="step-label">{t(`worksheet:create.step${s.charAt(0).toUpperCase() + s.slice(1)}`)}</span>
                    </div>
                ))}
            </div>

            {/* Step 0: Details */}
            {step === 0 && (
                <div className="worksheet-step-content">
                    <div className="worksheet-form-grid">
                        <div className="form-field">
                            <label>{t('worksheet:create.fieldTitle')} *</label>
                            <input type="text" value={form.title} onChange={(e) => handleField('title', e.target.value)} maxLength={200} />
                        </div>
                        <div className="form-field">
                            <label>{t('worksheet:create.fieldClass')} *</label>
                            <select value={form.classId} onChange={(e) => handleField('classId', e.target.value)}>
                                <option value="">{t('common:select', 'Select...')}</option>
                                {classes.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
                            </select>
                        </div>
                        <div className="form-field">
                            <label>{t('worksheet:create.fieldSubject')} *</label>
                            <select value={form.subjectId} onChange={(e) => handleField('subjectId', e.target.value)}>
                                <option value="">{t('common:select', 'Select...')}</option>
                                {subjects.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
                            </select>
                        </div>
                        <div className="form-field">
                            <label>{t('worksheet:create.fieldLanguage')}</label>
                            <select value={form.language} onChange={(e) => handleField('language', e.target.value)}>
                                <option value="en">English</option>
                                <option value="ar">العربية</option>
                                <option value="fr">Français</option>
                                <option value="es">Español</option>
                            </select>
                        </div>
                        <div className="form-field">
                            <label>{t('worksheet:create.fieldMarkingMode')}</label>
                            <select value={form.markingMode} onChange={(e) => handleField('markingMode', e.target.value)}>
                                <option value="model">{t('worksheet:create.markingModeModel')}</option>
                                <option value="ai">{t('worksheet:create.markingModeAi')}</option>
                                <option value="hybrid">{t('worksheet:create.markingModeHybrid')}</option>
                            </select>
                        </div>
                        <div className="form-field">
                            <label>{t('worksheet:create.fieldTotalQuestions')}</label>
                            <input type="number" min={1} max={200} value={form.totalQuestions} onChange={(e) => handleField('totalQuestions', e.target.value)} />
                        </div>
                        <div className="form-field">
                            <label>{t('worksheet:create.fieldMaxScore')}</label>
                            <input type="number" min={1} max={1000} value={form.maxScore} onChange={(e) => handleField('maxScore', e.target.value)} />
                        </div>
                        <div className="form-field full-width">
                            <label>{t('worksheet:create.fieldDescription')}</label>
                            <textarea value={form.description} onChange={(e) => handleField('description', e.target.value)} rows={2} maxLength={1000} />
                        </div>
                    </div>
                </div>
            )}

            {/* Step 1: Uploads (all optional) */}
            {step === 1 && (
                <div className="worksheet-step-content">
                    <p className="worksheet-hint" style={{ fontStyle: 'italic', marginBottom: 20 }}>{t('worksheet:create.uploadOptionalHint')}</p>

                    <div className="worksheet-upload-row">
                        <div className="worksheet-upload-col">
                            <h3>{t('worksheet:create.uploadTemplate')}</h3>
                            <p className="worksheet-hint">{t('worksheet:create.uploadTemplateHint')}</p>
                            <div className="worksheet-upload-zone" onClick={() => templateRef.current?.click()}>
                                {templatePreview ? (
                                    <img src={templatePreview} alt="Template" className="worksheet-upload-preview" />
                                ) : (
                                    <>
                                        <HiOutlineCloudArrowUp size={36} />
                                        <span>{t('worksheet:actions.upload')}</span>
                                    </>
                                )}
                            </div>
                            <input ref={templateRef} type="file" accept="image/*" hidden onChange={handleTemplateSelect} />
                        </div>

                        <div className="worksheet-upload-col">
                            <h3>{t('worksheet:create.uploadAnswerKey')}</h3>
                            <p className="worksheet-hint">{t('worksheet:create.uploadAnswerKeyHint')}</p>
                            <div className="worksheet-upload-zone" onClick={() => answerKeyRef.current?.click()}>
                                {answerKeyPreview ? (
                                    <img src={answerKeyPreview} alt="Answer Key" className="worksheet-upload-preview" />
                                ) : (
                                    <>
                                        <HiOutlineCloudArrowUp size={36} />
                                        <span>{t('worksheet:actions.upload')}</span>
                                    </>
                                )}
                            </div>
                            <input ref={answerKeyRef} type="file" accept="image/*" hidden onChange={handleAnswerKeySelect} />
                        </div>
                    </div>
                </div>
            )}

            {/* Step 2: Review */}
            {step === 2 && (
                <div className="worksheet-step-content">
                    <h2>{t('worksheet:create.stepReview')}</h2>
                    <div className="worksheet-review-summary">
                        <div><strong>{t('worksheet:create.fieldTitle')}:</strong> {form.title}</div>
                        <div><strong>{t('worksheet:create.fieldClass')}:</strong> {classes.find(c => c._id === form.classId)?.name || form.classId}</div>
                        <div><strong>{t('worksheet:create.fieldSubject')}:</strong> {subjects.find(s => s._id === form.subjectId)?.name || form.subjectId}</div>
                        <div><strong>{t('worksheet:create.fieldLanguage')}:</strong> {form.language}</div>
                        <div><strong>{t('worksheet:create.fieldMarkingMode')}:</strong> {form.markingMode}</div>
                        {templatePreview && (
                            <div className="review-image">
                                <strong>{t('worksheet:create.uploadTemplate')}:</strong>
                                <img src={templatePreview} alt="Template" />
                            </div>
                        )}
                        {answerKeyPreview && (
                            <div className="review-image">
                                <strong>{t('worksheet:create.uploadAnswerKey')}:</strong>
                                <img src={answerKeyPreview} alt="Answer Key" />
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Navigation */}
            <div className="worksheet-step-nav">
                {step > 0 && (
                    <button className="worksheet-btn-secondary" onClick={() => setStep(s => s - 1)}>
                        {t('common:previous', 'Previous')}
                    </button>
                )}
                <div style={{ flex: 1 }} />
                {step < STEPS.length - 1 ? (
                    <button className="worksheet-btn-primary" disabled={!canProceed()} onClick={() => setStep(s => s + 1)}>
                        {t('common:next', 'Next')}
                    </button>
                ) : (
                    <button className="worksheet-btn-primary" disabled={creating} onClick={handleSubmit}>
                        <HiOutlineCheckCircle size={18} />
                        {creating ? t('common:saving', 'Saving...') : t('worksheet:actions.create')}
                    </button>
                )}
            </div>
        </div>
    );
};

export default WorksheetCreatePage;
