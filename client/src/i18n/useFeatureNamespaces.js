import { useTranslation } from 'react-i18next';

export const useFeatureNamespaces = (namespaces = []) => {
    const nsList = Array.isArray(namespaces) ? namespaces : [namespaces];
    return useTranslation(nsList, { useSuspense: false });
};
