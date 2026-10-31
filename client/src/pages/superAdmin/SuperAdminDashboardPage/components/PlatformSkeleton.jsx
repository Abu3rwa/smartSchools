const LINES = [3, 4, 4];

export default function PlatformSkeleton() {
    return (
        <div className="platform-grid" aria-hidden="true">
            <div className="platform-kpi-strip">
                {[0, 1, 2, 3, 4].map((index) => (
                    <div className="platform-kpi" key={index}>
                        <span className="platform-skeleton-line is-sm" />
                        <span className="platform-skeleton-line is-lg" />
                        <span className="platform-skeleton-line is-md" />
                    </div>
                ))}
            </div>

            <div className="platform-panel">
                {LINES.map((count, row) => (
                    <div className="platform-skeleton-row" key={row}>
                        <span className="platform-skeleton-line is-sm" />
                        {Array.from({ length: count }).map((_, line) => (
                            <span className="platform-skeleton-line" key={line} />
                        ))}
                    </div>
                ))}
            </div>

            <div className="platform-two-col">
                <div className="platform-panel">
                    <span className="platform-skeleton-line is-lg" />
                    <span className="platform-skeleton-line" />
                    <span className="platform-skeleton-line" />
                    <span className="platform-skeleton-line" />
                </div>
                <div className="platform-panel">
                    <span className="platform-skeleton-line is-lg" />
                    <span className="platform-skeleton-line" />
                    <span className="platform-skeleton-line" />
                </div>
            </div>

            <div className="platform-two-col">
                <div className="platform-panel">
                    <span className="platform-skeleton-line is-lg" />
                    <span className="platform-skeleton-line" />
                    <span className="platform-skeleton-line" />
                    <span className="platform-skeleton-line" />
                </div>
                <div className="platform-panel">
                    <span className="platform-skeleton-line is-lg" />
                    <span className="platform-skeleton-line" />
                    <span className="platform-skeleton-line" />
                </div>
            </div>

            <div className="platform-two-col is-ai">
                <div className="platform-panel">
                    <span className="platform-skeleton-line is-lg" />
                    <span className="platform-skeleton-line" />
                    <span className="platform-skeleton-line" />
                </div>
                <div className="platform-panel">
                    <span className="platform-skeleton-line is-lg" />
                    <span className="platform-skeleton-line" />
                    <span className="platform-skeleton-line" />
                    <span className="platform-skeleton-line" />
                </div>
            </div>
        </div>
    );
}
