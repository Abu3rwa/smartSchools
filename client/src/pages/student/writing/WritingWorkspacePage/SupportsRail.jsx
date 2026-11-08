import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  HiOutlineCheck,
  HiOutlineChevronDown,
  HiOutlineChevronUp,
  HiOutlinePlus,
} from "react-icons/hi";
import { wordIsUsed, wordMatches } from "./railLogic.js";

function Block({ children, defaultOpen = false, forceOpen = false, title }) {
  const [open, setOpen] = useState(defaultOpen);
  const shown = open || forceOpen;
  if (!children) return null;
  return (
    <div className="ws-rail-block">
      <button
        type="button"
        className="ws-rail-title"
        onClick={() => setOpen(!open)}
        aria-expanded={shown}
      >
        {title}
        {shown ? (
          <HiOutlineChevronUp size={15} aria-hidden="true" />
        ) : (
          <HiOutlineChevronDown size={15} aria-hidden="true" />
        )}
      </button>
      {shown && children}
    </div>
  );
}

const Chips = ({ items }) => (
  <div className="ws-chips">
    {items.map((item) => (
      <span className="ws-chip" key={item}>
        {item}
      </span>
    ))}
  </div>
);

const Lines = ({ items }) => (
  <ul className="ws-lines">
    {items.map((item) => (
      <li key={item}>{item}</li>
    ))}
  </ul>
);

const matches = (row, query) => wordMatches(row, query);

function WordButton({
  row,
  used,
  onInsert,
  canInsert,
  insertLabel,
  meaningLabel,
}) {
  const [open, setOpen] = useState(false);
  const detailId = useId();
  const hasDetail = Boolean(row.meaning || row.arabicMeaning || row.example);
  const label = (
    <span className="ws-word-text">
      {used && <HiOutlineCheck size={13} aria-hidden="true" />}
      {row.word}
    </span>
  );
  return (
    <div className={`ws-word${used ? " is-used" : ""}`}>
      {hasDetail ? (
        <button
          type="button"
          className="ws-word-open"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls={open ? detailId : undefined}
          aria-label={meaningLabel}
        >
          {label}
          {open ? (
            <HiOutlineChevronUp size={13} aria-hidden="true" />
          ) : (
            <HiOutlineChevronDown size={13} aria-hidden="true" />
          )}
        </button>
      ) : (
        <span className="ws-word-open ws-word-open--static">{label}</span>
      )}
      <button
        type="button"
        className="ws-word-insert"
        onClick={() => onInsert(row.word)}
        disabled={!canInsert}
        aria-label={insertLabel}
      >
        <HiOutlinePlus size={14} aria-hidden="true" />
      </button>
      {open && (
        <p className="ws-word-detail" id={detailId}>
          {row.partOfSpeech && <em>{row.partOfSpeech}</em>}
          {row.meaning && <span>{row.meaning}</span>}
          {row.arabicMeaning && (
            <span className="ws-word-arabic" dir="rtl" lang="ar">
              {row.arabicMeaning}
            </span>
          )}
          {row.example && <span className="ws-word-example">{row.example}</span>}
        </p>
      )}
    </div>
  );
}

/** The side rail a student leans on while writing. Feedback lives above the piece, not here. */
export default function SupportsRail({
  assignment,
  goal,
  usedWords,
  onInsertWord,
  canInsert = false,
}) {
  const { t } = useTranslation(["writing"]);
  const [hidden, setHidden] = useState(false);
  const [query, setQuery] = useState("");
  const supports = assignment?.supports || {};
  const wordSupport = assignment?.wordSupport || null;
  const used = usedWords || new Set();
  const needle = query.trim().toLowerCase();
  const insertLabel = (word) => t("writing:student.insertWord", { word });
  const meaningLabel = (word) => t("writing:student.wordMeaning", { word });
  // The server counts a word, its base form, and common inflections, so the
  // tick has to use the same rule.
  const isUsed = (row) => wordIsUsed(row, used);
  const spellingWords = (wordSupport?.spelling?.words || []).filter((row) =>
    matches(row, needle),
  );
  const vocabularyWords = (wordSupport?.vocabulary?.words || []).filter(
    (row) => matches(row, needle),
  );
  const wordBank = (supports.wordBank || []).filter((word) =>
    matches(word, needle),
  );
  const filterable = Boolean(
    wordSupport?.spelling?.enabled ||
      wordSupport?.vocabulary?.enabled ||
      (supports.wordBank || []).length,
  );
  const hasWords = Boolean(
    (wordSupport?.spelling?.words || []).length ||
      (wordSupport?.vocabulary?.words || []).length ||
      (supports.wordBank || []).length,
  );

  if (hidden) {
    return (
      <button
        type="button"
        className="btn btn-ghost btn-sm ws-rail-open"
        onClick={() => setHidden(false)}
      >
        {t("writing:student.showHelp")}
      </button>
    );
  }

  return (
    <aside className="ws-rail">
      <div className="ws-rail-head">
        <h3>{t("writing:student.supportsTitle")}</h3>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setHidden(true)}
        >
          {t("writing:student.hideHelp")}
        </button>
      </div>

      {goal && (
        <div className="ws-rail-block">
          <p className="ws-rail-title">{t("writing:student.yourGoal")}</p>
          <p className="ws-goal">{goal}</p>
        </div>
      )}

      {filterable && (
        <label className="ws-rail-search">
          <span>{t("writing:student.wordFilter")}</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("writing:student.wordFilterPlaceholder")}
          />
        </label>
      )}

      {!canInsert && hasWords && (
        <p className="ws-rail-hint">{t("writing:student.readOnlyWordHint")}</p>
      )}

      {wordSupport?.spelling?.enabled && (
        <Block
          title={t("writing:student.spellingWords")}
          forceOpen={Boolean(needle)}
        >
          {wordSupport.spelling.status === "available" && spellingWords.length ? (
            <>
              <div className="ws-word-list">
                {spellingWords.map((row) => (
                  <WordButton
                    key={`spelling:${row.word}`}
                    row={row}
                    used={isUsed(row)}
                    onInsert={onInsertWord}
                    canInsert={canInsert}
                    insertLabel={insertLabel(row.word)}
                    meaningLabel={meaningLabel(row.word)}
                  />
                ))}
              </div>
              <p className="ws-rail-hint">
                {t("writing:student.spellingWordsHint")}
              </p>
            </>
          ) : (
            <p className="ws-rail-hint">
              {t("writing:student.spellingWordsEmpty")}
            </p>
          )}
        </Block>
      )}

      {wordSupport?.vocabulary?.enabled && (
        <Block
          title={t("writing:student.vocabularyWords")}
          forceOpen={Boolean(needle)}
        >
          {wordSupport.vocabulary.status === "available" &&
          vocabularyWords.length ? (
            <>
              {(wordSupport.vocabulary.lists || []).map((list) => {
                const rows = vocabularyWords.filter(
                  (row) => row.listId === list.listId,
                );
                if (!rows.length) return null;
                return (
                  <div className="ws-word-group" key={list.listId}>
                    <p className="ws-word-group-title">
                      {list.title}
                      <em>{list.listId}</em>
                    </p>
                    <div className="ws-word-list">
                      {rows.map((row) => (
                        <WordButton
                          key={`vocab:${list.listId}:${row.word}`}
                          row={row}
                          used={isUsed(row)}
                          onInsert={onInsertWord}
                          canInsert={canInsert}
                          insertLabel={insertLabel(row.word)}
                          meaningLabel={meaningLabel(row.word)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
              {!needle && wordSupport.vocabulary.truncated && (
                <p className="ws-rail-hint">
                  {t("writing:student.vocabularyWordsTruncated", {
                    shown: wordSupport.vocabulary.shown,
                    total: wordSupport.vocabulary.total,
                  })}
                </p>
              )}
              <p className="ws-rail-hint">
                {t("writing:student.vocabularyWordsHint")}
              </p>
            </>
          ) : (
            <p className="ws-rail-hint">
              {t("writing:student.vocabularyWordsEmpty")}
            </p>
          )}
        </Block>
      )}

      {wordBank.length > 0 && (
        <Block
          defaultOpen
          title={t("writing:student.wordBank")}
          forceOpen={Boolean(needle)}
        >
          <div className="ws-word-list">
            {wordBank.map((word) => (
              <WordButton
                key={`bank:${word}`}
                row={{ word }}
                used={isUsed({ word })}
                onInsert={onInsertWord}
                canInsert={canInsert}
                insertLabel={insertLabel(word)}
                meaningLabel={meaningLabel(word)}
              />
            ))}
          </div>
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
