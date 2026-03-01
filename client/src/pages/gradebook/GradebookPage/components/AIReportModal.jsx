import DOMPurify from 'dompurify';
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
    aiLanguage,
    aiSendEmail,
    aiRecipients,
    onClose,
    onGenerate,
    onLanguageChange,
    onAiSendEmailChange,
    onAiRecipientChange,
    onEditToggle,
    onRegenerate,
    onEditedContentBlur,
    onSendToParents
}) => {
    if (!open || !student) {
        return null;
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal modal-lg" onClick={(event) => event.stopPropagation()}>
                <div className="modal-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ background: '#f3e8ff', padding: '8px', borderRadius: '50%', color: '#7c3aed' }}>
                            <HiOutlineSparkles size={24} />
                        </div>
                        <div>
                            <h3 style={{ margin: 0 }}>AI Progress Report</h3>
                            <p className="text-muted" style={{ margin: 0, fontSize: '0.9rem' }}>
                                for {student.firstName} {student.lastName}
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
                                Generate a personalized progress report based on recent grades, behavior notes, and improvement trends.
                            </p>

                            <button className="btn btn-primary" onClick={onGenerate} disabled={generatingAI}>
                                {generatingAI ? (
                                    <>
                                        <div className="spinner-sm"></div> Generating...
                                    </>
                                ) : (
                                    <>
                                        <HiOutlineSparkles /> Generate
                                    </>
                                )}
                            </button>

                            <div style={{ marginTop: '20px' }}>
                                <label style={{ display: 'block', fontWeight: 500, marginBottom: '8px' }}>
                                    Report Language
                                </label>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    {AI_LANGUAGE_OPTIONS.map((language) => (
                                        <button
                                            key={language}
                                            type="button"
                                            className={`btn btn-sm ${aiLanguage === language ? 'btn-primary' : 'btn-outline'}`}
                                            onClick={() => onLanguageChange(language)}
                                            style={{ textTransform: 'capitalize' }}
                                        >
                                            {language}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div style={{ marginTop: '16px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={aiSendEmail}
                                        onChange={(event) => onAiSendEmailChange(event.target.checked)}
                                    />
                                    Send report via email after generation
                                </label>
                            </div>

                            {aiSendEmail && (
                                <div style={{ marginTop: '12px', padding: '12px', background: '#f9fafb', borderRadius: '8px' }}>
                                    <label style={{ display: 'block', fontWeight: 500, marginBottom: '8px', fontSize: '13px' }}>
                                        Email Recipients
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
                                                <span style={{ textTransform: 'capitalize' }}>{recipient}</span>
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
                                    background: '#ffffff',
                                    border: '1px solid #e5e7eb',
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
                                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>Student Progress Report</h3>
                                </div>

                                <div
                                    style={{
                                        padding: '30px',
                                        background: '#ffffff',
                                        fontFamily: 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif',
                                        lineHeight: '1.6',
                                        color: '#333'
                                    }}
                                >
                                    <div
                                        contentEditable={isEditingReport}
                                        suppressContentEditableWarning={true}
                                        onBlur={(event) => onEditedContentBlur(event.currentTarget.innerHTML)}
                                        style={{
                                            outline: isEditingReport ? '2px solid #667eea' : 'none',
                                            padding: isEditingReport ? '15px' : '0',
                                            borderRadius: isEditingReport ? '8px' : '0',
                                            minHeight: '200px',
                                            cursor: isEditingReport ? 'text' : 'default',
                                            background: isEditingReport ? '#fffbeb' : 'transparent'
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
                                        background: '#eff6ff',
                                        border: '1px solid #3b82f6',
                                        borderRadius: '8px',
                                        fontSize: '13px',
                                        color: '#1e40af'
                                    }}
                                >
                                    <strong>Edit Mode Active:</strong> Click directly in the text above to edit.
                                    You can modify text, add paragraphs, or change formatting.
                                    Click "Save Edits" when done to preview your changes.
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
                                        Regenerate
                                    </button>
                                    <button className="btn btn-outline" onClick={onEditToggle}>
                                        <HiOutlinePencil /> {isEditingReport ? 'Save Edits' : 'Edit Report'}
                                    </button>
                                </div>

                                {!aiSendEmail && (
                                    <button className="btn btn-success" disabled={isEditingReport} onClick={onSendToParents}>
                                        <HiOutlineMail /> Send to Parents
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
