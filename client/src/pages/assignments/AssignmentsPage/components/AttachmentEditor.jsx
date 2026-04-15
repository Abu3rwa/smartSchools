import { useRef } from 'react';
import { HiOutlinePaperClip, HiOutlineX, HiOutlinePlus } from 'react-icons/hi';
import { useTranslation } from 'react-i18next';

const ACCEPT = '.pdf,.docx,.pptx,.xlsx,.jpg,.jpeg,.png,.webp,.gif';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const AttachmentEditor = ({
    attachmentFiles = [],
    existingAttachments = [],
    onFilesChange,
    onRemoveExisting,
    disabled
}) => {
    const { t } = useTranslation(['assignments']);
    const fileInputRef = useRef(null);

    const handleFileSelect = (e) => {
        const selected = Array.from(e.target.files || []);
        const valid = selected.filter((f) => f.size <= MAX_FILE_SIZE);
        if (valid.length < selected.length) {
            // silently skip oversized files — toast could be added in page
        }
        onFilesChange([...attachmentFiles, ...valid]);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleRemoveNew = (index) => {
        onFilesChange(attachmentFiles.filter((_, i) => i !== index));
    };

    return (
        <div className="attachment-editor">
            <label className="attachment-editor-label">
                <HiOutlinePaperClip />
                {t('assignments:form.attachments', 'Attachments')}
            </label>

            {existingAttachments.length > 0 && (
                <div className="attachment-chips">
                    {existingAttachments.map((att) => (
                        <div key={att._id} className="attachment-chip existing">
                            <span className="attachment-chip-name">{att.fileName}</span>
                            <span className="attachment-chip-size">{formatSize(att.size)}</span>
                            {!disabled && (
                                <button type="button" className="attachment-chip-remove" onClick={() => onRemoveExisting(att._id)} aria-label="Remove attachment">
                                    <HiOutlineX />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {attachmentFiles.length > 0 && (
                <div className="attachment-chips">
                    {attachmentFiles.map((file, idx) => (
                        <div key={idx} className="attachment-chip new">
                            <span className="attachment-chip-name">{file.name}</span>
                            <span className="attachment-chip-size">{formatSize(file.size)}</span>
                            {!disabled && (
                                <button type="button" className="attachment-chip-remove" onClick={() => handleRemoveNew(idx)} aria-label="Remove file">
                                    <HiOutlineX />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {!disabled && (
                <>
                    <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept={ACCEPT}
                        onChange={handleFileSelect}
                        style={{ display: 'none' }}
                    />
                    <button
                        type="button"
                        className="btn btn-sm btn-outline add-attachment-btn"
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <HiOutlinePlus />
                        {t('assignments:form.addAttachment', 'Add File')}
                    </button>
                </>
            )}
        </div>
    );
};

export default AttachmentEditor;
