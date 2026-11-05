import { datePillParts } from "./display.js";
import { formatDeadlineDate } from "../inboxUi.js";

/** The day block every dated row starts with; the full date stays in the a11y text. */
export default function DatePill({ at, allDay = false, language }) {
  const parts = datePillParts(at, language);
  return (
    <span className="ia-date-pill">
      {parts ? (
        <>
          <b aria-hidden="true">{parts.day}</b>
          <span aria-hidden="true">{parts.month}</span>
        </>
      ) : null}
      <span className="ia-sr-only">
        {formatDeadlineDate(at, { language, dueDateOnly: allDay })}
      </span>
    </span>
  );
}
