const StarGlyph = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
    <path d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4 6.2 20.5l1.1-6.5L2.6 9.4l6.5-.9L12 2.6Z" />
  </svg>
);

const Medal3D = () => (
  <span className="sp-medal" aria-hidden="true">
    <span className="sp-medal__coin">
      <span className="sp-medal__face"><StarGlyph /></span>
      <span className="sp-medal__face sp-medal__face--back"><StarGlyph /></span>
    </span>
    <span className="sp-medal__ribbon" />
  </span>
);

export default Medal3D;
