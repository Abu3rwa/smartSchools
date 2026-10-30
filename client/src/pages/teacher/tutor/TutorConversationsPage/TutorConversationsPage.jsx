import { useTranslation } from 'react-i18next';
import {
  HiOutlineChatAlt2,
  HiOutlineChevronLeft,
  HiOutlineRefresh,
  HiOutlineUserGroup
} from 'react-icons/hi';
import { useTutorConversations } from './hooks/useTutorConversations.js';
import './TutorConversationsPage.css';

const formatWhen = (value, language) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(language === 'ar' ? 'ar' : 'en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(date);
};

export default function TutorConversationsPage() {
  const { t, i18n } = useTranslation(['tutor']);
  const {
    classes,
    classId,
    setClassId,
    studentId,
    setStudentId,
    rows,
    students,
    loading,
    failed,
    retry,
    activeId,
    setActiveId,
    thread,
    threadLoading,
    threadFailed,
    retryThread
  } = useTutorConversations();

  const language = i18n.language === 'ar' ? 'ar' : 'en';
  const active = rows.find((row) => row.id === activeId) || null;

  return (
    <div className="tc-page">
      <header className="tc-head">
        <div>
          <h1>{t('tutor:teacher.title')}</h1>
          <p>{t('tutor:teacher.subtitle')}</p>
        </div>
      </header>

      <div className="tc-toolbar">
        <label>
          <span>{t('tutor:teacher.classFilter')}</span>
          <select value={classId} onChange={(event) => setClassId(event.target.value)}>
            <option value="">{t('tutor:teacher.allClasses')}</option>
            {classes.map((row) => (
              <option key={row._id} value={row._id}>{row.name}</option>
            ))}
          </select>
        </label>
        <label>
          <span>{t('tutor:teacher.studentFilter')}</span>
          <select value={studentId} onChange={(event) => setStudentId(event.target.value)}>
            <option value="">{t('tutor:teacher.allStudents')}</option>
            {students.map((row) => (
              <option key={row.id} value={row.id}>{row.name}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="tc-body">
        <section className="tc-list" aria-label={t('tutor:teacher.listTitle')}>
          <div className="tc-list-head">
            <h2>{t('tutor:teacher.listTitle')}</h2>
            <span>{rows.length}</span>
          </div>

          {loading && <p className="tc-muted">{t('tutor:teacher.loading')}</p>}

          {!loading && failed && (
            <div className="tc-state">
              <p>{t('tutor:teacher.loadFailed')}</p>
              <button type="button" className="btn btn-secondary btn-sm" onClick={retry}>
                <HiOutlineRefresh size={15} aria-hidden="true" />
                {t('tutor:retry')}
              </button>
            </div>
          )}

          {!loading && !failed && rows.length === 0 && (
            <div className="tc-state">
              <HiOutlineChatAlt2 size={28} aria-hidden="true" />
              <strong>{t('tutor:teacher.emptyTitle')}</strong>
              <p>{t('tutor:teacher.emptyBody')}</p>
            </div>
          )}

          {!loading && !failed && rows.map((row) => (
            <button
              key={row.id}
              type="button"
              className={`tc-row${row.id === activeId ? ' is-active' : ''}`}
              onClick={() => setActiveId(row.id)}
            >
              <span className="tc-row-top">
                <strong>{row.studentName || t('tutor:teacher.student')}</strong>
                <span className="tc-row-when">{formatWhen(row.lastMessageAt, language)}</span>
              </span>
              <span className="tc-row-meta">
                {[row.subject, row.className].filter(Boolean).join(' · ')}
                {row.messageCount > 0 && ` · ${t('tutor:teacher.questions', { n: row.messageCount })}`}
              </span>
              {row.preview && <span className="tc-row-preview">{row.preview}</span>}
            </button>
          ))}
        </section>

        <section className="tc-thread" aria-label={t('tutor:teacher.threadTitle')}>
          {!activeId && (
            <div className="tc-state tc-state--roomy">
              <HiOutlineUserGroup size={30} aria-hidden="true" />
              <p>{t('tutor:teacher.pickOne')}</p>
            </div>
          )}

          {activeId && (
            <>
              <header className="tc-thread-head">
                <button type="button" className="tc-back" onClick={() => setActiveId('')}>
                  <HiOutlineChevronLeft size={15} aria-hidden="true" />
                  {t('tutor:teacher.backToList')}
                </button>
                <div>
                  <h2>{active?.studentName || thread?.studentName || ''}</h2>
                  <p>{[active?.subject || thread?.subject, active?.className].filter(Boolean).join(' · ')}</p>
                </div>
              </header>

              {threadLoading && <p className="tc-muted">{t('tutor:teacher.loadingThread')}</p>}

              {!threadLoading && threadFailed && (
                <div className="tc-state">
                  <p>{t('tutor:teacher.loadFailed')}</p>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={retryThread}>
                    <HiOutlineRefresh size={15} aria-hidden="true" />
                    {t('tutor:retry')}
                  </button>
                </div>
              )}

              {!threadLoading && !threadFailed && thread && (
                <div className="tc-messages">
                  {thread.messages.length === 0 && <p className="tc-muted">{t('tutor:teacher.emptyThread')}</p>}
                  {thread.messages.map((message) => (
                    <article key={message.id} className={`tc-msg is-${message.role}`}>
                      <span className="tc-msg-who">
                        {message.role === 'tutor' ? t('tutor:teacher.tutorLabel') : t('tutor:teacher.studentLabel')}
                        {message.at && ` · ${formatWhen(message.at, language)}`}
                      </span>
                      <div className="tc-bubble">
                        {String(message.text || '').split(/\n{2,}/).map((paragraph, index) => (
                          <p key={index}>{paragraph}</p>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
