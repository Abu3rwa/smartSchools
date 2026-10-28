import { useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * Teachers paste word banks and starter sentences as lists, so a tag field is
 * friendlier than a JSON array. Values are trimmed and deduped as they are added.
 */
export default function TagInput({ label, value = [], onChange, placeholder, max = 60 }) {
  const { t } = useTranslation(["writing"]);
  const [draft, setDraft] = useState("");

  const add = (raw) => {
    const items = String(raw || "")
      .split(/[,\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
    if (!items.length) return;
    const next = [...value];
    for (const item of items) {
      if (next.length >= max) break;
      if (!next.some((existing) => existing.toLowerCase() === item.toLowerCase())) next.push(item);
    }
    onChange(next);
    setDraft("");
  };

  const remove = (index) => onChange(value.filter((_, i) => i !== index));

  return (
    <div className="wa-field wa-tag-field">
      <span>{label}</span>
      <div className="wa-tags">
        {value.map((item, index) => (
          <span className="wa-tag" key={`${item}-${index}`}>
            {item}
            <button type="button" onClick={() => remove(index)} aria-label={t("writing:teacher.builder.removeTag", { item })}>
              ×
            </button>
          </span>
        ))}
        {value.length === 0 && <span className="wa-tag-empty">{t("writing:teacher.builder.noneYet")}</span>}
      </div>
      <input
        type="text"
        value={draft}
        placeholder={placeholder || t("writing:teacher.builder.tagPlaceholder")}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            add(draft);
          }
        }}
        onBlur={() => add(draft)}
      />
    </div>
  );
}
