import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { HiOutlineArrowPath, HiOutlineEllipsisHorizontal } from "react-icons/hi2";
import { clampScanSize } from "../inboxUi.js";

const TONES = ["professional", "short", "warm", "formal"];

export default function ScanToolbar({
  maxScanSize,
  scanSize,
  tone,
  lastScanAt,
  scanning,
  onScanSize,
  onTone,
  onRefresh,
  onFullRescan,
  onReanalyze,
}) {
  const { t, i18n } = useTranslation(["inboxAssistant"]);
  const [sizeDraft, setSizeDraft] = useState(String(scanSize ?? 10));
  const [knownScanSize, setKnownScanSize] = useState(scanSize);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  if (scanSize !== knownScanSize) {
    setKnownScanSize(scanSize);
    setSizeDraft(String(scanSize ?? 10));
  }

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onPointerDown = (event) => {
      if (!menuRef.current?.contains(event.target)) setMenuOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const commitSize = () => {
    const next = clampScanSize(sizeDraft, maxScanSize);
    setSizeDraft(String(next));
    if (next !== Number(scanSize)) onScanSize(next);
  };

  const lastScanText = lastScanAt
    ? t("inboxAssistant:toolbar.lastScan", {
      when: new Date(lastScanAt).toLocaleString(i18n.language, {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    })
    : t("inboxAssistant:toolbar.neverScanned");

  const pick = (action) => {
    setMenuOpen(false);
    action();
  };

  return (
    <section className="ia-toolbar" aria-label={t("inboxAssistant:toolbar.label")}>
      <label className="ia-field">
        <span>{t("inboxAssistant:toolbar.scanSize")}</span>
        <input
          type="number"
          inputMode="numeric"
          min={10}
          max={maxScanSize}
          step="1"
          value={sizeDraft}
          disabled={scanning}
          onChange={(event) => setSizeDraft(event.target.value)}
          onBlur={commitSize}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            commitSize();
            event.currentTarget.blur();
          }}
          aria-describedby="ia-scan-size-hint"
        />
        <small id="ia-scan-size-hint" className="ia-hint">
          {t("inboxAssistant:toolbar.scanSizeHint", { max: maxScanSize })}
        </small>
      </label>

      <label className="ia-field">
        <span>{t("inboxAssistant:toolbar.tone")}</span>
        <select value={tone} disabled={scanning} onChange={(event) => onTone(event.target.value)}>
          {TONES.map((key) => (
            <option key={key} value={key}>{t(`inboxAssistant:toolbar.tones.${key}`)}</option>
          ))}
        </select>
      </label>

      <div className="ia-toolbar-actions">
        <button type="button" className="btn btn-primary" onClick={onRefresh} disabled={scanning}>
          {scanning
            ? <span className="ia-btn-spinner" aria-hidden="true" />
            : <HiOutlineArrowPath size={16} aria-hidden="true" />}
          {t(scanning ? "inboxAssistant:toolbar.scanning" : "inboxAssistant:toolbar.refresh")}
        </button>

        <div className="ia-menu" ref={menuRef}>
          <button
            type="button"
            className="btn btn-secondary"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={t("inboxAssistant:toolbar.more")}
            disabled={scanning}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <HiOutlineEllipsisHorizontal size={18} aria-hidden="true" />
          </button>
          {menuOpen && (
            <div className="ia-menu-list" role="menu">
              <button type="button" role="menuitem" onClick={() => pick(onFullRescan)}>
                {t("inboxAssistant:toolbar.fullRescan")}
              </button>
              <button type="button" role="menuitem" onClick={() => pick(onReanalyze)}>
                {t("inboxAssistant:toolbar.reanalyze")}
              </button>
            </div>
          )}
        </div>

        <span className="ia-last-scan">{lastScanText}</span>
      </div>
    </section>
  );
}
