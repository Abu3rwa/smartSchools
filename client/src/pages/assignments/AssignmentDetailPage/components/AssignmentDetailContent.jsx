import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  HiOutlineArrowLeft,
  HiOutlineBookOpen,
  HiOutlineCalendar,
  HiOutlineChartBar,
  HiOutlineDocumentText,
  HiOutlineExternalLink,
  HiOutlineLink,
} from 'react-icons/hi';
import {
  collectAssignmentResources,
  formatDateTime,
  getSafeUrl,
} from '../utils/assignmentDetailPresentation';
import { formatRelativeTime } from '../../../../utils/relativeTime';

const AssignmentDetailContent = ({ assignment, lessonPlans, isParent }) => {
  const { t, i18n } = useTranslation(['assignments']);
  const locale = i18n.language?.startsWith('ar') ? 'ar-EG' : 'en-GB';

  const students = Array.isArray(assignment?.students) ? assignment.students : [];
  const gradeRows = students.filter((student) => student?.grade);
  const studentNames = students.map((student) => student.name).filter(Boolean);
  const submission = students[0]?.submission || assignment?.googleForm?.submission || null;
  const resources = collectAssignmentResources(assignment);
  const classroomUrl = getSafeUrl(assignment?.classroom?.url);
  const responderUri = getSafeUrl(assignment?.googleForm?.responderUri);
  const googleFormUrl = responderUri
    && new URL(responderUri).hostname === 'docs.google.com'
    && new URL(responderUri).pathname.startsWith('/forms/')
    ? responderUri
    : null;
  const isPractice =
    String(assignment?.assignmentType?.key || '').toLowerCase() === 'standard_assignment';

  const resultAvailability = assignment?.resultAvailability || null;
  const googleFormSync = assignment?.googleFormSync || null;
  const dueDateTime = assignment?.dueDate ? new Date(assignment.dueDate).getTime() : null;
  const hasPassedDueDate = Number.isFinite(dueDateTime) && dueDateTime < Date.now();
  const isClosed = resultAvailability?.isClosed
    || assignment?.status === 'closed'
    || hasPassedDueDate;
  const closedMessage = isClosed && assignment?.dueDate
    ? (assignment?.allowLateSubmission
        ? t('detail.resultBanner.closed_late_allowed', {
            date: formatDateTime(assignment.dueDate, locale),
          })
        : t('detail.resultBanner.closed_no_late', {
            date: formatDateTime(assignment.dueDate, locale),
          }))
    : '';

  const resultBanner = (() => {
    const state = resultAvailability?.state;
    if (state === 'graded' || resultAvailability?.isReleased) {
      return { tone: 'success', text: t('detail.resultBanner.released') };
    }
    if (state === 'awaiting_review' || state === 'changed') {
      return { tone: 'warning', text: t('detail.resultBanner.awaiting_review') };
    }
    if (state === 'submitted' || state === 'late') {
      return { tone: 'info', text: t('detail.resultBanner.submitted') };
    }
    if (state === 'awaiting_sync') {
      return { tone: 'info', text: t('detail.googleFormAwaitingSync') };
    }
    if (closedMessage) {
      return { tone: 'warning', text: closedMessage };
    }
    return null;
  })();

  const googleFormSyncText = (() => {
    if (!googleFormSync) return '';
    if (googleFormSync.status === 'failed') {
      return t('detail.googleFormSyncFailed');
    }
    if (googleFormSync.status === 'awaiting' || !googleFormSync.lastSyncedAt) {
      return t('detail.googleFormAwaitingSync');
    }
    return t('detail.googleFormSync', {
      time: formatRelativeTime(googleFormSync.lastSyncedAt, locale),
    });
  })();

  const metaParts = [
    assignment?.subject?.name
      ? `${t('detail.subject')}: ${assignment.subject.name}`
      : t('detail.noSubject'),
    assignment?.class?.name ? `${t('detail.class')}: ${assignment.class.name}` : '',
    assignment?.teacher ? `${t('detail.teacher')}: ${assignment.teacher}` : '',
  ].filter(Boolean);

  return (
    <div className="student-assignment-detail-page">
      <Link
        to={isParent ? '/portal/dashboard' : '/portal/my-assignments'}
        className="btn btn-ghost back-btn"
      >
        <HiOutlineArrowLeft size={18} />
        {isParent ? t('detail.backToDashboard') : t('detail.backToAssignments')}
      </Link>

      <article className="detail-card">
        <header className="detail-header">
          <p className="detail-type">{assignment?.assignmentType?.name || t('detail.assignment')}</p>
          <h1>{assignment?.title || t('detail.assignment')}</h1>
          {assignment?.summary ? (
            <p className="detail-summary">{assignment.summary}</p>
          ) : null}
          <p className="detail-meta">{metaParts.join(' • ')}</p>
          {isParent && studentNames.length > 0 ? (
            <p className="detail-meta">{t('detail.forStudent', { name: studentNames.join(', ') })}</p>
          ) : null}
          {!isParent && isPractice ? (
            <div className="detail-actions">
              <Link className="btn btn-primary" to={`/portal/practice/${assignment.id}`}>
                {t('detail.startPractice')}
              </Link>
            </div>
          ) : null}
        </header>

        {resultBanner ? (
          <div className={`detail-banner ${resultBanner.tone}`} role="status">
            {resultBanner.text}
          </div>
        ) : null}

        <section className="detail-section">
          <h2>
            <HiOutlineCalendar size={18} />
            {t('detail.timeline')}
          </h2>
          <div className="timeline-grid">
            <div>
              <span className="timeline-label">{t('detail.assigned')}</span>
              <p>{formatDateTime(assignment?.assignedDate, locale) || t('common.empty')}</p>
            </div>
            <div>
              <span className="timeline-label">{t('detail.due')}</span>
              <p>{formatDateTime(assignment?.dueDate, locale) || t('detail.noDueDate')}</p>
            </div>
          </div>
        </section>

        <section className="detail-section">
          <h2>
            <HiOutlineDocumentText size={18} />
            {t('detail.instructions')}
          </h2>
          {assignment?.instructions ? (
            <p className="instructions-text">{assignment.instructions}</p>
          ) : (
            <p className="muted">{t('detail.noInstructions')}</p>
          )}
        </section>

        {gradeRows.length > 0 ? (
          <section className="detail-section">
            <h2>
              <HiOutlineChartBar size={18} />
              {t('detail.grades')}
            </h2>
            <div className="grade-list">
              {gradeRows.map((student) => (
                <div className="grade-row" key={student.id}>
                  <div className="grade-row-head">
                    <span className="grade-student">
                      {isParent ? student.name : t('detail.grade')}
                    </span>
                    <span className="grade-score">
                      {t('detail.score', {
                        marks: student.grade.marks,
                        maxMarks: student.grade.maxMarks,
                      })}
                    </span>
                  </div>
                  {student.grade.remarks ? (
                    <p className="grade-remarks">{student.grade.remarks}</p>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {classroomUrl ? (
          <section className="detail-section">
            <h2>
              <HiOutlineLink size={18} />
              {t('detail.classroomTitle')}
            </h2>
            <p className="muted">{t('detail.classroomHint')}</p>
            <a
              className="btn btn-primary"
              href={classroomUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('detail.openClassroom')}
              <HiOutlineExternalLink size={16} aria-hidden="true" />
            </a>
          </section>
        ) : null}

        {resources.length > 0 ? (
          <section className="detail-section">
            <h2>
              <HiOutlineLink size={18} />
              {t('detail.resources')}
            </h2>
            <ul className="assignment-link-list">
              {resources.map((resource) => (
                <li key={resource.key}>
                  {resource.url ? (
                    <a href={resource.url} target="_blank" rel="noopener noreferrer">
                      {resource.title}
                      <HiOutlineExternalLink size={16} aria-hidden="true" />
                    </a>
                  ) : (
                    <span className="assignment-link-label">{resource.title}</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {assignment?.googleForm ? (
          <section className="detail-section google-form-student-action">
            <h2>
              {isParent
                ? t('detail.formTitle')
                : t('assignments:googleForms.studentTitle')}
            </h2>
            {isParent ? (
              <ul className="assignment-child-list">
                {students.map((student) => (
                  <li key={student.id}>
                    <span className="child-name">{student.name}</span>
                    <span className="child-status">
                      {student.submission
                        ? (student.submission.status === 'late'
                            ? t('detail.formLate')
                            : t('detail.formSubmitted'))
                        : t('detail.formNotSubmitted')}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <>
                <p>{t('assignments:googleForms.studentDescription')}</p>
                <p role="status">
                  {submission
                    ? (submission.status === 'late'
                        ? t('detail.formLate')
                        : t('assignments:googleForms.studentSubmitted'))
                    : t('assignments:googleForms.studentAwaitingSync')}
                </p>
                {googleFormSyncText ? (
                  <p className="muted detail-sync-status">{googleFormSyncText}</p>
                ) : null}
                {googleFormUrl ? (
                  <a
                    className="btn btn-primary"
                    href={googleFormUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t('assignments:googleForms.openQuiz')}
                    <HiOutlineExternalLink size={16} aria-hidden="true" />
                  </a>
                ) : null}
              </>
            )}
          </section>
        ) : null}

        {lessonPlans.length > 0 ? (
          <section className="detail-section">
            <h2>
              <HiOutlineBookOpen size={18} />
              {t('detail.lessonPlans')}
            </h2>
            <ul className="lesson-plan-list">
              {lessonPlans.map((lesson) => (
                <li key={lesson.id || `${lesson.title}-${lesson.date}`}>
                  <span className="lesson-title">{lesson.title || t('detail.lessonPlan')}</span>
                  <span className="lesson-date">{formatDateTime(lesson.date, locale)}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </article>
    </div>
  );
};

export default AssignmentDetailContent;
