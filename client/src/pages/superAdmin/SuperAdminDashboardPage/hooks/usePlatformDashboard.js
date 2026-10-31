import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../../../config/api';

const RANGES = ['30d', '90d', '12m'];
const DEFAULT_RANGE = '90d';

/**
 * Loads the whole platform dashboard from one aggregated endpoint. The range
 * switch and the refresh button are the only inputs; everything else is server data.
 * The range lives in the URL so a reload or a shared link keeps the same window.
 */
export function usePlatformDashboard() {
    const { i18n } = useTranslation(['superAdminDashboard']);
    const locale = i18n.resolvedLanguage === 'ar' ? 'ar' : 'en-US';

    const [searchParams, setSearchParams] = useSearchParams();
    const requestedRange = searchParams.get('range');
    const range = RANGES.includes(requestedRange) ? requestedRange : DEFAULT_RANGE;
    const setRange = (next) => {
        if (!RANGES.includes(next) || next === range) return;
        const params = new URLSearchParams(searchParams);
        params.set('range', next);
        setSearchParams(params, { replace: true });
    };

    const [reloadToken, setReloadToken] = useState(0);
    const [result, setResult] = useState({ key: null, summary: null, error: null });

    const requestKey = `${range}|${reloadToken}`;

    useEffect(() => {
        const controller = new AbortController();
        let cancelled = false;

        api.get('/platform/dashboard', {
            params: {
                range,
                ...(reloadToken > 0 ? { refresh: 1 } : {}),
            },
            signal: controller.signal,
        })
            .then((response) => {
                if (cancelled) return;
                setResult({
                    key: requestKey,
                    summary: response.data?.data || null,
                    error: null,
                });
            })
            .catch((requestError) => {
                if (cancelled || requestError.code === 'ERR_CANCELED') return;
                setResult({
                    key: requestKey,
                    summary: null,
                    error: requestError.response?.data?.message || requestError.message,
                });
            });

        return () => {
            cancelled = true;
            controller.abort();
        };
    }, [requestKey, range, reloadToken]);

    const loading = result.key !== requestKey;
    const summary = result.summary;
    const error = loading ? null : result.error;

    return {
        summary,
        loading,
        error,
        range,
        setRange,
        locale,
        refresh: () => setReloadToken((token) => token + 1),
        hasData: Boolean(summary),
    };
}
