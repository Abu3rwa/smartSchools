const WAVE_WIDTH = 1600;
const WAVE_HEIGHT = 400;
const WAVE_PERIOD = 800;

// The canvas is two container-widths wide and the layer drifts by half its
// width, so the crests must repeat every 800 view units to loop seamlessly.
const wavePath = (baseY, amp) => {
  let d = `M ${-WAVE_PERIOD} ${baseY}`;
  for (let x = -WAVE_PERIOD; x < WAVE_WIDTH + WAVE_PERIOD; x += WAVE_PERIOD) {
    d += ` C ${x + 120} ${baseY - amp}, ${x + 280} ${baseY - amp}, ${x + 400} ${baseY}`;
    d += ` C ${x + 520} ${baseY + amp}, ${x + 680} ${baseY + amp}, ${x + 800} ${baseY}`;
  }
  return `${d} L ${WAVE_WIDTH + WAVE_PERIOD} ${WAVE_HEIGHT} L ${-WAVE_PERIOD} ${WAVE_HEIGHT} Z`;
};

const WAVES = [
  ["far", wavePath(112, 20)],
  ["mid", wavePath(124, 26)],
  ["near", wavePath(136, 32)],
  ["deep", wavePath(150, 38)],
  ["front", wavePath(152, 44)]
];

const Wave = ({ variant, d }) => (
  <span className={`sp-ocean__wave sp-ocean__wave--${variant}`}>
    <svg viewBox={`0 0 ${WAVE_WIDTH} ${WAVE_HEIGHT}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path d={d} />
    </svg>
  </span>
);

const OceanBackdrop = () => (
  <div className="sp-ocean" aria-hidden="true">
    <span className="sp-ocean__sky" />
    <span className="sp-ocean__sun" />
    <span className="sp-ocean__reflection" />
    {WAVES.map(([variant, d]) => <Wave key={variant} variant={variant} d={d} />)}
    <span className="sp-ocean__caustics" />
    <span className="sp-ocean__spark" />
    <span className="sp-ocean__spark" />
    <span className="sp-ocean__spark" />
    <span className="sp-ocean__spark" />
    <span className="sp-ocean__spark" />
    <span className="sp-ocean__spark" />
    <span className="sp-ocean__spark" />
    <span className="sp-ocean__spark" />
    <span className="sp-ocean__vignette" />
    <span className="sp-ocean__grain" />
  </div>
);

export default OceanBackdrop;
