import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../../../config/api';

const useReteachTasks = ({ classId, subjectId }) => {
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    const fetchTasks = useCallback(async () => {
        if (!classId) {
            setTasks([]);
            setError('');
            return;
        }

        setLoading(true);
        setError('');
        try {
            const response = await api.get(`/reteach-tasks/class/${classId}`, {
                params: subjectId ? { subjectId } : undefined
            });
            setTasks(Array.isArray(response.data?.data) ? response.data.data : []);
        } catch (requestError) {
            setTasks([]);
            setError(requestError.response?.data?.message || 'Failed to load reteach tasks.');
        } finally {
            setLoading(false);
        }
    }, [classId, subjectId]);

    useEffect(() => {
        fetchTasks();
    }, [fetchTasks]);

    const createTask = useCallback(async (payload) => {
        setSaving(true);
        try {
            const response = await api.post('/reteach-tasks', payload);
            const createdTask = response.data?.data;
            setTasks((prev) => createdTask ? [createdTask, ...prev] : prev);
            toast.success('Reteach task created.');
            return createdTask;
        } catch (requestError) {
            const message = requestError.response?.data?.message || 'Failed to create reteach task.';
            toast.error(message);
            throw requestError;
        } finally {
            setSaving(false);
        }
    }, []);

    const updateTaskStatus = useCallback(async (taskId, status) => {
        setSaving(true);
        try {
            const response = await api.patch(`/reteach-tasks/${taskId}`, { status });
            const updatedTask = response.data?.data;
            setTasks((prev) => prev.map((task) => (task._id === taskId ? updatedTask : task)));
            toast.success('Reteach task updated.');
            return updatedTask;
        } catch (requestError) {
            const message = requestError.response?.data?.message || 'Failed to update reteach task.';
            toast.error(message);
            throw requestError;
        } finally {
            setSaving(false);
        }
    }, []);

    return {
        tasks,
        loading,
        error,
        saving,
        refreshTasks: fetchTasks,
        createTask,
        updateTaskStatus
    };
};

export default useReteachTasks;