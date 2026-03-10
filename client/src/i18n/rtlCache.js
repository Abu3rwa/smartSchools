import createCache from '@emotion/cache';
import { prefixer } from 'stylis';
import rtlPlugin from 'stylis-plugin-rtl';

export const ltrCache = createCache({
    key: 'mui',
    stylisPlugins: [prefixer]
});

export const rtlCache = createCache({
    key: 'mui-rtl',
    stylisPlugins: [prefixer, rtlPlugin]
});
