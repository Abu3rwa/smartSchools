/**
 * SkeletonCard — animated shimmer placeholder
 *
 * Variants:
 *   lines (default) — stacked text lines
 *   stat            — KPI card (label + big number)
 *   table           — header + N body rows
 *   avatar-row      — circle + two lines side by side
 *
 * Usage:
 *   <SkeletonCard />                         // 3 lines
 *   <SkeletonCard lines={5} />
 *   <SkeletonCard variant="stat" />
 *   <SkeletonCard variant="table" rows={6} />
 *   <SkeletonCard variant="avatar-row" />
 */
import './loaders.css';

const B = ({ cls, style }) => (
  <div className={`skeleton-base ${cls}`} style={style} />
);

const LinesVariant = ({ count = 3 }) => {
  const widths = ['full', 'lg', 'md', 'sm', 'lg', 'full', 'md'];
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <B key={i} cls={`skeleton-line skeleton-line--${widths[i % widths.length]}`} />
      ))}
    </>
  );
};

const StatVariant = () => (
  <div className="skeleton-stat">
    <B cls="skeleton-base skeleton-stat__label" />
    <B cls="skeleton-base skeleton-stat__value" />
  </div>
);

const TableVariant = ({ rows = 5 }) => (
  <div className="skeleton-table">
    <B cls="skeleton-table__header" />
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="skeleton-table__row">
        <B cls="skeleton-base skeleton-table__cell" />
        <B cls="skeleton-base skeleton-table__cell" style={{ flex: '0 0 20%' }} />
        <B cls="skeleton-base skeleton-table__cell" style={{ flex: '0 0 20%' }} />
        <B cls="skeleton-base skeleton-table__cell" style={{ flex: '0 0 15%' }} />
      </div>
    ))}
  </div>
);

const AvatarRowVariant = ({ rows = 1 }) =>
  Array.from({ length: rows }).map((_, i) => (
    <div key={i} className="skeleton-avatar-row">
      <B cls="skeleton-base skeleton-avatar-row__circle" />
      <div className="skeleton-avatar-row__lines">
        <B cls="skeleton-base skeleton-line skeleton-line--lg" style={{ marginBottom: 8 }} />
        <B cls="skeleton-base skeleton-line skeleton-line--md" style={{ marginBottom: 0 }} />
      </div>
    </div>
  ));

const SkeletonCard = ({ variant = 'lines', lines = 3, rows = 5, style, className = '' }) => (
  <div
    className={`skeleton-card-wrap ${className}`}
    style={{ padding: variant === 'stat' ? 0 : '1rem', ...style }}
    aria-hidden="true"
  >
    {variant === 'lines'      && <LinesVariant count={lines} />}
    {variant === 'stat'       && <StatVariant />}
    {variant === 'table'      && <TableVariant rows={rows} />}
    {variant === 'avatar-row' && <AvatarRowVariant rows={rows} />}
  </div>
);

export default SkeletonCard;
