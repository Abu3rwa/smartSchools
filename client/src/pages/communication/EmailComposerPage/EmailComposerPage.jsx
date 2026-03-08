import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { HiOutlineClock, HiOutlineSparkles } from 'react-icons/hi';
import Editor, {
    BtnBold,
    BtnBulletList,
    BtnClearFormatting,
    BtnItalic,
    BtnLink,
    BtnNumberedList,
    BtnRedo,
    BtnUnderline,
    BtnUndo,
    Toolbar
} from 'react-simple-wysiwyg';
import {
    downloadCommunicationAttachment,
    fetchCommunicationComposerConfig,
    fetchCommunicationEmailHistory,
    fetchCommunicationRecipientSuggestions,
    generateCommunicationEmailDraft,
    previewCommunicationRecipients,
    removeCommunicationAttachment,
    sendCommunicationEmail,
    uploadCommunicationAttachments
} from '../../../api/communicationEmailApi';
import UpgradePrompt from '../../../components/UpgradePrompt';
import './EmailComposerPage.css';

const DEFAULT_FIELD_STATE = {
    selected: [],
    search: '',
    options: [],
    loading: false,
    open: false
};

const initialFields = () => ({
    parents: { ...DEFAULT_FIELD_STATE },
    teachers: { ...DEFAULT_FIELD_STATE },
    students: { ...DEFAULT_FIELD_STATE }
});

const DEFAULT_BODY_HTML = '<p><br></p>';
const DRAFT_STORAGE_PREFIX = 'communication-email-draft-v1';

const sanitizeTokenArray = (items = []) => (
    (Array.isArray(items) ? items : [])
        .map((item) => ({
            key: String(item?.key || '').trim(),
            label: String(item?.label || '').trim(),
            tokenType: item?.tokenType === 'individual' ? 'individual' : 'group',
            audience: String(item?.audience || '').trim(),
            subtitle: String(item?.subtitle || '').trim()
        }))
        .filter((item) => item.key)
);

const sanitizeAttachmentArray = (items = []) => (
    (Array.isArray(items) ? items : [])
        .map((item) => ({
            id: String(item?.id || item?._id || '').trim(),
            originalName: String(item?.originalName || item?.filename || '').trim(),
            mimeType: String(item?.mimeType || '').trim(),
            size: Number(item?.size || 0)
        }))
        .filter((item) => item.id && item.originalName)
);

const formatDateTime = (value) => {
    if (!value) return '—';
    try {
        return new Date(value).toLocaleString();
    } catch {
        return '—';
    }
};

const toLocalDateTimeInputValue = (value) => {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hour}:${minute}`;
};

const formatFileSize = (bytes) => {
    const size = Number(bytes || 0);
    if (!Number.isFinite(size) || size <= 0) return '0 KB';
    if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const isGroupToken = (token) => token?.tokenType === 'group';

const RecipientSelectorField = ({
    fieldKey,
    label,
    state,
    disabled,
    onFocus,
    onBlur,
    onSearchChange,
    onAddToken,
    onRemoveToken
}) => {
    const placeholder = `Search ${label.toLowerCase()}...`;

    return (
        <div className="recipient-field">
            <div className="recipient-selected-list">
                {state.selected.map((token) => (
                    <span
                        key={token.key}
                        className={`recipient-chip ${isGroupToken(token) ? 'group' : 'individual'} audience-${token.audience || fieldKey}`}
                        title={token.subtitle || token.label}
                    >
                        <span className="chip-audience">{token.audience || fieldKey}</span>
                        <span className="chip-label">{token.label}</span>
                        <button
                            type="button"
                            className="chip-remove"
                            onClick={() => onRemoveToken(fieldKey, token.key)}
                            disabled={disabled}
                            aria-label={`Remove ${token.label}`}
                        >
                            ×
                        </button>
                    </span>
                ))}
                {state.selected.length === 0 && (
                    <span className="recipient-empty">No recipients selected</span>
                )}
            </div>

            <input
                type="text"
                value={state.search}
                placeholder={placeholder}
                onFocus={() => onFocus(fieldKey)}
                onBlur={() => onBlur(fieldKey)}
                onChange={(event) => onSearchChange(fieldKey, event.target.value)}
                disabled={disabled}
            />

            {state.open && (
                <div className="recipient-suggestions">
                    {state.loading && <div className="recipient-suggestion-row muted">Loading suggestions...</div>}
                    {!state.loading && state.options.length === 0 && (
                        <div className="recipient-suggestion-row muted">No suggestions in your allowed scope</div>
                    )}
                    {!state.loading && state.options.map((option) => (
                        <button
                            key={option.key}
                            type="button"
                            className="recipient-suggestion-row"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => onAddToken(fieldKey, option)}
                        >
                            <span className={`suggestion-type ${option.tokenType || 'group'}`}>
                                {option.tokenType || 'group'}
                            </span>
                            <span className="suggestion-main">
                                <span className="suggestion-label">{option.label}</span>
                                {option.subtitle ? (
                                    <span className="suggestion-subtitle">{option.subtitle}</span>
                                ) : null}
                            </span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

const RichTextEditor = ({ value, onChange, disabled }) => {
    const handleChange = (event) => {
        onChange(event?.target?.value || '');
    };

    return (
        <div className={`rich-editor ${disabled ? 'disabled' : ''}`}>
            <Editor
                value={value}
                onChange={handleChange}
                disabled={disabled}
                placeholder="Write your email message..."
            >
                <Toolbar>
                    <BtnUndo />
                    <BtnRedo />
                    <BtnBold />
                    <BtnItalic />
                    <BtnUnderline />
                    <BtnBulletList />
                    <BtnNumberedList />
                    <BtnLink />
                    <BtnClearFormatting />
                </Toolbar>
            </Editor>
        </div>
    );
};

const EmailComposerPage = () => {
    const [config, setConfig] = useState(null);
    const [loadingConfig, setLoadingConfig] = useState(true);
    const [fields, setFields] = useState(initialFields);
    const [subject, setSubject] = useState('');
    const [bodyHtml, setBodyHtml] = useState(DEFAULT_BODY_HTML);
    const [deliveryMode, setDeliveryMode] = useState('now');
    const [scheduledForLocal, setScheduledForLocal] = useState('');
    const [clientTimeZone] = useState(() => {
        const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        return zone || 'UTC';
    });
    const [previewModal, setPreviewModal] = useState(null);
    const [sending, setSending] = useState(false);
    const [history, setHistory] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [attachments, setAttachments] = useState([]);
    const [uploadingAttachments, setUploadingAttachments] = useState(false);
    const [downloadingAttachmentId, setDownloadingAttachmentId] = useState(null);
    const [showAiDraftModal, setShowAiDraftModal] = useState(false);
    const [aiDraftPrompt, setAiDraftPrompt] = useState('');
    const [aiDraftTone, setAiDraftTone] = useState('professional');
    const [generatingAiDraft, setGeneratingAiDraft] = useState(false);
    const [draftHydrated, setDraftHydrated] = useState(false);
    const fileInputRef = useRef(null);
    const searchTimersRef = useRef({});

    const totalSelected = useMemo(() => (
        fields.parents.selected.length
        + fields.teachers.selected.length
        + fields.students.selected.length
    ), [fields.parents.selected.length, fields.teachers.selected.length, fields.students.selected.length]);

    const aiDraftCapability = useMemo(() => {
        const capability = config?.capabilities?.aiDraft || {};
        return {
            featureAvailable: Boolean(capability.featureAvailable),
            schoolEnabled: capability.schoolEnabled !== false,
            canUse: Boolean(capability.canUse),
            reason: capability.reason || 'plan_locked'
        };
    }, [config?.capabilities?.aiDraft]);

    const draftStorageKey = useMemo(() => {
        const senderEmail = String(config?.sender?.email || '').trim().toLowerCase();
        return senderEmail
            ? `${DRAFT_STORAGE_PREFIX}:${senderEmail}`
            : `${DRAFT_STORAGE_PREFIX}:unknown`;
    }, [config?.sender?.email]);

    useEffect(() => {
        setDraftHydrated(false);
    }, [draftStorageKey]);

    const loadComposerConfig = useCallback(async () => {
        setLoadingConfig(true);
        try {
            const data = await fetchCommunicationComposerConfig();
            setConfig(data);
        } catch (error) {
            toast.error(error.message || 'Failed to load composer');
        } finally {
            setLoadingConfig(false);
        }
    }, []);

    const loadHistory = useCallback(async () => {
        setHistoryLoading(true);
        try {
            const data = await fetchCommunicationEmailHistory({ page: 1, limit: 15 });
            setHistory(data.items || []);
        } catch (error) {
            toast.error(error.message || 'Failed to load history');
        } finally {
            setHistoryLoading(false);
        }
    }, []);

    useEffect(() => {
        loadComposerConfig();
        loadHistory();
    }, [loadComposerConfig, loadHistory]);

    useEffect(() => {
        if (loadingConfig || !config || draftHydrated) return;

        try {
            const raw = window.localStorage.getItem(draftStorageKey);
            if (raw) {
                const parsed = JSON.parse(raw);
                setSubject(String(parsed?.subject || ''));
                setBodyHtml(String(parsed?.bodyHtml || DEFAULT_BODY_HTML) || DEFAULT_BODY_HTML);
                setAiDraftTone(String(parsed?.aiDraftTone || 'professional'));
                setDeliveryMode(parsed?.deliveryMode === 'schedule' ? 'schedule' : 'now');
                setScheduledForLocal(String(parsed?.scheduledForLocal || ''));
                setFields({
                    parents: {
                        ...DEFAULT_FIELD_STATE,
                        selected: sanitizeTokenArray(parsed?.fields?.parents)
                    },
                    teachers: {
                        ...DEFAULT_FIELD_STATE,
                        selected: sanitizeTokenArray(parsed?.fields?.teachers)
                    },
                    students: {
                        ...DEFAULT_FIELD_STATE,
                        selected: sanitizeTokenArray(parsed?.fields?.students)
                    }
                });
                setAttachments(sanitizeAttachmentArray(parsed?.attachments));
            }
        } catch {
            window.localStorage.removeItem(draftStorageKey);
        } finally {
            setDraftHydrated(true);
        }
    }, [config, draftHydrated, draftStorageKey, loadingConfig]);

    useEffect(() => {
        if (!config || !draftHydrated) return;
        const payload = {
            subject: String(subject || ''),
            bodyHtml: String(bodyHtml || DEFAULT_BODY_HTML) || DEFAULT_BODY_HTML,
            aiDraftTone: String(aiDraftTone || 'professional'),
            deliveryMode,
            scheduledForLocal: String(scheduledForLocal || ''),
            fields: {
                parents: fields.parents.selected,
                teachers: fields.teachers.selected,
                students: fields.students.selected
            },
            attachments
        };
        window.localStorage.setItem(draftStorageKey, JSON.stringify(payload));
    }, [
        aiDraftTone,
        attachments,
        bodyHtml,
        config,
        deliveryMode,
        draftHydrated,
        draftStorageKey,
        fields.parents.selected,
        fields.students.selected,
        fields.teachers.selected,
        scheduledForLocal,
        subject
    ]);

    useEffect(() => () => {
        Object.values(searchTimersRef.current || {}).forEach((timerId) => {
            if (timerId) window.clearTimeout(timerId);
        });
    }, []);

    const loadSuggestions = useCallback(async (fieldKey, queryValue = '') => {
        setFields((previous) => ({
            ...previous,
            [fieldKey]: {
                ...previous[fieldKey],
                loading: true
            }
        }));
        try {
            const data = await fetchCommunicationRecipientSuggestions({
                field: fieldKey,
                query: queryValue,
                limit: 20,
                page: 1
            });
            setFields((previous) => {
                const selectedKeySet = new Set(previous[fieldKey].selected.map((token) => token.key));
                const options = (data.suggestions || []).filter((option) => !selectedKeySet.has(option.key));
                return {
                    ...previous,
                    [fieldKey]: {
                        ...previous[fieldKey],
                        options,
                        loading: false
                    }
                };
            });
        } catch (error) {
            setFields((previous) => ({
                ...previous,
                [fieldKey]: {
                    ...previous[fieldKey],
                    loading: false,
                    options: []
                }
            }));
            toast.error(error.message || 'Failed to load recipient suggestions');
        }
    }, []);

    const handleFieldFocus = useCallback((fieldKey) => {
        setFields((previous) => ({
            ...previous,
            [fieldKey]: {
                ...previous[fieldKey],
                open: true
            }
        }));
        loadSuggestions(fieldKey, fields[fieldKey].search || '');
    }, [fields, loadSuggestions]);

    const handleFieldBlur = useCallback((fieldKey) => {
        window.setTimeout(() => {
            setFields((previous) => ({
                ...previous,
                [fieldKey]: {
                    ...previous[fieldKey],
                    open: false
                }
            }));
        }, 120);
    }, []);

    const handleFieldSearchChange = useCallback((fieldKey, value) => {
        setFields((previous) => ({
            ...previous,
            [fieldKey]: {
                ...previous[fieldKey],
                search: value,
                open: true
            }
        }));

        if (searchTimersRef.current[fieldKey]) {
            window.clearTimeout(searchTimersRef.current[fieldKey]);
        }
        searchTimersRef.current[fieldKey] = window.setTimeout(() => {
            loadSuggestions(fieldKey, value);
        }, 250);
    }, [loadSuggestions]);

    const handleAddToken = useCallback((fieldKey, token) => {
        setFields((previous) => {
            if (previous[fieldKey].selected.some((item) => item.key === token.key)) {
                return previous;
            }
            const nextSelected = [...previous[fieldKey].selected, token];
            return {
                ...previous,
                [fieldKey]: {
                    ...previous[fieldKey],
                    selected: nextSelected,
                    search: '',
                    open: false,
                    options: previous[fieldKey].options.filter((item) => item.key !== token.key)
                }
            };
        });
    }, []);

    const handleRemoveToken = useCallback((fieldKey, tokenKey) => {
        setFields((previous) => ({
            ...previous,
            [fieldKey]: {
                ...previous[fieldKey],
                selected: previous[fieldKey].selected.filter((item) => item.key !== tokenKey)
            }
        }));
    }, []);

    const clearComposer = useCallback(async ({ cleanupUploads = true, clearStoredDraft = true } = {}) => {
        if (cleanupUploads && attachments.length > 0) {
            await Promise.allSettled(
                attachments.map((attachment) => removeCommunicationAttachment(attachment.id))
            );
        }
        setFields(initialFields());
        setSubject('');
        setBodyHtml(DEFAULT_BODY_HTML);
        setDeliveryMode('now');
        setScheduledForLocal('');
        setAttachments([]);
        setPreviewModal(null);
        if (clearStoredDraft) {
            window.localStorage.removeItem(draftStorageKey);
        }
    }, [attachments, draftStorageKey]);

    const selectedPayload = useMemo(() => ({
        toParents: fields.parents.selected,
        toTeachers: fields.teachers.selected,
        toStudents: fields.students.selected,
        attachmentIds: attachments.map((attachment) => attachment.id)
    }), [attachments, fields.parents.selected, fields.teachers.selected, fields.students.selected]);

    const handleAttachmentUpload = useCallback(async (event) => {
        const incomingFiles = Array.from(event.target.files || []);
        if (incomingFiles.length === 0) return;
        const remainingSlots = Math.max(0, 5 - attachments.length);
        if (remainingSlots <= 0) {
            toast.error('Maximum 5 attachments are allowed');
            event.target.value = '';
            return;
        }
        const files = incomingFiles.slice(0, remainingSlots);
        setUploadingAttachments(true);
        try {
            const result = await uploadCommunicationAttachments(files);
            setAttachments((previous) => [...previous, ...(result.attachments || [])]);
            if (incomingFiles.length > remainingSlots) {
                toast.error(`Only ${remainingSlots} attachment(s) were added (max 5)`);
            }
        } catch (error) {
            toast.error(error.message || 'Failed to upload attachment(s)');
        } finally {
            setUploadingAttachments(false);
            event.target.value = '';
        }
    }, [attachments.length]);

    const handleRemoveAttachment = useCallback(async (attachmentId) => {
        try {
            await removeCommunicationAttachment(attachmentId);
            setAttachments((previous) => previous.filter((attachment) => attachment.id !== attachmentId));
        } catch (error) {
            toast.error(error.message || 'Failed to remove attachment');
        }
    }, []);

    const handleGenerateAiDraft = useCallback(async () => {
        const prompt = aiDraftPrompt.trim();
        if (!prompt) {
            toast.error('Please describe what you want the email to say');
            return;
        }
        if (!aiDraftCapability.canUse) {
            toast.error(aiDraftCapability.reason === 'disabled_by_school_admin'
                ? 'AI drafting is disabled by your school administrator'
                : 'AI drafting is not available on your school plan');
            return;
        }

        setGeneratingAiDraft(true);
        try {
            const result = await generateCommunicationEmailDraft({
                prompt,
                tone: aiDraftTone,
                toParents: fields.parents.selected,
                toTeachers: fields.teachers.selected,
                toStudents: fields.students.selected
            });
            setBodyHtml(result.bodyHtml || DEFAULT_BODY_HTML);
            setShowAiDraftModal(false);
            setAiDraftPrompt('');
            toast.success('AI draft generated');
        } catch (error) {
            toast.error(error.message || 'Failed to generate AI draft');
        } finally {
            setGeneratingAiDraft(false);
        }
    }, [
        aiDraftCapability.canUse,
        aiDraftCapability.reason,
        aiDraftPrompt,
        aiDraftTone,
        fields.parents.selected,
        fields.students.selected,
        fields.teachers.selected
    ]);

    const handleDownloadAttachment = useCallback(async (attachment) => {
        setDownloadingAttachmentId(attachment.id);
        try {
            await downloadCommunicationAttachment(attachment);
        } catch (error) {
            toast.error(error.message || 'Failed to download attachment');
        } finally {
            setDownloadingAttachmentId(null);
        }
    }, []);

    const handlePreviewSend = useCallback(async () => {
        if (!subject.trim()) {
            toast.error('Subject is required');
            return;
        }
        if (!bodyHtml || bodyHtml.replace(/<[^>]*>/g, '').trim().length === 0) {
            toast.error('Message body is required');
            return;
        }
        if (totalSelected === 0) {
            toast.error('Select at least one recipient token');
            return;
        }
        if (deliveryMode === 'schedule') {
            if (!scheduledForLocal) {
                toast.error('Choose a scheduled date/time');
                return;
            }
            const scheduledDate = new Date(scheduledForLocal);
            if (Number.isNaN(scheduledDate.getTime())) {
                toast.error('Invalid scheduled date/time');
                return;
            }
            if (scheduledDate.getTime() <= Date.now() + 60 * 1000) {
                toast.error('Scheduled time must be at least 1 minute in the future');
                return;
            }
        }

        try {
            const preview = await previewCommunicationRecipients(selectedPayload);
            setPreviewModal(preview);
        } catch (error) {
            toast.error(error.message || 'Failed to preview recipients');
        }
    }, [bodyHtml, deliveryMode, scheduledForLocal, selectedPayload, subject, totalSelected]);

    const handleConfirmSend = useCallback(async () => {
        if (!previewModal) return;
        setSending(true);
        try {
            const result = await sendCommunicationEmail({
                subject: subject.trim(),
                bodyHtml,
                ...selectedPayload,
                ...(deliveryMode === 'schedule'
                    ? {
                        scheduledForLocal,
                        clientTimeZone
                    }
                    : {})
            });
            if (result.status === 'scheduled') {
                toast.success(`Email scheduled for ${formatDateTime(result.scheduledFor)}`);
            } else if (result.status === 'partial') {
                toast.success(`Sent with partial failures (${result.totalSent} sent, ${result.totalFailed} failed)`);
            } else if (result.status === 'failed') {
                toast.error('Email sending failed');
            } else {
                toast.success(`Email sent to ${result.totalSent} recipients`);
            }
            setPreviewModal(null);
            await clearComposer({ cleanupUploads: false, clearStoredDraft: true });
            await loadHistory();
        } catch (error) {
            toast.error(error.message || 'Failed to send communication email');
        } finally {
            setSending(false);
        }
    }, [
        bodyHtml,
        clearComposer,
        clientTimeZone,
        deliveryMode,
        loadHistory,
        previewModal,
        scheduledForLocal,
        selectedPayload,
        subject
    ]);

    if (loadingConfig) {
        return (
            <div className="email-composer-page">
                <div className="page-header">
                    <h1>Email Composer</h1>
                </div>
                <div className="email-composer-card">Loading composer...</div>
            </div>
        );
    }

    if (!config?.canUseComposer) {
        return (
            <div className="email-composer-page">
                <div className="page-header">
                    <h1>Email Composer</h1>
                </div>
                <div className="email-composer-card">
                    You do not currently have communication scope to send email from this screen.
                </div>
            </div>
        );
    }

    return (
        <div className="email-composer-page">
            <div className="page-header">
                <h1>Email Composer</h1>
                <p className="text-muted">QuickSchools-style scoped communication for students, parents, and teachers.</p>
            </div>

            <div className="email-composer-card">
                <div className="email-row">
                    <label>Email from</label>
                    <div className="email-row-input">
                        <input
                            type="text"
                            value={config.sender.email
                                ? `${config.sender.displayName} <${config.sender.email}>`
                                : config.sender.displayName}
                            readOnly
                        />
                    </div>
                </div>

                <div className="email-row">
                    <label>To the parents of</label>
                    <div className="email-row-input">
                        <RecipientSelectorField
                            fieldKey="parents"
                            label="Parents"
                            state={fields.parents}
                            disabled={sending}
                            onFocus={handleFieldFocus}
                            onBlur={handleFieldBlur}
                            onSearchChange={handleFieldSearchChange}
                            onAddToken={handleAddToken}
                            onRemoveToken={handleRemoveToken}
                        />
                    </div>
                </div>

                <div className="email-row">
                    <label>To teachers</label>
                    <div className="email-row-input">
                        <RecipientSelectorField
                            fieldKey="teachers"
                            label="Teachers"
                            state={fields.teachers}
                            disabled={sending}
                            onFocus={handleFieldFocus}
                            onBlur={handleFieldBlur}
                            onSearchChange={handleFieldSearchChange}
                            onAddToken={handleAddToken}
                            onRemoveToken={handleRemoveToken}
                        />
                    </div>
                </div>

                <div className="email-row">
                    <label>To students</label>
                    <div className="email-row-input">
                        <RecipientSelectorField
                            fieldKey="students"
                            label="Students"
                            state={fields.students}
                            disabled={sending}
                            onFocus={handleFieldFocus}
                            onBlur={handleFieldBlur}
                            onSearchChange={handleFieldSearchChange}
                            onAddToken={handleAddToken}
                            onRemoveToken={handleRemoveToken}
                        />
                    </div>
                </div>

                <div className="email-row">
                    <label>Subject</label>
                    <div className="email-row-input">
                        <input
                            type="text"
                            value={subject}
                            maxLength={220}
                            onChange={(event) => setSubject(event.target.value)}
                            disabled={sending}
                        />
                    </div>
                </div>

                <div className="email-row">
                    <label>Delivery</label>
                    <div className="email-row-input">
                        <div className="delivery-controls">
                            <label className="delivery-option">
                                <input
                                    type="radio"
                                    name="delivery-mode"
                                    value="now"
                                    checked={deliveryMode === 'now'}
                                    onChange={() => setDeliveryMode('now')}
                                    disabled={sending || uploadingAttachments}
                                />
                                <span>Send now</span>
                            </label>
                            <label className="delivery-option">
                                <input
                                    type="radio"
                                    name="delivery-mode"
                                    value="schedule"
                                    checked={deliveryMode === 'schedule'}
                                    onChange={() => setDeliveryMode('schedule')}
                                    disabled={sending || uploadingAttachments}
                                />
                                <span>Schedule send</span>
                            </label>
                        </div>
                        {deliveryMode === 'schedule' && (
                            <div className="schedule-input-row">
                                <input
                                    type="datetime-local"
                                    value={scheduledForLocal}
                                    onChange={(event) => setScheduledForLocal(event.target.value)}
                                    disabled={sending || uploadingAttachments}
                                    min={toLocalDateTimeInputValue(Date.now() + 60 * 1000)}
                                />
                                <span className="timezone-pill">
                                    <HiOutlineClock aria-hidden="true" />
                                    {clientTimeZone}
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                <div className="email-row">
                    <label>Message</label>
                    <div className="email-row-input">
                        <div className="ai-draft-toolbar">
                            {aiDraftCapability.canUse && (
                                <button
                                    type="button"
                                    className="btn btn-secondary btn-ai-draft"
                                    onClick={() => setShowAiDraftModal(true)}
                                    disabled={sending || uploadingAttachments || generatingAiDraft}
                                >
                                    <HiOutlineSparkles aria-hidden="true" />
                                    <span>{generatingAiDraft ? 'Generating draft...' : 'AI Draft'}</span>
                                </button>
                            )}
                            {!aiDraftCapability.canUse && aiDraftCapability.reason === 'plan_locked' && (
                                <UpgradePrompt feature="aiEmailDrafts" compact />
                            )}
                            {!aiDraftCapability.canUse && aiDraftCapability.reason === 'disabled_by_school_admin' && (
                                <span className="text-muted">
                                    AI drafting is disabled by your school administrator.
                                </span>
                            )}
                        </div>
                        <RichTextEditor value={bodyHtml} onChange={setBodyHtml} disabled={sending} />
                    </div>
                </div>

                <div className="email-row">
                    <label>Attachment</label>
                    <div className="email-row-input">
                        {config.capabilities.attachmentsSupported ? (
                            <div className="attachments-panel">
                                <div className="attachments-toolbar">
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        multiple
                                        className="hidden-file-input"
                                        onChange={handleAttachmentUpload}
                                        disabled={sending || uploadingAttachments || attachments.length >= 5}
                                    />
                                    <button
                                        type="button"
                                        className="btn btn-secondary"
                                        onClick={() => fileInputRef.current?.click()}
                                        disabled={sending || uploadingAttachments || attachments.length >= 5}
                                    >
                                        {uploadingAttachments ? 'Uploading...' : 'Attach file'}
                                    </button>
                                    <span className="text-muted">{attachments.length}/5 attached</span>
                                </div>
                                {attachments.length > 0 && (
                                    <div className="attachments-list">
                                        {attachments.map((attachment) => (
                                            <div key={attachment.id} className="attachment-item">
                                                <button
                                                    type="button"
                                                    className="attachment-name"
                                                    onClick={() => handleDownloadAttachment(attachment)}
                                                    disabled={sending || downloadingAttachmentId === attachment.id}
                                                >
                                                    {attachment.originalName}
                                                </button>
                                                <span className="attachment-meta">
                                                    {formatFileSize(attachment.size)}
                                                </span>
                                                <button
                                                    type="button"
                                                    className="chip-remove"
                                                    onClick={() => handleRemoveAttachment(attachment.id)}
                                                    disabled={sending}
                                                    aria-label={`Remove attachment ${attachment.originalName}`}
                                                >
                                                    ×
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <span className="text-muted">Attachments are not enabled in the current email transport.</span>
                        )}
                    </div>
                </div>

                <div className="email-actions">
                    <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => { void clearComposer(); }}
                        disabled={sending || uploadingAttachments}
                    >
                        Clear
                    </button>
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={handlePreviewSend}
                        disabled={sending || uploadingAttachments}
                    >
                        {deliveryMode === 'schedule' ? 'Schedule' : 'Send'}
                    </button>
                </div>
            </div>

            <div className="email-history-card">
                <h2>Recent Sent Emails</h2>
                {historyLoading && <div className="text-muted">Loading history...</div>}
                {!historyLoading && history.length === 0 && (
                    <div className="text-muted">No sent email history yet.</div>
                )}
                {!historyLoading && history.length > 0 && (
                    <div className="history-table">
                        <div className="history-head">
                            <span>Subject</span>
                            <span>Status</span>
                            <span>Recipients</span>
                            <span>When</span>
                        </div>
                        {history.map((item) => (
                            <div key={item._id} className="history-row">
                                <span>{item.subject}</span>
                                <span className={`status-pill ${item.status}`}>{item.status}</span>
                                <span>{item.recipientSummary?.totalSent || item.recipientSummary?.totalResolved || 0}</span>
                                <span>{formatDateTime(
                                    item.status === 'scheduled'
                                        ? (item.scheduledFor || item.createdAt)
                                        : (item.sentAt || item.createdAt)
                                )}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {showAiDraftModal && (
                <div className="modal-overlay" onClick={() => setShowAiDraftModal(false)}>
                    <div
                        className="modal preview-modal ai-draft-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="email-composer-ai-draft-title"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="modal-header">
                            <h2 id="email-composer-ai-draft-title">Generate AI Email Draft</h2>
                            <button
                                type="button"
                                className="modal-close"
                                onClick={() => setShowAiDraftModal(false)}
                                aria-label="Close AI draft modal"
                            >
                                ×
                            </button>
                        </div>
                        <div className="modal-body">
                            <div className="form-group">
                                <label htmlFor="ai-draft-tone">Tone</label>
                                <select
                                    id="ai-draft-tone"
                                    value={aiDraftTone}
                                    onChange={(event) => setAiDraftTone(event.target.value)}
                                    disabled={generatingAiDraft}
                                >
                                    <option value="professional">Professional</option>
                                    <option value="formal">Formal</option>
                                    <option value="warm">Warm</option>
                                    <option value="concise">Concise</option>
                                    <option value="friendly">Friendly</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label htmlFor="ai-draft-prompt">What should this email say?</label>
                                <textarea
                                    id="ai-draft-prompt"
                                    value={aiDraftPrompt}
                                    onChange={(event) => setAiDraftPrompt(event.target.value)}
                                    placeholder="Example: Draft a short update for parents about next week's science fair schedule and what students should bring."
                                    rows={6}
                                    maxLength={2000}
                                    disabled={generatingAiDraft}
                                />
                                <div className="text-muted">{aiDraftPrompt.length}/2000</div>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button type="button" className="btn btn-secondary" onClick={() => setShowAiDraftModal(false)} disabled={generatingAiDraft}>
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={handleGenerateAiDraft}
                                disabled={generatingAiDraft}
                            >
                                {generatingAiDraft ? 'Generating...' : 'Generate Draft'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {previewModal && (
                <div className="modal-overlay" onClick={() => setPreviewModal(null)}>
                    <div
                        className="modal preview-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="email-composer-preview-title"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="modal-header">
                            <h2 id="email-composer-preview-title">Confirm Recipients Before Send</h2>
                            <button
                                type="button"
                                className="modal-close"
                                onClick={() => setPreviewModal(null)}
                                aria-label="Close recipient preview"
                            >
                                ×
                            </button>
                        </div>
                        <div className="modal-body">
                            {previewModal.blockedTokens?.length > 0 && (
                                <div className="preview-error">
                                    <strong>Blocked tokens:</strong>
                                    <ul>
                                        {previewModal.blockedTokens.map((token) => (
                                            <li key={token.key}>{token.key} - {token.reason}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            <div className="preview-summary">
                                <div>
                                    Delivery: <strong>{deliveryMode === 'schedule' ? 'Scheduled' : 'Send now'}</strong>
                                </div>
                                {deliveryMode === 'schedule' && (
                                    <div>
                                        Scheduled for: <strong>{scheduledForLocal ? formatDateTime(new Date(scheduledForLocal)) : '—'}</strong>
                                    </div>
                                )}
                                <div>Student emails: <strong>{previewModal.recipientSummary?.students || 0}</strong></div>
                                <div>Parent emails: <strong>{previewModal.recipientSummary?.parents || 0}</strong></div>
                                <div>Teacher emails: <strong>{previewModal.recipientSummary?.teachers || 0}</strong></div>
                                <div>Duplicates removed: <strong>{previewModal.recipientSummary?.duplicatesRemoved || 0}</strong></div>
                                <div>Invalid excluded: <strong>{previewModal.recipientSummary?.invalidExcluded || 0}</strong></div>
                                <div>Total final recipients: <strong>{previewModal.recipientSummary?.totalResolved || 0}</strong></div>
                                <div>Attachments: <strong>{attachments.length}</strong></div>
                            </div>

                            <div className="preview-recipient-list">
                                {(previewModal.recipientSample || []).slice(0, 40).map((recipient, index) => (
                                    <div key={`${recipient.email}-${index}`} className="preview-recipient-row">
                                        <span>{recipient.email}</span>
                                        <span className={`category-pill ${recipient.category}`}>{recipient.category}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button type="button" className="btn btn-secondary" onClick={() => setPreviewModal(null)} disabled={sending}>
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={handleConfirmSend}
                                disabled={sending || (previewModal.blockedTokens || []).length > 0}
                            >
                                {sending
                                    ? (deliveryMode === 'schedule' ? 'Scheduling...' : 'Sending...')
                                    : (deliveryMode === 'schedule' ? 'Confirm & Schedule' : 'Confirm & Send')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default EmailComposerPage;
