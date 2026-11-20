import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import BehaviorDialog from './BehaviorDialog';
import { behaviorLogApi, behaviorError } from './behaviorLogApi';

export default function BehaviorRecordDetail({
    entry,
    onClose,
    onChanged,
    onFormal
}) {
    const { t, i18n } = useTranslation('behaviorConsequences');
    const [detail, setDetail] = useState(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [note, setNote] = useState('');
    const [language, setLanguage] = useState(
        i18n.language.startsWith('ar') ? 'ar' : 'en'
    );
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    const [composing, setComposing] = useState(false);
    const [preview, setPreview] = useState(null);
    const load = useCallback(async () => {
        const result = await behaviorLogApi.detail(entry.id);
        setDetail(result);
        return result;
    }, [entry.id]);
    useEffect(() => {
        let cancelled = false;
        behaviorLogApi
            .detail(entry.id)
            .then((value) => {
                if (!cancelled) setDetail(value);
            })
            .catch((failure) => {
                if (!cancelled) setError(behaviorError(failure, t));
            });
        return () => {
            cancelled = true;
        };
    }, [entry.id, t]);
    const act = async (action, payload = {}) => {
        if (busy) return;
        setBusy(true);
        setError('');
        try {
            const result = await behaviorLogApi.action(
                entry.id,
                action,
                payload
            );
            if (action === 'follow-up' || action === 'review') setNote('');
            if (action === 'message-preview') setPreview(result.communication);
            if (action === 'message-send') {
                setPreview(null);
                setComposing(false);
            }
            await load();
            onChanged();
        } catch (failure) {
            setError(behaviorError(failure, t));
        } finally {
            setBusy(false);
        }
    };
    const dirty = Boolean(note || (composing && !preview));
    const close = () => {
        if (!busy && (!dirty || window.confirm(t('behaviorLog.discardPrompt'))))
            onClose();
    };
    const message = detail?.communication;
    const canCompose =
        !message ||
        ['not_sent', 'draft', 'awaiting_review', 'failed'].includes(
            message.status
        );
    return (
        <BehaviorDialog
            title={entry.student.name}
            onClose={close}
            dirty={dirty}
            busy={busy}
        >
            <div className="bl-form">
                <div className="bl-actions">
                    <span className={`bl-badge bl-${entry.severity}`}>
                        {t(`behaviorLog.severities.${entry.severity}`)}
                    </span>
                    <span>
                        {t(`behaviorLog.categories.${entry.category}`, {
                            defaultValue: entry.category
                        })}
                    </span>
                    <time>
                        {entry.occurredAt
                            ? new Date(entry.occurredAt).toLocaleString(
                                  i18n.language
                              )
                            : ''}
                    </time>
                </div>
                <p className="bl-description" dir="auto">
                    {entry.notes || t('behaviorLog.noNote')}
                </p>
                {error && (
                    <p role="alert" className="bl-error">
                        {error}
                        <button
                            type="button"
                            onClick={() => {
                                setError('');
                                load().catch((failure) =>
                                    setError(behaviorError(failure, t))
                                );
                            }}
                        >
                            {t('common.retry')}
                        </button>
                    </p>
                )}
                {!detail && !error && (
                    <p role="status">{t('common.loading')}</p>
                )}
                {detail && (
                    <>
                        {detail.review.status === 'pending' && (
                            <section className="bl-notice">
                                <strong>
                                    {t('behaviorLog.seriousReview')}
                                </strong>
                                <p>
                                    {t('behaviorLog.reviewRoles', {
                                        roles: detail.review.approverRoles
                                            .map((role) =>
                                                t(`behaviorLog.roles.${role}`, {
                                                    defaultValue: role
                                                })
                                            )
                                            .join('، ')
                                    })}
                                </p>
                                {detail.canReview && (
                                    <>
                                        <label>
                                            {t('behaviorLog.reviewNote')}
                                            <textarea
                                                maxLength={500}
                                                value={note}
                                                onChange={(event) =>
                                                    setNote(event.target.value)
                                                }
                                            />
                                        </label>
                                        <button
                                            type="button"
                                            disabled={busy}
                                            onClick={() =>
                                                act('review', { note })
                                            }
                                        >
                                            {t('behaviorLog.markReviewed')}
                                        </button>
                                    </>
                                )}
                            </section>
                        )}
                        <section>
                            <h3>{t('behaviorLog.followUp')}</h3>
                            <p>
                                {detail.followUp.action ||
                                    t('behaviorLog.followUpHint')}
                            </p>
                            {detail.followUp.dueAt && (
                                <p>
                                    {t('behaviorLog.due')}:{' '}
                                    {new Date(
                                        detail.followUp.dueAt
                                    ).toLocaleDateString(i18n.language)}
                                </p>
                            )}
                            {entry.followUp.needed &&
                            !detail.followUp.completedAt ? (
                                <>
                                    <label>
                                        {t('behaviorLog.completionNote')}
                                        <textarea
                                            maxLength={500}
                                            value={note}
                                            onChange={(event) =>
                                                setNote(event.target.value)
                                            }
                                        />
                                    </label>
                                    <button
                                        type="button"
                                        disabled={
                                            busy ||
                                            detail.review.status === 'pending'
                                        }
                                        onClick={() =>
                                            act('follow-up', { note })
                                        }
                                    >
                                        {t('behaviorLog.complete')}
                                    </button>
                                </>
                            ) : (
                                <p>
                                    {detail.followUp.completedAt
                                        ? t('behaviorLog.completed')
                                        : t('behaviorLog.noFollowUp')}
                                </p>
                            )}
                        </section>
                        <section>
                            <h3>{t('behaviorLog.parentCommunication')}</h3>
                            <p className="bl-badge">
                                {t(
                                    `behaviorLog.messageStates.${message?.status || 'not_sent'}`
                                )}
                            </p>
                            {message?.status === 'sent' && (
                                <p>{t('behaviorLog.sentMeaning')}</p>
                            )}
                            {message?.error && (
                                <p className="bl-error">
                                    {t('behaviorLog.sendFailed')}
                                </p>
                            )}
                            {detail.deliveryBlock && (
                                <p className="bl-notice">
                                    {t(
                                        `behaviorLog.errors.${detail.deliveryBlock}`
                                    )}
                                </p>
                            )}
                            {message?.status === 'awaiting_review' && (
                                <p>{t('behaviorLog.awaitingReview')}</p>
                            )}
                            {!composing && canCompose && (
                                <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => {
                                        setComposing(true);
                                        setSubject(
                                            message?.subject ||
                                                t(
                                                    'behaviorLog.defaultSubject',
                                                    { lng: language }
                                                )
                                        );
                                        setBody(
                                            message?.body ||
                                                t('behaviorLog.defaultBody', {
                                                    lng: language
                                                })
                                        );
                                        setPreview(
                                            message?.previewHash
                                                ? message
                                                : null
                                        );
                                    }}
                                >
                                    {t('behaviorLog.messageParent')}
                                </button>
                            )}
                            {composing && (
                                <div className="bl-form">
                                    <p className="bl-notice">
                                        {t('behaviorLog.parentPrivacy')}
                                    </p>
                                    <label>
                                        {t('behaviorLog.messageLanguage')}
                                        <select
                                            value={language}
                                            onChange={(event) => {
                                                setLanguage(event.target.value);
                                                setPreview(null);
                                            }}
                                        >
                                            <option value="en">English</option>
                                            <option value="ar">العربية</option>
                                        </select>
                                    </label>
                                    <label>
                                        {t('behaviorLog.subject')}
                                        <input
                                            maxLength={200}
                                            value={subject}
                                            onChange={(event) => {
                                                setSubject(event.target.value);
                                                setPreview(null);
                                            }}
                                        />
                                    </label>
                                    <label>
                                        {t('behaviorLog.message')}
                                        <textarea
                                            dir="auto"
                                            maxLength={2000}
                                            rows={5}
                                            value={body}
                                            onChange={(event) => {
                                                setBody(event.target.value);
                                                setPreview(null);
                                            }}
                                        />
                                    </label>
                                    <button
                                        type="button"
                                        disabled={
                                            busy ||
                                            !body.trim() ||
                                            !subject.trim()
                                        }
                                        onClick={() =>
                                            act('message-preview', {
                                                language,
                                                subject,
                                                body
                                            })
                                        }
                                    >
                                        {t('behaviorLog.preview')}
                                    </button>
                                    {preview && (
                                        <section className="bl-suggestion">
                                            <strong>
                                                {t('behaviorLog.recipients')}
                                            </strong>
                                            <ul>
                                                {preview.recipients?.map(
                                                    (recipient) => (
                                                        <li
                                                            key={
                                                                recipient.email
                                                            }
                                                        >
                                                            <bdi>
                                                                {recipient.name}{' '}
                                                                &lt;
                                                                {
                                                                    recipient.email
                                                                }
                                                                &gt;
                                                            </bdi>
                                                        </li>
                                                    )
                                                )}
                                            </ul>
                                            <h4 dir="auto">
                                                {preview.subject}
                                            </h4>
                                            <p
                                                className="bl-description"
                                                dir="auto"
                                            >
                                                {preview.body}
                                            </p>
                                            <button
                                                type="button"
                                                disabled={
                                                    busy ||
                                                    Boolean(
                                                        detail.deliveryBlock
                                                    ) ||
                                                    detail.review.status ===
                                                        'pending'
                                                }
                                                onClick={() => {
                                                    if (
                                                        window.confirm(
                                                            t(
                                                                'behaviorLog.sendConfirm'
                                                            )
                                                        )
                                                    )
                                                        act('message-send', {
                                                            previewHash:
                                                                preview.previewHash,
                                                            confirmed: true,
                                                            approve:
                                                                detail.canReview
                                                        });
                                                }}
                                            >
                                                {detail.canReview
                                                    ? t(
                                                          'behaviorLog.approveSend'
                                                      )
                                                    : t(
                                                          'behaviorLog.confirmSend'
                                                      )}
                                            </button>
                                        </section>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setComposing(false);
                                            setPreview(null);
                                        }}
                                    >
                                        {t('behaviorLog.cancel')}
                                    </button>
                                </div>
                            )}
                            <details>
                                <summary>
                                    {t('behaviorLog.manualContact')}
                                </summary>
                                <p>{t('behaviorLog.manualHint')}</p>
                                <div className="bl-actions">
                                    {['phone', 'in_person'].map((method) => (
                                        <button
                                            key={method}
                                            type="button"
                                            disabled={busy}
                                            onClick={() => {
                                                if (
                                                    window.confirm(
                                                        t(
                                                            'behaviorLog.manualConfirm'
                                                        )
                                                    )
                                                )
                                                    act('contact', { method });
                                            }}
                                        >
                                            {t(`behaviorLog.${method}`)}
                                        </button>
                                    ))}
                                </div>
                                {detail.manualContact && (
                                    <p>
                                        {t(
                                            `behaviorLog.${detail.manualContact.method}`,
                                            {
                                                defaultValue:
                                                    detail.manualContact.method
                                            }
                                        )}{' '}
                                        ·{' '}
                                        {new Date(
                                            detail.manualContact.at
                                        ).toLocaleString(i18n.language)}
                                    </p>
                                )}
                            </details>
                        </section>
                        {detail.formalCase && (
                            <button
                                type="button"
                                onClick={() => onFormal(detail.formalCase._id)}
                            >
                                {t('behaviorLog.openFormal')}
                            </button>
                        )}
                    </>
                )}
            </div>
        </BehaviorDialog>
    );
}
