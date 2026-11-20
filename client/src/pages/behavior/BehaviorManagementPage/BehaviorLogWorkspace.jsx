import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlinePlus, HiOutlineClipboardList } from 'react-icons/hi';
import { behaviorLogApi, behaviorError } from './behaviorLogApi';
import BehaviorRecordForm from './BehaviorRecordForm';
import BehaviorRecordDetail from './BehaviorRecordDetail';
import ConsequencesWorkspace from './consequences/ConsequencesWorkspace';
import { IncidentDetail } from './consequences/IncidentLedgerPanel';
import './behaviorLog.css';

export default function BehaviorLogWorkspace({ user, settings }) {
    const { t, i18n } = useTranslation('behaviorConsequences');
    const [roster, setRoster] = useState([]);
    const [catalog, setCatalog] = useState(null);
    const [rosterError, setRosterError] = useState('');
    const [history, setHistory] = useState(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({
        range: 'all',
        student: '',
        classId: '',
        status: 'all',
        severity: '',
        offset: 0
    });
    const [reload, setReload] = useState(0);
    const [recording, setRecording] = useState(false);
    const [selected, setSelected] = useState(null);
    const [formalId, setFormalId] = useState(null);
    const [advanced, setAdvanced] = useState(false);
    const refresh = useCallback(() => {
        setLoading(true);
        setError('');
        setReload((value) => value + 1);
    }, []);
    const isAdmin = [user?.role, ...(user?.roles || [])].some((role) =>
        [
            'super_admin',
            'admin',
            'department_principal',
            'behavior_manager'
        ].includes(role)
    );
    useEffect(() => {
        let cancelled = false;
        Promise.all([behaviorLogApi.roster(), behaviorLogApi.catalog()])
            .then(([students, options]) => {
                if (!cancelled) {
                    setRoster(students.students);
                    setCatalog(options);
                    setRosterError('');
                }
            })
            .catch((failure) => {
                if (!cancelled) setRosterError(behaviorError(failure, t));
            });
        return () => {
            cancelled = true;
        };
    }, [reload, t]);
    useEffect(() => {
        const abort = new AbortController();
        behaviorLogApi
            .list(
                {
                    range: filters.range,
                    student: filters.student || undefined,
                    classId: filters.classId || undefined,
                    severity: filters.severity || undefined,
                    followUp:
                        filters.status === 'followUp' ? 'true' : undefined,
                    review: filters.status === 'review' ? 'true' : undefined,
                    limit: 25,
                    offset: filters.offset
                },
                abort.signal
            )
            .then((result) => {
                if (!abort.signal.aborted) setHistory(result);
            })
            .catch((failure) => {
                if (!abort.signal.aborted) setError(behaviorError(failure, t));
            })
            .finally(() => {
                if (!abort.signal.aborted) setLoading(false);
            });
        return () => abort.abort();
    }, [filters, reload, t]);
    const classes = useMemo(
        () => [
            ...new Map(
                roster
                    .filter((row) => row.classId)
                    .map((row) => [row.classId, row.className])
            ).entries()
        ],
        [roster]
    );
    const changeFilter = (key, value) => {
        setLoading(true);
        setError('');
        setFilters((current) => ({
            ...current,
            [key]: value,
            ...(key === 'classId' ? { student: '' } : {}),
            offset: 0
        }));
    };
    const changePage = (offset) => {
        setLoading(true);
        setError('');
        setFilters((current) => ({ ...current, offset }));
    };
    const showFormal = (id) => {
        setSelected(null);
        setFormalId(id);
    };
    return (
        <div className="bl-workspace" dir={i18n.dir()}>
            <header className="bl-header">
                <h1>{t('behaviorLog.title')}</h1>
                <div className="bl-actions">
                    <button
                        type="button"
                        onClick={() => setAdvanced(!advanced)}
                    >
                        <HiOutlineClipboardList />
                        {advanced
                            ? t('behaviorLog.backLog')
                            : t('behaviorLog.advanced')}
                    </button>
                    {!advanced && (
                        <button
                            className="bl-primary"
                            type="button"
                            disabled={
                                !catalog ||
                                !roster.length ||
                                Boolean(rosterError)
                            }
                            onClick={() => setRecording(true)}
                        >
                            <HiOutlinePlus />
                            {t('behaviorLog.record')}
                        </button>
                    )}
                </div>
            </header>
            {advanced ? (
                <ConsequencesWorkspace
                    students={roster.map((row) => ({
                        _id: row.id,
                        firstName: row.name,
                        lastName: '',
                        currentClass: { name: row.className }
                    }))}
                    user={user}
                    initialSettings={settings}
                    initialTab="approvals"
                />
            ) : (
                <>
                    <div className="bl-filters">
                        <label>
                            {t('behaviorLog.class')}
                            <select
                                value={filters.classId}
                                onChange={(event) =>
                                    changeFilter('classId', event.target.value)
                                }
                            >
                                <option value="">
                                    {t('behaviorLog.allClasses')}
                                </option>
                                {classes.map(([id, name]) => (
                                    <option key={id} value={id}>
                                        {name}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label>
                            {t('behaviorLog.student')}
                            <select
                                value={filters.student}
                                onChange={(event) =>
                                    changeFilter('student', event.target.value)
                                }
                            >
                                <option value="">
                                    {t('behaviorLog.allStudents')}
                                </option>
                                {roster
                                    .filter(
                                        (row) =>
                                            !filters.classId ||
                                            row.classId === filters.classId
                                    )
                                    .map((row) => (
                                        <option key={row.id} value={row.id}>
                                            {row.name}
                                        </option>
                                    ))}
                            </select>
                        </label>
                        <label>
                            {t('behaviorLog.date')}
                            <select
                                value={filters.range}
                                onChange={(event) =>
                                    changeFilter('range', event.target.value)
                                }
                            >
                                {['all', 'today', 'week'].map((key) => (
                                    <option key={key} value={key}>
                                        {t(`behaviorLog.ranges.${key}`)}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label>
                            {t('common.status')}
                            <select
                                value={filters.status}
                                onChange={(event) =>
                                    changeFilter('status', event.target.value)
                                }
                            >
                                {['all', 'followUp', 'review'].map((key) => (
                                    <option key={key} value={key}>
                                        {t(`behaviorLog.filters.${key}`)}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label>
                            {t('behaviorLog.severity')}
                            <select
                                value={filters.severity}
                                onChange={(event) =>
                                    changeFilter('severity', event.target.value)
                                }
                            >
                                <option value="">{t('behaviorLog.all')}</option>
                                {(catalog?.severities || []).map((key) => (
                                    <option key={key} value={key}>
                                        {t(`behaviorLog.severities.${key}`)}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </div>
                    {(error || rosterError) && (
                        <p className="bl-error" role="alert">
                            {error || rosterError}
                            <button type="button" onClick={refresh}>
                                {t('common.retry')}
                            </button>
                        </p>
                    )}
                    {loading ? (
                        <p role="status">{t('common.loading')}</p>
                    ) : !error && history?.items.length === 0 ? (
                        <p className="bl-empty">{t('behaviorLog.empty')}</p>
                    ) : (
                        !error && (
                            <ul className="bl-list">
                                {history?.items.map((entry) => (
                                    <li key={entry.eventId}>
                                        <button
                                            type="button"
                                            className="bl-record"
                                            onClick={() =>
                                                entry.source === 'formal'
                                                    ? showFormal(
                                                          entry.formalCase
                                                              ?.id ||
                                                              entry.id.slice(7)
                                                      )
                                                    : setSelected(entry)
                                            }
                                        >
                                            <span className="bl-record-person">
                                                <strong dir="auto">
                                                    {entry.student.name}
                                                </strong>
                                                <small>{entry.className}</small>
                                            </span>
                                            <span>
                                                <strong>
                                                    {entry.source === 'formal'
                                                        ? t(
                                                              'behaviorLog.formalCase'
                                                          )
                                                        : t(
                                                              `behaviorLog.categories.${entry.category}`,
                                                              {
                                                                  defaultValue:
                                                                      entry.category
                                                              }
                                                          )}
                                                </strong>
                                                <span
                                                    className="bl-excerpt"
                                                    dir="auto"
                                                >
                                                    {entry.notes ||
                                                        t('behaviorLog.noNote')}
                                                </span>
                                            </span>
                                            <span className="bl-record-status">
                                                <span
                                                    className={`bl-badge bl-${entry.severity}`}
                                                >
                                                    {t(
                                                        `behaviorLog.severities.${entry.severity}`
                                                    )}
                                                </span>
                                                <small>
                                                    {entry.review.status ===
                                                    'pending'
                                                        ? t(
                                                              'behaviorLog.pendingReview'
                                                          )
                                                        : entry.followUp.needed
                                                          ? t(
                                                                'behaviorLog.needsFollowUp'
                                                            )
                                                          : entry.followUp
                                                                  .completedAt
                                                            ? t(
                                                                  'behaviorLog.completed'
                                                              )
                                                            : t(
                                                                  'behaviorLog.noFollowUp'
                                                              )}
                                                </small>
                                                <small>
                                                    {t(
                                                        `behaviorLog.messageStates.${entry.communication.status}`
                                                    )}
                                                </small>
                                            </span>
                                            <time>
                                                {entry.occurredAt
                                                    ? new Date(
                                                          entry.occurredAt
                                                      ).toLocaleDateString(
                                                          i18n.language,
                                                          {
                                                              month: 'short',
                                                              day: 'numeric'
                                                          }
                                                      )
                                                    : ''}
                                            </time>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )
                    )}
                    {!loading && !error && history?.total > 25 && (
                        <nav
                            className="bl-actions"
                            aria-label={t('behaviorLog.pages')}
                        >
                            <button
                                type="button"
                                disabled={!filters.offset}
                                onClick={() =>
                                    changePage(Math.max(0, filters.offset - 25))
                                }
                            >
                                {t('common.previous')}
                            </button>
                            <span>
                                {t('common.showing', {
                                    from: filters.offset + 1,
                                    to: Math.min(
                                        filters.offset + 25,
                                        history.total
                                    ),
                                    total: history.total
                                })}
                            </span>
                            <button
                                type="button"
                                disabled={filters.offset + 25 >= history.total}
                                onClick={() => changePage(filters.offset + 25)}
                            >
                                {t('common.next')}
                            </button>
                        </nav>
                    )}
                </>
            )}
            {recording && (
                <BehaviorRecordForm
                    students={roster}
                    catalog={catalog}
                    onClose={() => setRecording(false)}
                    onSaved={(entry) => {
                        setRecording(false);
                        setSelected(entry);
                        refresh();
                    }}
                />
            )}
            {selected && (
                <BehaviorRecordDetail
                    key={selected.id}
                    entry={selected}
                    onClose={() => setSelected(null)}
                    onChanged={refresh}
                    onFormal={showFormal}
                />
            )}
            {formalId && (
                <IncidentDetail
                    incidentId={formalId}
                    isAdmin={isAdmin}
                    onClose={() => setFormalId(null)}
                    onChanged={refresh}
                />
            )}
        </div>
    );
}
