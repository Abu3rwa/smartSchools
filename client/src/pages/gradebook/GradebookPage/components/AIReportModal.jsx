import DOMPurify from 'dompurify';
import { useTranslation } from 'react-i18next';
import {
    HiOutlineMail,
    HiOutlinePencil,
    HiOutlineSparkles,
    HiOutlineX
} from 'react-icons/hi';
import { AI_LANGUAGE_OPTIONS, AI_RECIPIENT_OPTIONS } from '../constants';

const AIReportModal = ({
    open,
    student,
    aiReportContent,
    editedReportContent,
    isEditingReport,
    generatingAI,
    aiPrimaryLanguage,
    aiSecondaryLanguage,
    aiSendEmail,
    aiRecipients,
    onClose,
    onGenerate,
    onPrimaryLanguageChange,
    onSecondaryLanguageChange,
    onAiSendEmailChange,
    onAiRecipientChange,
    onEditToggle,
    onRegenerate,
    onEditedContentBlur,
    onSendToParents
}) => {
    const { t } = useTranslation(['gradebook']);

    if (!open || !student) {
        return null;
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal modal-lg" onClick={(event) => event.stopPropagation()}>
                <div className="modal-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ background: 'var(--stat-secondary-bg)', padding: '8px', borderRadius: '50%', color: 'var(--accent-purple)' }}>
                            <HiOutlineSparkles size={24} />
                        </div>
                        <div>
                            <h3 style={{ margin: 0 }}>{t('gradebook:ai.title')}</h3>
                            <p className="text-muted" style={{ margin: 0, fontSize: '0.9rem' }}>
                                {t('gradebook:ai.forStudent', { firstName: student.firstName, lastName: student.lastName })}
                            </p>
                        </div>
                    </div>
                    <button className="modal-close" onClick={onClose}>
                        <HiOutlineX />
                    </button>
                </div>

                <div className="modal-body">
                    {!aiReportContent ? (
                        <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                            <p className="mb-md text-muted">
                                {t('gradebook:ai.generateDescription')}
                            </p>

                            <button className="btn btn-primary" onClick={onGenerate} disabled={generatingAI}>
                                {generatingAI ? (
                                    <>
                                        <div className="spinner-sm"></div> {t('gradebook:ai.generating')}
                                    </>
                                ) : (
                                    <>
                                        <HiOutlineSparkles /> {t('gradebook:ai.generate')}
                                    </>
                                )}
                            </button>

                            <div style={{ marginTop: '20px' }}>
                                <label style={{ display: 'block', fontWeight: 500, marginBottom: '8px' }}>
                                    {t('gradebook:ai.primaryLanguage')}
                                </label>
                                <select
                                    value={aiPrimaryLanguage}
                                    onChange={(event) => {
                                        const nextPrimary = event.target.value;
                                        onPrimaryLanguageChange(nextPrimary);
                                        if (nextPrimary === aiSecondaryLanguage) {
                                            onSecondaryLanguageChange('');
                                        }
                                    }}
                                >
                                    {AI_LANGUAGE_OPTIONS.map((language) => (
                                        <option key={language.value} value={language.value}>{language.label}</option>
                                    ))}
                                </select>
                            </div>

                            <div style={{ marginTop: '12px' }}>
                                <label style={{ display: 'block', fontWeight: 500, marginBottom: '8px' }}>
                                    {t('gradebook:ai.secondaryLanguage')}
                                </label>
                                <select
                                    value={aiSecondaryLanguage}
                                    onChange={(event) => onSecondaryLanguageChange(event.target.value)}
                                >
                                    <option value="">{t('gradebook:ai.none')}</option>
                                    {AI_LANGUAGE_OPTIONS
                                        .filter((language) => language.value !== aiPrimaryLanguage)
                                        .map((language) => (
                                            <option key={language.value} value={language.value}>{language.label}</option>
                                        ))}
                                </select>
                            </div>

                            <div style={{ marginTop: '16px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={aiSendEmail}
                                        onChange={(event) => onAiSendEmailChange(event.target.checked)}
                                    />
                                    {t('gradebook:ai.sendViaEmail')}
                                </label>
                            </div>

                            {aiSendEmail && (
                                <div style={{ marginTop: '12px', padding: '12px', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                                    <label style={{ display: 'block', fontWeight: 500, marginBottom: '8px', fontSize: '13px' }}>
                                        {t('gradebook:ai.emailRecipients')}
                                    </label>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                                        {AI_RECIPIENT_OPTIONS.map((recipient) => (
                                            <label
                                                key={recipient}
                                                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={aiRecipients[recipient]}
                                                    onChange={(event) => onAiRecipientChange(recipient, event.target.checked)}
                                                />
                                                <span style={{ textTransform: 'capitalize' }}>
                                                    {t(`gradebook:ai.recipients.${recipient}`, { defaultValue: recipient })}
                                                </span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="ai-report-preview">
                            <div
                                style={{
                                    background: 'var(--bg-card)',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '8px',
                                    maxHeight: '500px',
                                    overflowY: 'auto'
                                }}
                            >
                                <div
                                    style={{
                                        background: 'var(--brand-gradient)',
                                        padding: '20px',
                                        borderRadius: '8px 8px 0 0',
                                        color: 'white',
                                        textAlign: 'center'
                                    }}
                                >
                                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>{t('gradebook:ai.previewTitle')}</h3>
                                </div>

                                <div
                                    style={{
                                        padding: '30px',
                                        background: 'var(--bg-card)',
                                        fontFamily: 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif',
                                        lineHeight: '1.6',
                                        color: 'var(--text-primary)'
                                    }}
                                >
                                    <div
                                        contentEditable={isEditingReport}
                                        suppressContentEditableWarning={true}
                                        onBlur={(event) => onEditedContentBlur(event.currentTarget.innerHTML)}
                                        style={{
                                            outline: isEditingReport ? '2px solid var(--primary)' : 'none',
                                            padding: isEditingReport ? '15px' : '0',
                                            borderRadius: isEditingReport ? '8px' : '0',
                                            minHeight: '200px',
                                            cursor: isEditingReport ? 'text' : 'default',
                                            background: isEditingReport ? 'var(--warning-50)' : 'transparent'
                                        }}
                                        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(editedReportContent || aiReportContent) }}
                                    />
                                </div>
                            </div>

                            {isEditingReport && (
                                <div
                                    style={{
                                        marginTop: '15px',
                                        padding: '12px 16px',
                                        background: 'var(--status-info-bg)',
                                        border: '1px solid var(--icon-blue)',
                                        borderRadius: '8px',
                                        fontSize: '13px',
                                        color: 'var(--icon-blue)'
                                    }}
                                >
                                    <strong>{t('gradebook:ai.editModeActive')}</strong> {t('gradebook:ai.editModeDescription')}
                                </div>
                            )}

                            <div
                                style={{
                                    marginTop: '20px',
                                    display: 'flex',
                                    gap: '10px',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                }}
                            >
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <button className="btn btn-secondary" onClick={onRegenerate}>
                                        {t('gradebook:ai.regenerate')}
                                    </button>
                                    <button className="btn btn-outline" onClick={onEditToggle}>
                                        <HiOutlinePencil /> {isEditingReport ? t('gradebook:ai.saveEdits') : t('gradebook:ai.editReport')}
                                    </button>
                                </div>

                                {!aiSendEmail && (
                                    <button className="btn btn-success" disabled={isEditingReport} onClick={onSendToParents}>
                                        <HiOutlineMail /> {t('gradebook:ai.sendToParents')}
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AIReportModal;
