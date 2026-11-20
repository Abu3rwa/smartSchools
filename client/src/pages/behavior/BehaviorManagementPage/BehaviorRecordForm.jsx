import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import BehaviorDialog from './BehaviorDialog';
import BehaviorDescriptionTools from './BehaviorDescriptionTools';
import { behaviorLogApi, behaviorError } from './behaviorLogApi';

export default function BehaviorRecordForm({
    students,
    catalog,
    onClose,
    onSaved
}) {
    const { t } = useTranslation('behaviorConsequences');
    const [student, setStudent] = useState('');
    const [search, setSearch] = useState('');
    const [category, setCategory] = useState('');
    const [severity, setSeverity] = useState('minor');
    const [notes, setNotes] = useState('');
    const [original, setOriginal] = useState('');
    const [followUp, setFollowUp] = useState(false);
    const [action, setAction] = useState('');
    const [due, setDue] = useState('');
    const [occurredAt, setOccurredAt] = useState('');
    const [others, setOthers] = useState([]);
    const [saving, setSaving] = useState(false);
    const [recording, setRecording] = useState(false);
    const [error, setError] = useState('');
    const textarea = useRef(null);
    const requestKey = useRef(crypto.randomUUID());
    const savingRef = useRef(false);
    const selectedStudent = students.find((row) => row.id === student) || null;
    const otherOptions = students.filter(
        (row) =>
            row.id !== student &&
            (!selectedStudent?.classId ||
                row.classId === selectedStudent.classId)
    );
    const dirty = Boolean(
        student ||
        category ||
        notes ||
        followUp ||
        severity !== 'minor' ||
        action ||
        due ||
        occurredAt ||
        others.length ||
        recording
    );
    const close = () => {
        if (
            !saving &&
            (!dirty || window.confirm(t('behaviorLog.discardPrompt')))
        )
            onClose();
    };
    const save = async (event) => {
        event.preventDefault();
        if (savingRef.current) return;
        if (
            !student ||
            !category ||
            (severity === 'serious' && !notes.trim())
        ) {
            setError(t('behaviorLog.required'));
            return;
        }
        if (occurredAt && new Date(occurredAt).getTime() > Date.now()) {
            setError(t('behaviorLog.future'));
            return;
        }
        savingRef.current = true;
        setSaving(true);
        setError('');
        try {
            const result = await behaviorLogApi.create({
                student,
                category,
                severity,
                notes,
                followUp,
                otherStudents: others,
                requestKey: requestKey.current,
                ...(original ? { originalDescription: original } : {}),
                ...(occurredAt
                    ? { occurredAt: new Date(occurredAt).toISOString() }
                    : {}),
                ...(action ? { followUpAction: action } : {}),
                ...(due ? { followUpDate: new Date(due).toISOString() } : {})
            });
            onSaved(result.entry);
        } catch (failure) {
            setError(behaviorError(failure, t));
        } finally {
            savingRef.current = false;
            setSaving(false);
        }
    };
    return (
        <BehaviorDialog
            title={t('behaviorLog.record')}
            onClose={close}
            dirty={dirty}
            busy={saving}
        >
            <form className="bl-form" onSubmit={save}>
                <label>
                    {t('behaviorLog.student')}
                    <input
                        type="search"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder={t('behaviorLog.searchStudent')}
                    />
                </label>
                <label>
                    {t('behaviorLog.selectStudent')}
                    <select
                        required
                        value={student}
                        onChange={(event) => {
                            const nextId = event.target.value;
                            const previousClass =
                                selectedStudent?.classId || '';
                            const nextClass =
                                students.find((row) => row.id === nextId)
                                    ?.classId || '';
                            setStudent(nextId);
                            setOriginal('');
                            setRecording(false);
                            setOthers((current) =>
                                previousClass === nextClass
                                    ? current.filter((id) => id !== nextId)
                                    : []
                            );
                        }}
                    >
                        <option value="">{t('behaviorLog.choose')}</option>
                        {students
                            .filter(
                                (row) =>
                                    row.id === student ||
                                    `${row.name} ${row.code}`
                                        .toLowerCase()
                                        .includes(search.toLowerCase())
                            )
                            .map((row) => (
                                <option key={row.id} value={row.id}>
                                    {row.name} · {row.className}
                                </option>
                            ))}
                    </select>
                </label>
                <div className="bl-fields">
                    <label>
                        {t('behaviorLog.category')}
                        <select
                            required
                            value={category}
                            onChange={(event) =>
                                setCategory(event.target.value)
                            }
                        >
                            <option value="">{t('behaviorLog.choose')}</option>
                            {catalog.categories.map(({ key }) => (
                                <option key={key} value={key}>
                                    {t(`behaviorLog.categories.${key}`)}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label>
                        {t('behaviorLog.severity')}
                        <select
                            value={severity}
                            onChange={(event) =>
                                setSeverity(event.target.value)
                            }
                        >
                            {catalog.severities.map((key) => (
                                <option key={key} value={key}>
                                    {t(`behaviorLog.severities.${key}`)}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>
                <label>
                    {t('behaviorLog.description')}
                    {severity === 'serious'
                        ? ` — ${t('behaviorLog.noteRequired')}`
                        : ''}
                    <textarea
                        ref={textarea}
                        dir="auto"
                        rows={4}
                        maxLength={1000}
                        required={severity === 'serious'}
                        value={notes}
                        onChange={(event) => setNotes(event.target.value)}
                        placeholder={t('behaviorLog.notesHint')}
                    />
                </label>
                <BehaviorDescriptionTools
                    key={student}
                    text={notes}
                    onChange={setNotes}
                    student={student}
                    textarea={textarea}
                    onOriginal={(value) =>
                        setOriginal((previous) => previous || value)
                    }
                    onRecording={setRecording}
                />
                <details>
                    <summary>{t('behaviorLog.optional')}</summary>
                    <div className="bl-form">
                        <label>
                            {t('behaviorLog.occurredAt')}
                            <input
                                type="datetime-local"
                                value={occurredAt}
                                onChange={(event) =>
                                    setOccurredAt(event.target.value)
                                }
                            />
                        </label>
                        <label>
                            {t('behaviorLog.otherStudents')}
                            <select
                                multiple
                                value={others}
                                onChange={(event) =>
                                    setOthers(
                                        [...event.target.selectedOptions].map(
                                            (option) => option.value
                                        )
                                    )
                                }
                            >
                                {otherOptions.map((row) => (
                                    <option key={row.id} value={row.id}>
                                        {row.name}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="bl-check">
                            <input
                                type="checkbox"
                                checked={followUp || severity === 'serious'}
                                disabled={severity === 'serious'}
                                onChange={(event) =>
                                    setFollowUp(event.target.checked)
                                }
                            />
                            {t('behaviorLog.needsFollowUp')}
                        </label>
                        {(followUp || severity === 'serious') && (
                            <>
                                <label>
                                    {t('behaviorLog.followUpAction')}
                                    <input
                                        maxLength={500}
                                        value={action}
                                        onChange={(event) =>
                                            setAction(event.target.value)
                                        }
                                    />
                                </label>
                                <label>
                                    {t('behaviorLog.due')}
                                    <input
                                        type="date"
                                        value={due}
                                        onChange={(event) =>
                                            setDue(event.target.value)
                                        }
                                    />
                                </label>
                                <small>{t('behaviorLog.followUpOwner')}</small>
                            </>
                        )}
                    </div>
                </details>
                {severity === 'serious' && (
                    <p className="bl-notice">
                        {t('behaviorLog.seriousReview')}
                    </p>
                )}
                <p className="bl-muted">{t('behaviorLog.saveHint')}</p>
                {error && (
                    <p role="alert" className="bl-error">
                        {error}
                    </p>
                )}
                <footer className="bl-actions">
                    <button
                        className="bl-primary"
                        type="submit"
                        disabled={saving || recording}
                    >
                        {saving ? t('common.saving') : t('behaviorLog.save')}
                    </button>
                    <button type="button" disabled={saving} onClick={close}>
                        {t('behaviorLog.cancel')}
                    </button>
                </footer>
            </form>
        </BehaviorDialog>
    );
}
