import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { HiOutlineClock, HiOutlineSparkles } from 'react-icons/hi';
import { useTranslation } from 'react-i18next';
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
} from '../../api/communicationEmailApi';
import UpgradePrompt from '../../components/UpgradePrompt';
import { AI_LANGUAGE_OPTIONS, buildRequestedLanguages, toLegacyLanguageValue } from '../../constants/aiLanguages';
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
    t,
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
    const placeholder = t('recipients.searchPlaceholder', { label });

    return (
        <div className="recipient-field">
            <div className="recipient-selected-list">
                {state.selected.map((token) => (
                    <span
                        key={token.key}
                        className={`recipient-chip ${isGroupToken(token) ? 'group' : 'individual'} audience-${token.audience || fieldKey}`}
                        title={token.subtitle || token.label}
                    >
                        <span className="chip-audience">
                            {t(`recipients.audience.${token.audience || fieldKey}`, { defaultValue: token.audience || fieldKey })}
                        </span>
                        <span className="chip-label">{token.label}</span>
                        <button
                            type="button"
                            className="chip-remove"
                            onClick={() => onRemoveToken(fieldKey, token.key)}
                            disabled={disabled}
                            aria-label={t('recipients.removeRecipientAria', { name: token.label })}
                        >
                            ×
                        </button>
                    </span>
                ))}
                {state.selected.length === 0 && (
                    <span className="recipient-empty">{t('recipients.empty')}</span>
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
                    {state.loading && <div className="recipient-suggestion-row muted">{t('recipients.loadingSuggestions')}</div>}
                    {!state.loading && state.options.length === 0 && (
                        <div className="recipient-suggestion-row muted">{t('recipients.noSuggestionsInScope')}</div>
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
                                {t(`recipients.tokenType.${option.tokenType || 'group'}`)}
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

const RichTextEditor = ({ value, onChange, disabled, t }) => {
    const handleChange = (event) => {
        onChange(event?.target?.value || '');
    };

    return (
        <div className={`rich-editor ${disabled ? 'disabled' : ''}`}>
            <Editor
                value={value}
                onChange={handleChange}
                disabled={disabled}
                placeholder={t('fields.messagePlaceholder')}
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
    const { t } = useTranslation(['emailComposer']);
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
    const [aiDraftPrimaryLanguage, setAiDraftPrimaryLanguage] = useState('en');
    const [aiDraftSecondaryLanguage, setAiDraftSecondaryLanguage] = useState('');
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
            toast.error(error.message || t('errors.loadComposer'));
        } finally {
            setLoadingConfig(false);
        }
    }, [t]);

    const loadHistory = useCallback(async () => {
        setHistoryLoading(true);
        try {
            const data = await fetchCommunicationEmailHistory({ page: 1, limit: 15 });
            setHistory(data.items || []);
        } catch (error) {
            toast.error(error.message || t('errors.loadHistory'));
        } finally {
            setHistoryLoading(false);
        }
    }, [t]);

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
                setAiDraftPrimaryLanguage(String(parsed?.aiDraftPrimaryLanguage || 'en'));
                setAiDraftSecondaryLanguage(String(parsed?.aiDraftSecondaryLanguage || ''));
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
            aiDraftPrimaryLanguage: String(aiDraftPrimaryLanguage || 'en'),
            aiDraftSecondaryLanguage: String(aiDraftSecondaryLanguage || ''),
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
        aiDraftPrimaryLanguage,
        aiDraftSecondaryLanguage,
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
            toast.error(error.message || t('errors.loadRecipientSuggestions'));
        }
    }, [t]);

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
            toast.error(t('errors.maxAttachments'));
            event.target.value = '';
            return;
        }
        const files = incomingFiles.slice(0, remainingSlots);
        setUploadingAttachments(true);
        try {
            const result = await uploadCommunicationAttachments(files);
            setAttachments((previous) => [...previous, ...(result.attachments || [])]);
            if (incomingFiles.length > remainingSlots) {
                toast.error(t('errors.limitedAttachmentsAdded', { count: remainingSlots }));
            }
        } catch (error) {
            toast.error(error.message || t('errors.uploadAttachment'));
        } finally {
            setUploadingAttachments(false);
            event.target.value = '';
        }
    }, [attachments.length, t]);

    const handleRemoveAttachment = useCallback(async (attachmentId) => {
        try {
            await removeCommunicationAttachment(attachmentId);
            setAttachments((previous) => previous.filter((attachment) => attachment.id !== attachmentId));
        } catch (error) {
            toast.error(error.message || t('errors.removeAttachment'));
        }
    }, [t]);

    const handleGenerateAiDraft = useCallback(async () => {
        const prompt = aiDraftPrompt.trim();
        if (!prompt) {
            toast.error(t('errors.aiPromptRequired'));
            return;
        }
        if (!aiDraftCapability.canUse) {
            toast.error(aiDraftCapability.reason === 'disabled_by_school_admin'
                ? t('ai.disabledByAdmin')
                : t('ai.notAvailableOnPlan'));
            return;
        }

        setGeneratingAiDraft(true);
        try {
            const requestedLanguages = buildRequestedLanguages(
                aiDraftPrimaryLanguage,
                aiDraftSecondaryLanguage
            );
            const normalizedRequestedLanguages = requestedLanguages.length > 0 ? requestedLanguages : ['en'];
            const result = await generateCommunicationEmailDraft({
                prompt,
                tone: aiDraftTone,
                requestedLanguages: normalizedRequestedLanguages,
                primaryLanguage: aiDraftPrimaryLanguage,
                secondaryLanguage: aiDraftSecondaryLanguage,
                language: toLegacyLanguageValue(normalizedRequestedLanguages),
                toParents: fields.parents.selected,
                toTeachers: fields.teachers.selected,
                toStudents: fields.students.selected
            });
            setBodyHtml(result.bodyHtml || DEFAULT_BODY_HTML);
            setShowAiDraftModal(false);
            setAiDraftPrompt('');
            toast.success(t('success.aiDraftGenerated'));
        } catch (error) {
            toast.error(error.message || t('errors.generateAiDraft'));
        } finally {
            setGeneratingAiDraft(false);
        }
    }, [
        aiDraftCapability.canUse,
        aiDraftCapability.reason,
        aiDraftPrompt,
        aiDraftPrimaryLanguage,
        aiDraftSecondaryLanguage,
        aiDraftTone,
        fields.parents.selected,
        fields.students.selected,
        fields.teachers.selected,
        t
    ]);

    const handleDownloadAttachment = useCallback(async (attachment) => {
        setDownloadingAttachmentId(attachment.id);
        try {
            await downloadCommunicationAttachment(attachment);
        } catch (error) {
            toast.error(error.message || t('errors.downloadAttachment'));
        } finally {
            setDownloadingAttachmentId(null);
        }
    }, [t]);

    const handlePreviewSend = useCallback(async () => {
        if (!subject.trim()) {
            toast.error(t('errors.subjectRequired'));
            return;
        }
        if (!bodyHtml || bodyHtml.replace(/<[^>]*>/g, '').trim().length === 0) {
            toast.error(t('errors.messageRequired'));
            return;
        }
        if (totalSelected === 0) {
            toast.error(t('errors.recipientRequired'));
            return;
        }
        if (deliveryMode === 'schedule') {
            if (!scheduledForLocal) {
                toast.error(t('errors.scheduleDateRequired'));
                return;
            }
            const scheduledDate = new Date(scheduledForLocal);
            if (Number.isNaN(scheduledDate.getTime())) {
                toast.error(t('errors.invalidScheduleDate'));
                return;
            }
            if (scheduledDate.getTime() <= Date.now() + 60 * 1000) {
                toast.error(t('errors.scheduleMustBeFuture'));
                return;
            }
        }

        try {
            const preview = await previewCommunicationRecipients(selectedPayload);
            setPreviewModal(preview);
        } catch (error) {
            toast.error(error.message || t('errors.previewRecipients'));
        }
    }, [bodyHtml, deliveryMode, scheduledForLocal, selectedPayload, subject, t, totalSelected]);

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
                toast.success(t('success.emailScheduledFor', { when: formatDateTime(result.scheduledFor) }));
            } else if (result.status === 'partial') {
                toast.success(t('success.partialSend', { sent: result.totalSent, failed: result.totalFailed }));
            } else if (result.status === 'failed') {
                toast.error(t('errors.emailSendFailed'));
            } else {
                toast.success(t('success.emailSentToRecipients', { count: result.totalSent }));
            }
            setPreviewModal(null);
            await clearComposer({ cleanupUploads: false, clearStoredDraft: true });
            await loadHistory();
        } catch (error) {
            toast.error(error.message || t('errors.sendCommunicationEmail'));
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
        subject,
        t
    ]);

    if (loadingConfig) {
        return (
            <div className="email-composer-page">
                <div className="page-header">
                    <h1>{t('title')}</h1>
                </div>
                <div className="email-composer-card">{t('loadingComposer')}</div>
            </div>
        );
    }

    if (!config?.canUseComposer) {
        return (
            <div className="email-composer-page">
                <div className="page-header">
                    <h1>{t('title')}</h1>
                </div>
                <div className="email-composer-card">
                    {t('noScopeMessage')}
                </div>
            </div>
        );
    }

    return (
        <div className="email-composer-page">
            <div className="page-header">
                <h1>{t('title')}</h1>
                <p className="text-muted">{t('subtitle')}</p>
            </div>

            <div className="email-composer-card">
                <div className="email-row">
                    <label>{t('fields.emailFrom')}</label>
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
                    <label>{t('fields.toParents')}</label>
                    <div className="email-row-input">
                        <RecipientSelectorField
                            t={t}
                            fieldKey="parents"
                            label={t('recipients.labels.parents')}
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
                    <label>{t('fields.toTeachers')}</label>
                    <div className="email-row-input">
                        <RecipientSelectorField
                            t={t}
                            fieldKey="teachers"
                            label={t('recipients.labels.teachers')}
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
                    <label>{t('fields.toStudents')}</label>
                    <div className="email-row-input">
                        <RecipientSelectorField
                            t={t}
                            fieldKey="students"
                            label={t('recipients.labels.students')}
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
                    <label>{t('fields.subject')}</label>
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
                    <label>{t('fields.delivery')}</label>
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
                                <span>{t('delivery.sendNow')}</span>
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
                                <span>{t('delivery.scheduleSend')}</span>
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
                    <label>{t('fields.message')}</label>
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
                                    <span>{generatingAiDraft ? t('ai.generatingDraft') : t('ai.draftButton')}</span>
                                </button>
                            )}
                            {!aiDraftCapability.canUse && aiDraftCapability.reason === 'plan_locked' && (
                                <UpgradePrompt feature="aiEmailDrafts" compact />
                            )}
                            {!aiDraftCapability.canUse && aiDraftCapability.reason === 'disabled_by_school_admin' && (
                                <span className="text-muted">
                                    {t('ai.disabledByAdmin')}
                                </span>
                            )}
                        </div>
                        <RichTextEditor value={bodyHtml} onChange={setBodyHtml} disabled={sending} t={t} />
                    </div>
                </div>

                <div className="email-row">
                    <label>{t('fields.attachment')}</label>
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
                                        {uploadingAttachments ? t('attachments.uploading') : t('attachments.attachFile')}
                                    </button>
                                    <span className="text-muted">{t('attachments.attachedCount', { count: attachments.length })}</span>
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
                                                    aria-label={t('attachments.removeAttachmentAria', { name: attachment.originalName })}
                                                >
                                                    ×
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <span className="text-muted">{t('attachments.notEnabled')}</span>
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
                        {t('actions.clear')}
                    </button>
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={handlePreviewSend}
                        disabled={sending || uploadingAttachments}
                    >
                        {deliveryMode === 'schedule' ? t('actions.schedule') : t('actions.send')}
                    </button>
                </div>
            </div>

            <div className="email-history-card">
                <h2>{t('history.title')}</h2>
                {historyLoading && <div className="text-muted">{t('history.loading')}</div>}
                {!historyLoading && history.length === 0 && (
                    <div className="text-muted">{t('history.empty')}</div>
                )}
                {!historyLoading && history.length > 0 && (
                    <div className="history-table">
                        <div className="history-head">
                            <span>{t('history.columns.subject')}</span>
                            <span>{t('history.columns.status')}</span>
                            <span>{t('history.columns.recipients')}</span>
                            <span>{t('history.columns.when')}</span>
                        </div>
                        {history.map((item) => (
                            <div key={item._id} className="history-row">
                                <span>{item.subject}</span>
                                <span className={`status-pill ${item.status}`}>{t(`history.status.${item.status}`, { defaultValue: item.status })}</span>
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
                            <h2 id="email-composer-ai-draft-title">{t('ai.modalTitle')}</h2>
                            <button
                                type="button"
                                className="modal-close"
                                onClick={() => setShowAiDraftModal(false)}
                                aria-label={t('ai.closeModalAria')}
                            >
                                ×
                            </button>
                        </div>
                        <div className="modal-body">
                            <div className="form-group">
                                <label htmlFor="ai-draft-tone">{t('ai.toneLabel')}</label>
                                <select
                                    id="ai-draft-tone"
                                    value={aiDraftTone}
                                    onChange={(event) => setAiDraftTone(event.target.value)}
                                    disabled={generatingAiDraft}
                                >
                                    <option value="professional">{t('ai.tones.professional')}</option>
                                    <option value="formal">{t('ai.tones.formal')}</option>
                                    <option value="warm">{t('ai.tones.warm')}</option>
                                    <option value="concise">{t('ai.tones.concise')}</option>
                                    <option value="friendly">{t('ai.tones.friendly')}</option>
                                </select>
                            </div>
                            <div className="form-group ai-language-grid">
                                <div>
                                    <label htmlFor="ai-draft-primary-language">{t('ai.primaryLanguageLabel')}</label>
                                    <select
                                        id="ai-draft-primary-language"
                                        value={aiDraftPrimaryLanguage}
                                        onChange={(event) => {
                                            const nextPrimary = String(event.target.value || 'en');
                                            setAiDraftPrimaryLanguage(nextPrimary);
                                            if (nextPrimary === aiDraftSecondaryLanguage) {
                                                setAiDraftSecondaryLanguage('');
                                            }
                                        }}
                                        disabled={generatingAiDraft}
                                    >
                                        {AI_LANGUAGE_OPTIONS.map((option) => (
                                            <option key={option.value} value={option.value}>
                                                {option.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label htmlFor="ai-draft-secondary-language">{t('ai.secondaryLanguageLabel')}</label>
                                    <select
                                        id="ai-draft-secondary-language"
                                        value={aiDraftSecondaryLanguage}
                                        onChange={(event) => setAiDraftSecondaryLanguage(event.target.value)}
                                        disabled={generatingAiDraft}
                                    >
                                        <option value="">{t('ai.secondaryLanguagePlaceholder')}</option>
                                        {AI_LANGUAGE_OPTIONS
                                            .filter((option) => option.value !== aiDraftPrimaryLanguage)
                                            .map((option) => (
                                                <option key={option.value} value={option.value}>
                                                    {option.label}
                                                </option>
                                            ))}
                                    </select>
                                </div>
                            </div>
                            <div className="form-group">
                                <label htmlFor="ai-draft-prompt">{t('ai.promptLabel')}</label>
                                <textarea
                                    id="ai-draft-prompt"
                                    value={aiDraftPrompt}
                                    onChange={(event) => setAiDraftPrompt(event.target.value)}
                                    placeholder={t('ai.promptPlaceholder')}
                                    rows={6}
                                    maxLength={2000}
                                    disabled={generatingAiDraft}
                                />
                                <div className="text-muted">{aiDraftPrompt.length}/2000</div>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button type="button" className="btn btn-secondary" onClick={() => setShowAiDraftModal(false)} disabled={generatingAiDraft}>
                                {t('actions.cancel')}
                            </button>
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={handleGenerateAiDraft}
                                disabled={generatingAiDraft}
                            >
                                {generatingAiDraft ? t('ai.generating') : t('ai.generateDraft')}
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
                            <h2 id="email-composer-preview-title">{t('preview.title')}</h2>
                            <button
                                type="button"
                                className="modal-close"
                                onClick={() => setPreviewModal(null)}
                                aria-label={t('preview.closeModalAria')}
                            >
                                ×
                            </button>
                        </div>
                        <div className="modal-body">
                            {previewModal.blockedTokens?.length > 0 && (
                                <div className="preview-error">
                                    <strong>{t('preview.blockedTokens')}:</strong>
                                    <ul>
                                        {previewModal.blockedTokens.map((token) => (
                                            <li key={token.key}>{token.key} - {token.reason}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            <div className="preview-summary">
                                <div>
                                    {t('preview.delivery')}: <strong>{deliveryMode === 'schedule' ? t('preview.scheduled') : t('delivery.sendNow')}</strong>
                                </div>
                                {deliveryMode === 'schedule' && (
                                    <div>
                                        {t('preview.scheduledFor')}: <strong>{scheduledForLocal ? formatDateTime(new Date(scheduledForLocal)) : '—'}</strong>
                                    </div>
                                )}
                                <div>{t('preview.studentEmails')}: <strong>{previewModal.recipientSummary?.students || 0}</strong></div>
                                <div>{t('preview.parentEmails')}: <strong>{previewModal.recipientSummary?.parents || 0}</strong></div>
                                <div>{t('preview.teacherEmails')}: <strong>{previewModal.recipientSummary?.teachers || 0}</strong></div>
                                <div>{t('preview.duplicatesRemoved')}: <strong>{previewModal.recipientSummary?.duplicatesRemoved || 0}</strong></div>
                                <div>{t('preview.invalidExcluded')}: <strong>{previewModal.recipientSummary?.invalidExcluded || 0}</strong></div>
                                <div>{t('preview.totalFinalRecipients')}: <strong>{previewModal.recipientSummary?.totalResolved || 0}</strong></div>
                                <div>{t('preview.attachments')}: <strong>{attachments.length}</strong></div>
                            </div>

                            <div className="preview-recipient-list">
                                {(previewModal.recipientSample || []).slice(0, 40).map((recipient, index) => (
                                    <div key={`${recipient.email}-${index}`} className="preview-recipient-row">
                                        <span>{recipient.email}</span>
                                        <span className={`category-pill ${recipient.category}`}>
                                            {t(`preview.category.${recipient.category}`, { defaultValue: recipient.category })}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button type="button" className="btn btn-secondary" onClick={() => setPreviewModal(null)} disabled={sending}>
                                {t('actions.cancel')}
                            </button>
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={handleConfirmSend}
                                disabled={sending || (previewModal.blockedTokens || []).length > 0}
                            >
                                {sending
                                    ? (deliveryMode === 'schedule' ? t('actions.scheduling') : t('actions.sending'))
                                    : (deliveryMode === 'schedule' ? t('actions.confirmAndSchedule') : t('actions.confirmAndSend'))}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default EmailComposerPage;
