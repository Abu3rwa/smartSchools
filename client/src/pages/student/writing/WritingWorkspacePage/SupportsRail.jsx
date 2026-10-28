import { useState } from "react";
import { useTranslation } from "react-i18next";
import { HiOutlineChevronDown, HiOutlineChevronUp } from "react-icons/hi";

function Block({ children, defaultOpen = false, title }) {
  const [open, setOpen] = useState(defaultOpen);
  if (!children) return null;
  return (
    <div className="ws-rail-block">
      <button type="button" className="ws-rail-title" onClick={() => setOpen(!open)} aria-expanded={open}>
        {title}
        {open ? <HiOutlineChevronUp size={15} aria-hidden="true" /> : <HiOutlineChevronDown size={15} aria-hidden="true" />}
      </button>
      {open && children}
    </div>
  );
}

const Chips = ({ items }) => (
  <div className="ws-chips">
    {items.map((item) => <span className="ws-chip" key={item}>{item}</span>)}
  </div>
);

const Lines = ({ items }) => (
  <ul className="ws-lines">
    {items.map((item) => <li key={item}>{item}</li>)}
  </ul>
);

/** The side rail a student leans on while writing. Feedback lives above the piece, not here. */
export default function SupportsRail({ assignment, goal }) {
  const { t } = useTranslation(["writing"]);
  const [hidden, setHidden] = useState(false);
  const supports = assignment?.supports || {};

  if (hidden) {
    return (
      <button type="button" className="btn btn-ghost btn-sm ws-rail-open" onClick={() => setHidden(false)}>
        {t("writing:student.showHelp")}
      </button>
    );
  }

  return (
    <aside className="ws-rail">
      <div className="ws-rail-head">
        <h3>{t("writing:student.supportsTitle")}</h3>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setHidden(true)}>
          {t("writing:student.hideHelp")}
        </button>
      </div>

      {goal && (
        <div className="ws-rail-block">
          <p className="ws-rail-title">{t("writing:student.yourGoal")}</p>
          <p className="ws-goal">{goal}</p>
        </div>
      )}

      {supports.wordBank?.length > 0 && (
        <Block defaultOpen title={t("writing:student.wordBank")}>
          <Chips items={supports.wordBank} />
        </Block>
      )}

      {supports.transitions?.length > 0 && (
        <Block title={t("writing:student.transitions")}>
          <Chips items={supports.transitions} />
        </Block>
      )}

      {supports.sentenceStarters?.length > 0 && (
        <Block title={t("writing:student.sentenceStarters")}>
          <Lines items={supports.sentenceStarters} />
        </Block>
      )}

      {supports.guidingQuestions?.length > 0 && (
        <Block title={t("writing:student.guidingQuestions")}>
          <Lines items={supports.guidingQuestions} />
        </Block>
      )}

      {supports.plannerPrompt && (
        <Block title={t("writing:student.planner")}>
          <p className="ws-goal">{supports.plannerPrompt}</p>
        </Block>
      )}

      {supports.modelText && (
        <Block title={t("writing:student.modelText")}>
          <p className="ws-model">{supports.modelText}</p>
        </Block>
      )}
    </aside>
  );
}
