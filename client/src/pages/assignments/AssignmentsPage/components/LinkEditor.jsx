import { useState } from 'react';
import { HiOutlineLink, HiOutlineX, HiOutlinePlus } from 'react-icons/hi';
import { useTranslation } from 'react-i18next';
import { LINK_TYPES } from '../constants';

const EMPTY_LINK = { type: 'external_url', title: '', url: '', refId: '' };

const LinkEditor = ({ links = [], onChange, disabled }) => {
    const { t } = useTranslation(['assignments']);
    const [draft, setDraft] = useState(null);

    const handleAdd = () => {
        if (draft) {
            if (draft.type === 'external_url') {
                if (!draft.url || !/^https?:\/\/.+/i.test(draft.url)) return;
            } else {
                if (!draft.refId) return;
            }
            onChange([...links, { ...draft }]);
            setDraft(null);
        } else {
            setDraft({ ...EMPTY_LINK });
        }
    };

    const handleRemove = (index) => {
        onChange(links.filter((_, i) => i !== index));
    };

    const handleDraftChange = (field, value) => {
        setDraft((prev) => ({ ...prev, [field]: value }));
    };

    const handleCancel = () => setDraft(null);

    return (
        <div className="link-editor">
            <label className="link-editor-label">
                <HiOutlineLink />
                {t('assignments:form.links', 'Links')}
            </label>

            {links.length > 0 && (
                <div className="link-chips">
                    {links.map((link, idx) => (
                        <div key={idx} className="link-chip">
                            <span className="link-chip-type">{LINK_TYPES.find((lt) => lt.value === link.type)?.label || link.type}</span>
                            <span className="link-chip-title">{link.title || link.url || link.refId}</span>
                            {!disabled && (
                                <button type="button" className="link-chip-remove" onClick={() => handleRemove(idx)} aria-label="Remove link">
                                    <HiOutlineX />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {draft && (
                <div className="link-draft">
                    <select
                        value={draft.type}
                        onChange={(e) => handleDraftChange('type', e.target.value)}
                        disabled={disabled}
                    >
                        {LINK_TYPES.map((lt) => (
                            <option key={lt.value} value={lt.value}>{lt.label}</option>
                        ))}
                    </select>
                    <input
                        type="text"
                        placeholder={t('assignments:form.linkTitle', 'Title (optional)')}
                        value={draft.title}
                        onChange={(e) => handleDraftChange('title', e.target.value)}
                        disabled={disabled}
                    />
                    {draft.type === 'external_url' ? (
                        <input
                            type="url"
                            placeholder="https://..."
                            value={draft.url}
                            onChange={(e) => handleDraftChange('url', e.target.value)}
                            disabled={disabled}
                        />
                    ) : (
                        <input
                            type="text"
                            placeholder={t('assignments:form.linkRefId', 'Reference ID')}
                            value={draft.refId}
                            onChange={(e) => handleDraftChange('refId', e.target.value)}
                            disabled={disabled}
                        />
                    )}
                    <div className="link-draft-actions">
                        <button type="button" className="btn btn-sm btn-primary" onClick={handleAdd} disabled={disabled}>
                            {t('assignments:actions.add', 'Add')}
                        </button>
                        <button type="button" className="btn btn-sm btn-outline" onClick={handleCancel} disabled={disabled}>
                            {t('assignments:actions.cancel', 'Cancel')}
                        </button>
                    </div>
                </div>
            )}

            {!draft && !disabled && (
                <button type="button" className="btn btn-sm btn-outline add-link-btn" onClick={handleAdd}>
                    <HiOutlinePlus />
                    {t('assignments:form.addLink', 'Add Link')}
                </button>
            )}
        </div>
    );
};

export default LinkEditor;
