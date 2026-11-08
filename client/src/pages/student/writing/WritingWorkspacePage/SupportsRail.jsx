import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  HiOutlineCheck,
  HiOutlineChevronDown,
  HiOutlineChevronUp,
  HiOutlinePlus,
} from "react-icons/hi";

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

const matches = (word, query) =>
  !query || String(word || "").toLowerCase().includes(query);

function WordButton({ row, used, onInsert, canInsert, insertLabel }) {
  const [open, setOpen] = useState(false);
  const detail = row.meaning || row.example;
  return (
    <div className={`ws-word${used ? " is-used" : ""}`}>
      <button
        type="button"
        className="ws-word-insert"
        onClick={() => onInsert(row.word)}
        disabled={!canInsert}
        aria-label={insertLabel}
      >
        <span className="ws-word-text">
          {used && <HiOutlineCheck size={13} aria-hidden="true" />}
          {row.word}
        </span>
        <HiOutlinePlus size={13} aria-hidden="true" />
      </button>
      {detail && (
        <>
          <button
            type="button"
            className="ws-word-more"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
          >
            {open ? "–" : "…"}
          </button>
          {open && (
            <p className="ws-word-detail">
              {row.partOfSpeech && <em>{row.partOfSpeech}</em>}
              {row.meaning && <span>{row.meaning}</span>}
              {row.example && <span className="ws-word-example">{row.example}</span>}
            </p>
          )}
        </>
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
  const spellingWords = (wordSupport?.spelling?.words || []).filter((row) =>
    matches(row.word, needle),
  );
  const vocabularyWords = (wordSupport?.vocabulary?.words || []).filter(
    (row) => matches(row.word, needle),
  );
  const wordBank = (supports.wordBank || []).filter((word) =>
    matches(word, needle),
  );
  const filterable = Boolean(
    wordSupport?.spelling?.enabled ||
      wordSupport?.vocabulary?.enabled ||
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
                    used={used.has(String(row.word).toLowerCase())}
                    onInsert={onInsertWord}
                    canInsert={canInsert}
                    insertLabel={insertLabel(row.word)}
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
                          used={used.has(String(row.word).toLowerCase())}
                          onInsert={onInsertWord}
                          canInsert={canInsert}
                          insertLabel={insertLabel(row.word)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
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
                used={used.has(String(word).toLowerCase())}
                onInsert={onInsertWord}
                canInsert={canInsert}
                insertLabel={insertLabel(word)}
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
