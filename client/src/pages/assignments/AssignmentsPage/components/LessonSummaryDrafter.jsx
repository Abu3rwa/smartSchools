import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
    HiOutlineDocumentText,
    HiOutlineLightningBolt,
    HiOutlineUpload,
    HiOutlineX
} from 'react-icons/hi';
import { useTranslation } from 'react-i18next';
import assignmentService from '../../../../services/assignmentService';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

const ERROR_KEYS = {
    DRAFT_SOURCE_REQUIRED: 'assignments:lessonSummary.drafter.errors.sourceRequired',
    LESSON_SUMMARY_SOURCE_EMPTY: 'assignments:lessonSummary.drafter.errors.sourceEmpty',
    LESSON_SUMMARY_RESPONSE_INVALID: 'assignments:lessonSummary.drafter.errors.invalidDraft',
    DOCUMENT_NO_TEXT: 'assignments:lessonSummary.drafter.errors.noText',
    DOCUMENT_PDF_UNREADABLE: 'assignments:lessonSummary.drafter.errors.pdfUnreadable',
    DOCUMENT_TYPE_UNSUPPORTED: 'assignments:lessonSummary.drafter.errors.unsupportedFile',
    DOCUMENT_TOO_LARGE: 'assignments:lessonSummary.drafter.errors.fileTooLarge',
    DOCUMENT_EMPTY_FILE: 'assignments:lessonSummary.drafter.errors.emptyFile'
};

const formatFileSize = (bytes) => `${(bytes / (1024 * 1024)).toFixed(bytes > 1024 * 1024 ? 1 : 2)} MB`;

const LessonSummaryDrafter = ({ disabled = false, onDrafted }) => {
    const { t } = useTranslation(['assignments']);
    const fileInputRef = useRef(null);
    const [file, setFile] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const canGenerate = !disabled && !loading && Boolean(file);

    const handleFileChange = (event) => {
        const chosen = event.target.files?.[0];
        event.target.value = '';
        if (!chosen) return;
        if (!ACCEPTED_TYPES.includes(chosen.type)) {
            setError(t('assignments:lessonSummary.drafter.errors.unsupportedFile'));
            setFile(null);
            return;
        }
        if (chosen.size > MAX_FILE_BYTES) {
            setError(t('assignments:lessonSummary.drafter.errors.fileTooLarge'));
            setFile(null);
            return;
        }
        setError('');
        setFile(chosen);
    };

    const errorMessageFor = (requestError) => {
        const code = requestError?.response?.data?.code || requestError?.code;
        if (code && ERROR_KEYS[code]) return t(ERROR_KEYS[code]);
        if (requestError?.response?.status === 429) return t('assignments:lessonSummary.drafter.errors.rateLimited');
        return requestError?.response?.data?.message
            || requestError?.message
            || t('assignments:lessonSummary.drafter.errors.failed');
    };

    const handleGenerate = async () => {
        if (!canGenerate) return;
        setLoading(true);
        setError('');
        try {
            const response = await assignmentService.draftSummary(file);
            const title = response?.data?.title || '';
            const instructions = response?.data?.instructions || '';
            if (!title || !instructions) {
                throw new Error(t('assignments:lessonSummary.drafter.errors.invalidDraft'));
            }
            onDrafted({ title, instructions });
            toast.success(t('assignments:lessonSummary.drafter.done'));
        } catch (requestError) {
            setError(errorMessageFor(requestError));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="question-drafter">
            <div className="question-drafter__head">
                <span className="question-drafter__icon" aria-hidden="true">
                    <HiOutlineLightningBolt />
                </span>
                <div>
                    <h4>{t('assignments:lessonSummary.drafter.title')}</h4>
                    <p>{t('assignments:lessonSummary.drafter.help')}</p>
                </div>
            </div>

            <div className="question-drafter__file">
                <div className="question-drafter__file-actions">
                    <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={disabled || loading}
                    >
                        <HiOutlineUpload />
                        {t('assignments:lessonSummary.drafter.chooseFile')}
                    </button>
                    {file && (
                        <button
                            type="button"
                            className="question-drafter__clear"
                            onClick={() => setFile(null)}
                            disabled={disabled || loading}
                            aria-label={t('assignments:lessonSummary.drafter.removeFile')}
                        >
                            <HiOutlineX />
                        </button>
                    )}
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,application/pdf,image/jpeg,image/png,image/webp"
                        hidden
                        onChange={handleFileChange}
                        aria-label={t('assignments:lessonSummary.drafter.chooseFile')}
                    />
                </div>
                {file ? (
                    <p className="question-drafter__file-name">
                        <HiOutlineDocumentText aria-hidden="true" />
                        <span>{file.name}</span>
                        <span className="question-drafter__file-size">{formatFileSize(file.size)}</span>
                    </p>
                ) : (
                    <p className="question-drafter__hint">{t('assignments:lessonSummary.drafter.fileTypes')}</p>
                )}
                <p className="question-drafter__hint">{t('assignments:lessonSummary.drafter.fileNotSaved')}</p>
            </div>

            {error && (
                <p className="question-drafter__error" role="alert">{error}</p>
            )}

            <div className="question-drafter__actions">
                <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={handleGenerate}
                    disabled={!canGenerate}
                >
                    <HiOutlineLightningBolt />
                    {loading
                        ? t('assignments:lessonSummary.drafter.generating')
                        : t('assignments:lessonSummary.drafter.generate')}
                </button>
                {!file && !error && (
                    <span className="question-drafter__hint">{t('assignments:lessonSummary.drafter.needFile')}</span>
                )}
            </div>
        </div>
    );
};

export default LessonSummaryDrafter;