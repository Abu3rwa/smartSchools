export default function PlpPagination({ pagination, onPageChange }) {
    if (!pagination || pagination.pages < 2) return null;

    return (
        <nav aria-label="PLP record pages" className="plp-action-row" style={{ justifyContent: 'space-between', marginTop: 12 }}>
            <span className="plp-evidence-meta">
                Page {pagination.page} of {pagination.pages} · {pagination.total} records
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
                <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => onPageChange(pagination.page - 1)}
                    disabled={pagination.page <= 1}
                >
                    Previous
                </button>
                <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => onPageChange(pagination.page + 1)}
                    disabled={pagination.page >= pagination.pages}
                >
                    Next
                </button>
            </div>
        </nav>
    );
}
