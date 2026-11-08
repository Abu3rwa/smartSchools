import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { HiOutlineChevronRight, HiOutlineExternalLink } from 'react-icons/hi';
import { formatDueDate } from '../utils/studentMyAssignmentsPresentation';
import {
  deriveStudentAssignmentCard,
} from '../utils/studentAssignmentProgress';
import { formatRelativeTime } from '../../../../../utils/relativeTime';

const AssignmentAction = ({ card, label, isExternal }) => {
  if (!card.actionKey) return null;
  if (isExternal) {
    return (
      <a
        className="btn btn-primary btn-sm"
        href={card.destination}
        target="_blank"
        rel="noopener noreferrer"
      >
        {label}
        <HiOutlineExternalLink size={16} aria-hidden="true" />
      </a>
    );
  }
  return (
    <Link to={card.destination} className="btn btn-primary btn-sm">
      {label}
      <HiOutlineChevronRight size={16} aria-hidden="true" />
    </Link>
  );
};

const AssignmentCard = ({ assignment, locale = 'en-GB' }) => {
  const { t } = useTranslation(['assignments']);
  const card = deriveStudentAssignmentCard(assignment);
  const statusLabel = card.statusKey
    ? t(card.statusKey, { defaultValue: t('student.status.not_started') })
    : t('student.status.not_started');
  const actionLabel = card.actionKey ? t(card.actionKey) : '';
  const dueDate = formatDueDate(assignment?.dueDate, locale);
  const syncText = card.sync
    ? t(card.sync.key, {
        time: card.sync.time ? formatRelativeTime(card.sync.time, locale) : '',
        defaultValue: '',
      })
    : '';
  const showProgress =
    Number.isFinite(card.progressPercent) &&
    card.state !== 'not_started' &&
    card.state !== 'excused';

  return (
    <article className="assignment-card">
      <div className="card-main">
        <div className="card-top-row">
          <span className={`status-pill state-${card.state || 'unknown'}`}>{statusLabel}</span>
          <span className="card-type">
            {assignment?.assignmentType?.name || t('student.card.assignment')}
          </span>
        </div>
        <h3 className="card-title">
          {assignment?.title || t('student.card.untitled')}
        </h3>
        {assignment?.subject?.name ? (
          <p className="card-subject">
            {t('student.card.subject', { name: assignment.subject.name })}
          </p>
        ) : null}
        <p className="card-due">
          {dueDate ? t('student.card.due', { date: dueDate }) : t('due.noDueDate')}
        </p>
        {syncText ? <p className="card-sync">{syncText}</p> : null}
        {showProgress ? (
          <div
            className="card-progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={card.progressPercent}
            aria-label={t('student.card.progress', { percent: card.progressPercent })}
          >
            <span style={{ width: `${card.progressPercent}%` }} />
          </div>
        ) : null}
      </div>
      <div className="card-footer">
        {card.actionKey ? (
          <AssignmentAction
            card={card}
            label={actionLabel}
            isExternal={card.actionType === 'external'}
          />
        ) : (
          <span className="card-no-action">{statusLabel}</span>
        )}
      </div>
    </article>
  );
};

export default AssignmentCard;
