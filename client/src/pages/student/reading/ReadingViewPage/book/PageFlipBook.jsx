import { useEffect, useMemo, useRef, useState } from 'react';
import { HiOutlineChevronLeft, HiOutlineChevronRight } from 'react-icons/hi';
import { arrowAction, swipeDirection } from './bookDirection.js';
import { layoutCssVars } from './bookLayout.js';
import { spreadStart, visiblePageIndexes } from './bookSpread.js';

const SWIPE_BLOCKED = 'input, textarea, select, button, a, [contenteditable], .vocab-word';

const isTypingTarget = (target) => {
  const tag = String(target?.tagName || '').toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || Boolean(target?.isContentEditable);
};

const blocksSwipe = (target) => (
  isTypingTarget(target) || Boolean(target?.closest?.(SWIPE_BLOCKED))
);

/**
 * A paper book driven by CSS 3D transforms. Only the visible spread is mounted, so a
 * long chapter costs the same as a short one.
 */
const PageFlipBook = ({
  pages = [],
  pageIndex = 0,
  onPageChange,
  onVisiblePagesChange,
  renderPage,
  direction = 'ltr',
  pageLabel,
  previousLabel,
  nextLabel,
  announceLabel,
  ariaLabel,
  pageHeight,
  layout,
}) => {
  const wide = Boolean(layout?.wide);
  const step = wide ? 2 : 1;
  const start = spreadStart(pageIndex, wide);
  const visibleIndexes = useMemo(
    () => visiblePageIndexes(pageIndex, wide, pages.length),
    [pageIndex, wide, pages.length]
  );
  const visible = visibleIndexes.map((index) => pages[index]);
  const atStart = start <= 0;
  const atEnd = start + step >= pages.length;
  const [flip, setFlip] = useState(null);
  const firstPage = useRef(null);
  const pointerStart = useRef(null);
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    firstPage.current?.focus({ preventScroll: true });
  }, [start]);

  useEffect(() => {
    if (!flip) return undefined;
    const timer = setTimeout(() => setFlip(null), 520);
    return () => clearTimeout(timer);
  }, [flip]);

  useEffect(() => {
    onVisiblePagesChange?.(visibleIndexes);
  }, [visibleIndexes, onVisiblePagesChange]);

  const go = (target) => {
    const nextIndex = Math.max(0, Math.min(pages.length - 1, target));
    if (nextIndex === start) return;
    setFlip({ from: start, direction: nextIndex > start ? 'next' : 'prev' });
    onPageChange?.(nextIndex);
  };

  const previous = () => { if (!atStart) go(start - step); };
  const next = () => { if (!atEnd) go(start + step); };

  const handleKeyDown = (event) => {
    if (isTypingTarget(event.target)) return;
    const action = arrowAction(event.key, direction);
    if (action === 'next') {
      event.preventDefault();
      next();
    } else if (action === 'prev') {
      event.preventDefault();
      previous();
    }
  };

  const handlePointerDown = (event) => {
    if (blocksSwipe(event.target)) return;
    pointerStart.current = { x: event.clientX, y: event.clientY, pointerType: event.pointerType };
  };

  const handlePointerUp = (event) => {
    const origin = pointerStart.current;
    pointerStart.current = null;
    if (!origin) return;
    if (window.getSelection?.()?.toString()) return;
    const action = swipeDirection({
      dx: event.clientX - origin.x,
      dy: event.clientY - origin.y,
      direction,
      pointerType: origin.pointerType || event.pointerType,
    });
    if (action === 'next') next();
    else if (action === 'prev') previous();
  };

  const handlePointerCancel = () => {
    pointerStart.current = null;
  };

  if (!pages.length) return null;

  const lastVisible = Math.min(start + visible.filter(Boolean).length, pages.length);
  const indicator = pageLabel
    ? pageLabel({ from: start + 1, to: lastVisible, total: pages.length })
    : `${start + 1} / ${pages.length}`;

  const slot = (page, index) => (page ? (
    <div
      key={page.id || index}
      className="book-page"
      tabIndex={-1}
      ref={index === 0 ? firstPage : undefined}
      role="group"
      aria-label={ariaLabel ? ariaLabel(page, start + index + 1, pages.length) : undefined}
      data-page-kind={page.kind}
    >
      <div className="book-page-inner">{renderPage(page)}</div>
    </div>
  ) : (
    <div key={`blank-${index}`} className="book-page is-blank" aria-hidden="true" />
  ));

  return (
    <div
      className={`book-flip ${wide ? 'is-spread' : 'is-single'}`}
      dir={direction}
      data-layout={layout?.size || (wide ? 'spread' : 'single')}
      style={{
        ...layoutCssVars(layout),
        ...(pageHeight ? { '--book-page-height': `${pageHeight}px` } : {}),
      }}
    >
      <button
        type="button"
        className="book-edge is-prev"
        onClick={previous}
        disabled={atStart}
        aria-label={previousLabel}
        tabIndex={atStart ? -1 : 0}
      />
      <button
        type="button"
        className="book-edge is-next"
        onClick={next}
        disabled={atEnd}
        aria-label={nextLabel}
        tabIndex={atEnd ? -1 : 0}
      />

      <div
        className="book-viewport"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        <div className="book-spread">
          {slot(visible[0], 0)}
          {wide && <div className="book-spine" aria-hidden="true" />}
          {wide && slot(visible[1], 1)}
        </div>

        {flip && (
          <div
            className={`book-flip-leaf is-${flip.direction}${direction === 'rtl' ? ' is-rtl' : ''}${wide ? '' : ' is-single'}`}
            aria-hidden="true"
            inert={true}
          >
            <div className="book-page-inner">
              {renderPage(pages[flip.direction === 'next' && wide ? Math.min(flip.from + 1, pages.length - 1) : flip.from])}
            </div>
          </div>
        )}
      </div>

      <div className="book-controls">
        <button
          type="button"
          className="book-nav-btn"
          onClick={previous}
          disabled={atStart}
          aria-label={previousLabel}
        >
          {direction === 'rtl' ? <HiOutlineChevronRight size={18} /> : <HiOutlineChevronLeft size={18} />}
        </button>
        <span className="book-page-indicator" dir="auto">{indicator}</span>
        <button
          type="button"
          className="book-nav-btn"
          onClick={next}
          disabled={atEnd}
          aria-label={nextLabel}
        >
          {direction === 'rtl' ? <HiOutlineChevronLeft size={18} /> : <HiOutlineChevronRight size={18} />}
        </button>
      </div>

      <p className="book-announcement" aria-live="polite" aria-atomic="true">
        {announceLabel ? announceLabel({ from: start + 1, to: lastVisible, total: pages.length }) : ''}
      </p>
    </div>
  );
};

export default PageFlipBook;
