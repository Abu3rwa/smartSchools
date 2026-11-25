import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../../../config/api';
import useDebouncedValue from '../../../hooks/useDebouncedValue';
import { applySavedRows, createRequestTracker, newOperationId } from './libraryDeltas.js';

const DEFAULT_PAGE_SIZE = 50;

const errorFrom = (error, fallback) => {
    const data = error?.response?.data;
    return {
        code: data?.code || 'REQUEST_FAILED',
        message: data?.message || fallback,
        details: data?.details || null
    };
};

/**
 * One school-scoped library view: server-filtered pages, preview-then-commit
 * writes and row deltas. A commit patches only the rows the server returned;
 * the list is never refetched after a save.
 */
export default function useSpellingLibrary({ initialFilters = {}, enabled = true } = {}) {
    const [filters, setFilters] = useState({
        grade: '',
        week: '',
        category: '',
        search: '',
        page: 1,
        ...initialFilters
    });
    const debouncedSearch = useDebouncedValue(filters.search, 400);
    const [rows, setRows] = useState([]);
    const [categories, setCategories] = useState([]);
    const [libraryVersions, setLibraryVersions] = useState({});
    const [capabilities, setCapabilities] = useState(null);
    const [total, setTotal] = useState(0);
    const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState(null);
    const [busy, setBusy] = useState(false);

    const trackerRef = useRef(createRequestTracker());
    const abortRef = useRef(null);
    const rowsRef = useRef(rows);
    rowsRef.current = rows;

    const load = useCallback(async () => {
        const token = trackerRef.current.begin();
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        setLoading(true);
        setLoadError(null);
        try {
            const params = { page: filters.page, pageSize: DEFAULT_PAGE_SIZE };
            if (filters.grade) params.grade = filters.grade;
            if (filters.week) params.week = filters.week;
            if (filters.category) params.category = filters.category;
            if (debouncedSearch) params.search = debouncedSearch;
            const response = await api.get('/spelling/word-lists', {
                params,
                signal: controller.signal
            });
            if (!trackerRef.current.isCurrent(token)) return;
            const data = response.data?.data || {};
            setRows(data.words || []);
            setCategories(data.categories || []);
            setLibraryVersions(data.libraryVersions || {});
            setCapabilities(data.capabilities || null);
            setTotal(Number(data.total) || (data.words || []).length);
            setPageSize(Number(data.pageSize) || DEFAULT_PAGE_SIZE);
        } catch (error) {
            if (error?.code === 'ERR_CANCELED' || controller.signal.aborted) return;
            if (!trackerRef.current.isCurrent(token)) return;
            // A failed load must never look like an empty library.
            setLoadError(errorFrom(error, 'Unable to load the spelling library.'));
        } finally {
            if (trackerRef.current.isCurrent(token)) setLoading(false);
        }
    }, [filters.grade, filters.week, filters.category, filters.page, debouncedSearch]);

    useEffect(() => {
        if (!enabled) return;
        load();
        const tracker = trackerRef.current;
        return () => {
            tracker.cancel();
            abortRef.current?.abort();
        };
    }, [enabled, load]);

    const updateFilters = useCallback((patch) => {
        setFilters((current) => ({
            ...current,
            ...patch,
            page: patch.page ?? 1
        }));
    }, []);

    const clearFilters = useCallback(() => {
        setFilters((current) => ({
            grade: '',
            week: '',
            category: '',
            search: '',
            page: 1
        }));
    }, []);

    const expectedRevisionFor = useCallback((operation) => {
        if (operation.wordId) {
            const row = rowsRef.current.find((entry) => String(entry._id) === String(operation.wordId));
            return row ? { [String(row._id)]: row.revision } : undefined;
        }
        return operation.expectedRevisions;
    }, []);

    const expectedVersionsFor = useCallback((operation) => {
        if (operation.kind === 'bulk' && operation.expectedLibraryVersions) return operation.expectedLibraryVersions;
        if (operation.grade) {
            return libraryVersions[operation.grade] ? { [operation.grade]: libraryVersions[operation.grade] } : undefined;
        }
        if (operation.wordId) {
            const row = rowsRef.current.find((entry) => String(entry._id) === String(operation.wordId));
            if (row && libraryVersions[row.grade]) return { [row.grade]: libraryVersions[row.grade] };
        }
        return undefined;
    }, [libraryVersions]);

    /** Always preview first; the impact dialog carries the returned token. */
    const prepare = useCallback(async (operation) => {
        const operationId = newOperationId();
        setBusy(true);
        try {
            const body = {
                operation,
                operationId
            };
            const expectedRevisions = expectedRevisionFor(operation);
            if (expectedRevisions) body.expectedRevisions = expectedRevisions;
            const expectedLibraryVersions = expectedVersionsFor(operation);
            if (expectedLibraryVersions) body.expectedLibraryVersions = expectedLibraryVersions;
            const response = await api.post('/spelling/word-lists/impact-preview', body);
            return {
                ok: true,
                data: { ...(response.data?.data || {}), operation, operationId, expectedRevisions }
            };
        } catch (error) {
            return { ok: false, error: errorFrom(error, 'Unable to preview this change.') };
        } finally {
            setBusy(false);
        }
    }, [expectedRevisionFor, expectedVersionsFor]);

    const sendCommit = useCallback((prepared, reason) => {
        const { operation, operationId, previewToken } = prepared;
        const envelope = {
            operationId,
            reason,
            previewToken,
            confirmImpact: true
        };
        if (operation.kind === 'add') {
            const body = {
                grade: operation.grade,
                week: operation.week,
                category: operation.category,
                word: operation.word,
                ...envelope
            };
            if (operation.definition !== undefined) body.definition = operation.definition;
            if (operation.position !== undefined) body.position = operation.position;
            if (libraryVersions[operation.grade]) body.expectedLibraryVersion = libraryVersions[operation.grade];
            return api.post('/spelling/word-lists', body);
        }
        if (operation.kind === 'patch') {
            const body = { patch: operation.patch, ...envelope };
            if (operation.changeType) body.changeType = operation.changeType;
            const expected = expectedRevisionFor(operation);
            if (expected) body.expectedRevision = expected[String(operation.wordId)];
            const row = rowsRef.current.find((entry) => String(entry._id) === String(operation.wordId));
            if (row && libraryVersions[row.grade]) body.expectedLibraryVersion = libraryVersions[row.grade];
            return api.patch(`/spelling/word-lists/${operation.wordId}`, body);
        }
        if (operation.kind === 'move') {
            const body = {
                toWeek: operation.toWeek,
                toPosition: operation.toPosition,
                ...envelope
            };
            const expected = expectedRevisionFor(operation);
            if (expected) body.expectedRevision = expected[String(operation.wordId)];
            return api.post(`/spelling/word-lists/${operation.wordId}/move`, body);
        }
        if (operation.kind === 'remove') {
            const body = { ...envelope };
            const expected = expectedRevisionFor(operation);
            if (expected) body.expectedRevision = expected[String(operation.wordId)];
            const row = rowsRef.current.find((entry) => String(entry._id) === String(operation.wordId));
            if (row && libraryVersions[row.grade]) body.expectedLibraryVersion = libraryVersions[row.grade];
            return api.delete(`/spelling/word-lists/${operation.wordId}`, { data: body });
        }
        if (operation.kind === 'reorder') {
            const body = {
                orderedWordIds: operation.orderedWordIds,
                ...envelope
            };
            const expected = operation.expectedRevisions || expectedRevisionFor(operation);
            if (expected) body.expectedRevisions = expected;
            if (libraryVersions[operation.grade]) body.expectedLibraryVersion = libraryVersions[operation.grade];
            return api.put(
                `/spelling/word-lists/grades/${operation.grade}/weeks/${operation.week}/order`,
                body
            );
        }
        if (operation.kind === 'bulk') {
            const body = {
                changes: operation.changes || [],
                adds: operation.adds || [],
                removes: operation.removes || [],
                ...envelope
            };
            const expected = operation.expectedLibraryVersions || expectedVersionsFor(operation);
            if (expected) body.expectedLibraryVersions = expected;
            return api.patch('/spelling/word-lists/bulk', body);
        }
        throw new Error(`Unsupported library operation: ${operation.kind}`);
    }, [expectedRevisionFor, expectedVersionsFor, libraryVersions]);

    const commit = useCallback(async (prepared, reason) => {
        if (!prepared?.previewToken) {
            return {
                ok: false,
                error: { code: 'IMPACT_REQUIRED', message: 'Preview this change before saving it.', details: null }
            };
        }
        setBusy(true);
        try {
            const response = await sendCommit(prepared, reason);
            const result = response.data?.data || {};
            if (result.libraryVersions) setLibraryVersions(result.libraryVersions);
            const next = applySavedRows(rowsRef.current, result);
            setRows(next);
            const known = new Set(categories);
            for (const row of next) {
                if (row.category && !known.has(row.category)) known.add(row.category);
            }
            setCategories([...known].sort((first, second) => first.localeCompare(second)));
            return { ok: true, data: result };
        } catch (error) {
            return { ok: false, error: errorFrom(error, 'Unable to save this change.') };
        } finally {
            setBusy(false);
        }
    }, [categories, sendCommit]);

    const loadHistory = useCallback(async (wordId, cursor = null) => {
        const response = await api.get(`/spelling/word-lists/${wordId}/history`, {
            params: cursor ? { cursor } : {}
        });
        return response.data?.data || { entries: [], nextCursor: null };
    }, []);

    /** The whole week, not just the visible page, for a complete reorder. */
    const loadWeek = useCallback(async (grade, week) => {
        const response = await api.get('/spelling/word-lists', {
            params: { grade, week, page: 1, pageSize: 100 }
        });
        const data = response.data?.data || {};
        return { rows: data.words || [], total: data.total ?? null };
    }, []);

    return {
        filters,
        debouncedSearch,
        updateFilters,
        clearFilters,
        rows,
        categories,
        libraryVersions,
        capabilities,
        total,
        page: filters.page,
        pageSize,
        loading,
        loadError,
        busy,
        reload: load,
        prepare,
        commit,
        loadHistory,
        loadWeek
    };
}
