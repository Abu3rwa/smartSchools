import { useCallback, useEffect, useRef, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  selectCurrentAcademicYear,
  selectAvailableYears,
  selectAvailableYearsLoading,
  fetchAvailableYears,
} from '../../../../store/slices/uiSlice';
import useStudentMyAssignmentsPaginated from './hooks/useStudentMyAssignmentsPaginated';
import AssignmentsPageHeader from './components/AssignmentsPageHeader';
import AssignmentsEmptyState from './components/AssignmentsEmptyState';
import AssignmentsToolbar from './components/AssignmentsToolbar';
import AssignmentCard from './components/AssignmentCard';
import './StudentMyAssignmentsPage.css';

const PAGE_SIZE = 10;
const SCROLL_KEY = 'student-my-assignments-scroll';

const parsePage = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
};

const StudentMyAssignmentsPage = () => {
  const { t, i18n } = useTranslation(['assignments']);
  const dispatch = useDispatch();
  const locale = i18n.language?.startsWith('ar') ? 'ar-EG' : 'en-GB';
  const currentAcademicYear = useSelector(selectCurrentAcademicYear);
  const availableYears = useSelector(selectAvailableYears) || [];
  const availableYearsLoading = useSelector(selectAvailableYearsLoading);

  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get('q') || '';
  const type = searchParams.get('type') || '';
  const state = searchParams.get('state') || '';
  const subject = searchParams.get('subject') || '';
  const semester = searchParams.get('semester') || '';
  const sort = searchParams.get('sort') || 'assignedDate';
  const year = searchParams.get('year') || currentAcademicYear || '';
  const page = parsePage(searchParams.get('page'));

  const [searchInput, setSearchInput] = useState(q);
  const restoreRef = useRef(false);

  const updateParams = useCallback(
    (patch) => {
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          Object.entries(patch).forEach(([key, value]) => {
            if (value === undefined || value === null || value === '') {
              next.delete(key);
            } else {
              next.set(key, String(value));
            }
          });
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  useEffect(() => {
    dispatch(fetchAvailableYears());
  }, [dispatch]);

  useEffect(() => {
    setSearchInput(q);
  }, [q]);

  useEffect(() => {
    if (searchInput === q) return undefined;
    const timer = setTimeout(() => {
      updateParams({ q: searchInput, page: 1 });
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput, q, updateParams]);

  const { items, pagination, sourceErrors, facets, loading, error, reload } =
    useStudentMyAssignmentsPaginated({
      academicYear: year,
      semester,
      q,
      type,
      state,
      subject,
      sort,
      page,
      limit: PAGE_SIZE,
    });

  useEffect(() => {
    const saveScroll = () => {
      try {
        sessionStorage.setItem(SCROLL_KEY, String(window.scrollY));
      } catch {
        // storage can be unavailable in private browsing
      }
    };
    window.addEventListener('scroll', saveScroll, { passive: true });
    return () => {
      saveScroll();
      window.removeEventListener('scroll', saveScroll);
    };
  }, []);

  useEffect(() => {
    if (restoreRef.current || loading || items.length === 0) return;
    restoreRef.current = true;
    try {
      const saved = sessionStorage.getItem(SCROLL_KEY);
      if (saved) {
        window.requestAnimationFrame(() => window.scrollTo({ top: Number(saved) }));
      }
    } catch {
      // storage can be unavailable in private browsing
    }
  }, [loading, items.length]);

  const handleParamChange = (key, value) => {
    updateParams({ [key]: value, page: 1 });
  };

  const goToPage = (nextPage) => {
    updateParams({ page: nextPage });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const hasFilters = Boolean(
    q || type || state || subject || semester || sort !== 'assignedDate',
  );
  const total = pagination?.total || 0;
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);
  const showPagination = total > PAGE_SIZE;

  const renderBody = () => {
    if (loading && items.length === 0) {
      return (
        <div className="assignments-list" aria-busy="true">
          {[0, 1, 2].map((index) => (
            <div className="assignment-skeleton" key={index} />
          ))}
        </div>
      );
    }

    if (error && items.length === 0) {
      return (
        <div className="assignments-empty" role="alert">
          <h3>{t('student.error.title')}</h3>
          <p>{t('student.error.body')}</p>
          <button type="button" className="btn btn-primary btn-sm" onClick={reload}>
            {t('student.error.retry')}
          </button>
        </div>
      );
    }

    if (items.length === 0) {
      return <AssignmentsEmptyState filtered={hasFilters} />;
    }

    return (
      <>
        <div className="assignments-list" aria-busy={loading ? 'true' : 'false'}>
          {items.map((assignment) => {
            const id = assignment?.id || assignment?._id;
            return (
              <AssignmentCard
                key={id}
                assignment={assignment}
                locale={locale}
              />
            );
          })}
        </div>
        {showPagination ? (
          <nav className="assignments-pagination" aria-label={t('student.pagination.label')}>
            <span aria-live="polite">
              {t('student.pagination.showing', { from, to, total })}
            </span>
            <div className="assignments-pagination-controls">
              <button
                type="button"
                aria-label={t('student.pagination.previous')}
                disabled={page === 1 || loading}
                onClick={() => goToPage(page - 1)}
              >
                {t('student.pagination.previous')}
              </button>
              <span>
                {t('student.pagination.pageOf', {
                  page,
                  totalPages: Math.max(pagination.totalPages || 1, 1),
                })}
              </span>
              <button
                type="button"
                aria-label={t('student.pagination.next')}
                disabled={!pagination?.hasMore || loading}
                onClick={() => goToPage(page + 1)}
              >
                {t('student.pagination.next')}
              </button>
            </div>
          </nav>
        ) : null}
      </>
    );
  };

  return (
    <div className="student-my-assignments-page">
      <AssignmentsPageHeader academicYear={year} />

      <AssignmentsToolbar
        searchInput={searchInput}
        onSearchChange={setSearchInput}
        type={type}
        state={state}
        subject={subject}
        subjects={facets.subjects}
        semester={semester}
        sort={sort}
        availableYears={availableYears}
        year={year}
        yearsLoading={availableYearsLoading}
        onChange={handleParamChange}
      />

      {sourceErrors.length > 0 ? (
        <div className="assignments-source-warning" role="status">
          <span>{t('student.sourceErrors.partial')}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={reload}>
            {t('student.error.retry')}
          </button>
        </div>
      ) : null}

      {renderBody()}
    </div>
  );
};

export default StudentMyAssignmentsPage;
