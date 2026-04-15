import { useCallback, useEffect, useRef, useState } from 'react';
import { HiOutlineLink, HiOutlineX, HiOutlinePlus } from 'react-icons/hi';
import { useTranslation } from 'react-i18next';
import api from '../../../../config/api';
import { LINK_TYPES } from '../constants';

const EMPTY_LINK = { type: 'external_url', title: '', url: '', refId: '' };
const DEBOUNCE_MS = 300;

const RefPicker = ({ type, classId, subjectId, value, onSelect, disabled }) => {
    const { t } = useTranslation(['assignments']);
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [options, setOptions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);
    const wrapperRef = useRef(null);
    const debounceRef = useRef(null);

    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => setDebouncedSearch(search.trim()), DEBOUNCE_MS);
        return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    }, [search]);

    const fetchOptions = useCallback(async () => {
        setLoading(true);
        try {
            if (type === 'practice_objective') {
                const params = { limit: 15, isActive: true };
                if (subjectId) params.subject = subjectId;
                if (debouncedSearch) params.search = debouncedSearch;
                const res = await api.get('/standards', { params });
                setOptions((res.data?.data?.standards || []).map((s) => ({
                    id: s._id,
                    label: s.code ? `${s.code} — ${s.name || s.description || ''}` : (s.name || s.description || ''),
                    sub: s.description || ''
                })));
            } else if (type === 'assessment') {
                const params = { limit: 15 };
                if (classId) params.classId = classId;
                if (subjectId) params.subjectId = subjectId;
                const res = await api.get('/standard-assignments', { params });
                setOptions((res.data?.data?.assignments || []).map((a) => ({
                    id: a._id,
                    label: a.title || `${a.standard?.code || ''} — ${a.class?.name || ''}`,
                    sub: [a.standard?.code, a.class?.name, a.subject?.name].filter(Boolean).join(' · ')
                })));
            }
        } catch {
            setOptions([]);
        } finally {
            setLoading(false);
        }
    }, [classId, debouncedSearch, subjectId, type]);

    useEffect(() => {
        if (!open) return;
        fetchOptions();
    }, [fetchOptions, open]);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const selectedOption = options.find((o) => o.id === value);
    const placeholder = type === 'practice_objective'
        ? t('assignments:form.selectStandard', { defaultValue: 'Select standard...' })
        : t('assignments:form.selectAssessment', { defaultValue: 'Select assessment...' });

    return (
        <div className="ref-picker" ref={wrapperRef}>
            <button
                type="button"
                className="ref-picker__trigger"
                onClick={() => !disabled && setOpen((prev) => !prev)}
                disabled={disabled}
            >
                <span className={selectedOption ? '' : 'ref-picker__placeholder'}>
                    {selectedOption ? selectedOption.label : (value ? value : placeholder)}
                </span>
            </button>
            {open && (
                <div className="ref-picker__dropdown">
                    <input
                        type="text"
                        className="ref-picker__search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={t('assignments:form.searchPlaceholder', { defaultValue: 'Search...' })}
                        autoFocus
                    />
                    {loading && <div className="ref-picker__status">{t('assignments:common.loading', { defaultValue: 'Loading...' })}</div>}
                    {!loading && options.length === 0 && (
                        <div className="ref-picker__status">{t('assignments:form.noResults', { defaultValue: 'No results found' })}</div>
                    )}
                    {!loading && options.map((opt) => (
                        <button
                            key={opt.id}
                            type="button"
                            className={`ref-picker__option ${opt.id === value ? 'is-selected' : ''}`}
                            onClick={() => { onSelect(opt.id, opt.label); setOpen(false); setSearch(''); }}
                        >
                            <span className="ref-picker__option-label">{opt.label}</span>
                            {opt.sub && <span className="ref-picker__option-sub">{opt.sub}</span>}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

const LinkEditor = ({ links = [], onChange, disabled, classId, subjectId }) => {
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
                        <RefPicker
                            type={draft.type}
                            classId={classId}
                            subjectId={subjectId}
                            value={draft.refId}
                            onSelect={(id, label) => {
                                setDraft((prev) => ({
                                    ...prev,
                                    refId: id,
                                    title: prev.title || label
                                }));
                            }}
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
