import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { fetchMessageClasses, fetchMessageParents } from '../../../../api/messagesApi';

const useMessageCompose = () => {
    const [showCompose, setShowCompose] = useState(false);
    const [composeSubject, setComposeSubject] = useState('');
    const [composeBody, setComposeBody] = useState('');
    const [composeSearch, setComposeSearch] = useState('');
    const [composeLoading, setComposeLoading] = useState(false);
    const [classOptions, setClassOptions] = useState([]);
    const [selectedClassIds, setSelectedClassIds] = useState([]);
    const [includeClassParents, setIncludeClassParents] = useState(true);
    const [includeClassStudents, setIncludeClassStudents] = useState(true);
    const [loadingClasses, setLoadingClasses] = useState(false);
    const [parentOptions, setParentOptions] = useState([]);
    const [selectedParents, setSelectedParents] = useState([]);
    const [loadingParents, setLoadingParents] = useState(false);

    useEffect(() => {
        if (!showCompose) return;
        setComposeSearch('');
        setParentOptions([]);
        setSelectedParents([]);
        setSelectedClassIds([]);
        setIncludeClassParents(true);
        setIncludeClassStudents(true);
        setComposeSubject('');
        setComposeBody('');
    }, [showCompose]);

    useEffect(() => {
        if (!showCompose) return undefined;

        let cancelled = false;
        const loadClassOptions = async () => {
            setLoadingClasses(true);
            try {
                const data = await fetchMessageClasses({ limit: 200 });
                if (!cancelled) {
                    setClassOptions(data.classes || []);
                }
            } catch (error) {
                if (!cancelled) {
                    toast.error(error.message || 'Failed to load classes');
                }
            } finally {
                if (!cancelled) {
                    setLoadingClasses(false);
                }
            }
        };

        loadClassOptions();
        return () => {
            cancelled = true;
        };
    }, [showCompose]);

    useEffect(() => {
        if (!showCompose) return undefined;

        const handle = window.setTimeout(async () => {
            setLoadingParents(true);
            try {
                const data = await fetchMessageParents({ search: composeSearch, limit: 10 });
                setParentOptions(data.parents || []);
            } catch (error) {
                toast.error(error.message || 'Failed to load parents');
            } finally {
                setLoadingParents(false);
            }
        }, 300);

        return () => window.clearTimeout(handle);
    }, [composeSearch, showCompose]);

    const handleSelectParent = (parent) => {
        setSelectedParents((prev) => {
            if (prev.some((item) => item.id === parent.id)) return prev;
            return [...prev, parent];
        });
    };

    const handleToggleClass = (classId) => {
        setSelectedClassIds((prev) => (
            prev.includes(classId)
                ? prev.filter((id) => id !== classId)
                : [...prev, classId]
        ));
    };

    const handleRemoveParent = (parentId) => {
        setSelectedParents((prev) => prev.filter((item) => item.id !== parentId));
    };

    return {
        showCompose,
        setShowCompose,
        composeSubject,
        setComposeSubject,
        composeBody,
        setComposeBody,
        composeSearch,
        setComposeSearch,
        composeLoading,
        setComposeLoading,
        classOptions,
        selectedClassIds,
        includeClassParents,
        setIncludeClassParents,
        includeClassStudents,
        setIncludeClassStudents,
        loadingClasses,
        parentOptions,
        selectedParents,
        loadingParents,
        handleSelectParent,
        handleToggleClass,
        handleRemoveParent
    };
};

export default useMessageCompose;