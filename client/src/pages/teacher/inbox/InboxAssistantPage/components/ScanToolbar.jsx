import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  HiOutlineArrowPath,
  HiOutlineClock,
  HiOutlineEllipsisHorizontal,
} from "react-icons/hi2";
import { clampScanSize } from "../inboxUi.js";
import { relativeScanTime, scanOptionKey } from "./display.js";

const TONES = ["professional", "short", "warm", "formal"];
const MIN_SCAN_SIZE = 10;

export default function ScanToolbar({
  maxScanSize,
  scanSize,
  tone,
  lastScanAt,
  scanning = false,
  onScanSize,
  onTone,
  onRefresh,
  onFullRescan,
  onReanalyze,
  metaOnly = false,
}) {
  const { t, i18n } = useTranslation(["inboxAssistant"]);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

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

  const lastScanText = lastScanAt
    ? t("inboxAssistant:toolbar.lastScan", {
      when: relativeScanTime(lastScanAt, {
        language: i18n.language,
        justNow: t("inboxAssistant:toolbar.justNow"),
      }),
    })
    : t("inboxAssistant:toolbar.neverScanned");

  if (metaOnly) {
    return (
      <span className="ia-scan-meta">
        <HiOutlineClock size={13} aria-hidden="true" />
        {lastScanText}
      </span>
    );
  }

  const maximum = Math.max(MIN_SCAN_SIZE, Math.round(Number(maxScanSize) || MIN_SCAN_SIZE));
  const sizes = Array.from({ length: maximum - MIN_SCAN_SIZE + 1 }, (_, index) => MIN_SCAN_SIZE + index);
  const current = clampScanSize(scanSize, maximum);
  if (!sizes.includes(current)) sizes.push(current);

  const pick = (action) => {
    setMenuOpen(false);
    action();
  };

  return (
    <div className="ia-panel-tools" role="group" aria-label={t("inboxAssistant:toolbar.label")}>
      <span className="ia-scan-meta">
        <HiOutlineClock size={13} aria-hidden="true" />
        {lastScanText}
      </span>

      <label className="ia-select-wrap">
        <span className="ia-sr-only">{t("inboxAssistant:toolbar.scanSize")}</span>
        <select
          className="ia-select"
          value={current}
          disabled={scanning}
          aria-describedby="ia-scan-size-hint"
          onChange={(event) => onScanSize(clampScanSize(event.target.value, maximum))}
        >
          {sizes.map((size) => (
            <option key={size} value={size}>
              {t(`inboxAssistant:${scanOptionKey(size)}`, { n: size })}
            </option>
          ))}
        </select>
        <span id="ia-scan-size-hint" className="ia-sr-only">
          {t("inboxAssistant:toolbar.scanSizeHint", { max: maximum })}
        </span>
      </label>

      <label className="ia-select-wrap">
        <span className="ia-sr-only">{t("inboxAssistant:toolbar.tone")}</span>
        <select
          className="ia-select"
          value={tone}
          disabled={scanning}
          aria-label={t("inboxAssistant:toolbar.tone")}
          onChange={(event) => onTone(event.target.value)}
        >
          {TONES.map((key) => (
            <option key={key} value={key}>{t(`inboxAssistant:toolbar.tones.${key}`)}</option>
          ))}
        </select>
      </label>

      <button
        type="button"
        className="btn btn-primary btn-sm"
        onClick={onRefresh}
        disabled={scanning}
      >
        {scanning
          ? <span className="ia-btn-spinner" aria-hidden="true" />
          : <HiOutlineArrowPath size={14} aria-hidden="true" />}
        {t(scanning ? "inboxAssistant:toolbar.scanning" : "inboxAssistant:toolbar.refresh")}
      </button>

      <div className="ia-menu" ref={menuRef}>
        <button
          type="button"
          className="ia-kebab"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={t("inboxAssistant:toolbar.more")}
          disabled={scanning}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <HiOutlineEllipsisHorizontal size={17} aria-hidden="true" />
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
    </div>
  );
}
