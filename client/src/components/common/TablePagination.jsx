import { useTranslation } from 'react-i18next';
import './TablePagination.css';

const TablePagination = ({
    page,
    pageSize,
    totalItems,
    totalPages,
    onPageChange,
    onPageSizeChange,
    pageSizeOptions = [10, 20, 50]
}) => {
    const { t } = useTranslation(['common']);

    if (!totalItems || totalItems <= 0) {
        return null;
    }

    const safeTotalPages = Math.max(totalPages || 1, 1);
    const safePage = Math.min(Math.max(page || 1, 1), safeTotalPages);
    const safePageSize = Math.max(Number(pageSize) || 10, 1);
    const from = (safePage - 1) * safePageSize + 1;
    const to = Math.min(safePage * safePageSize, totalItems);

    return (
        <div className="table-pagination">
            <div className="table-pagination-summary">
                {t('common:pagination.summary', { from, to, total: totalItems })}
            </div>

            <div className="table-pagination-controls">
                <label htmlFor="table-pagination-size">{t('common:pagination.rowsPerPage')}</label>
                <select
                    id="table-pagination-size"
                    value={safePageSize}
                    onChange={(event) => onPageSizeChange?.(Number(event.target.value))}
                >
                    {pageSizeOptions.map((option) => (
                        <option key={option} value={option}>
                            {option}
                        </option>
                    ))}
                </select>

                <button
                    type="button"
                    className="btn btn-sm btn-outline"
                    onClick={() => onPageChange?.(safePage - 1)}
                    disabled={safePage <= 1}
                >
                    {t('common:pagination.previous')}
                </button>

                <span className="table-pagination-page">
                    {t('common:pagination.pageOf', { page: safePage, pages: safeTotalPages })}
                </span>

                <button
                    type="button"
                    className="btn btn-sm btn-outline"
                    onClick={() => onPageChange?.(safePage + 1)}
                    disabled={safePage >= safeTotalPages}
                >
                    {t('common:pagination.next')}
                </button>
            </div>
        </div>
    );
};

export default TablePagination;
