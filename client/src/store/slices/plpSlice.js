import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../config/api';

// ─── Month Config ────────────────────────────────────────────────────────────
export const fetchPlpMonthConfigs = createAsyncThunk('plp/fetchMonthConfigs', async (params = {}, { rejectWithValue }) => {
    try {
        const res = await api.get('/plp/config/month', { params });
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to fetch configs'); }
});

export const createPlpMonthConfig = createAsyncThunk('plp/createMonthConfig', async (data, { rejectWithValue }) => {
    try {
        const res = await api.post('/plp/config/month', data);
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to create config'); }
});

export const updatePlpMonthConfig = createAsyncThunk('plp/updateMonthConfig', async ({ id, data }, { rejectWithValue }) => {
    try {
        const res = await api.put(`/plp/config/month/${id}`, data);
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to update config'); }
});

export const publishPlpMonthConfig = createAsyncThunk('plp/publishMonthConfig', async (id, { rejectWithValue }) => {
    try {
        const res = await api.post(`/plp/config/month/${id}/publish`);
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to publish config'); }
});

export const closePlpMonthConfig = createAsyncThunk('plp/closeMonthConfig', async (id, { rejectWithValue }) => {
    try {
        const res = await api.post(`/plp/config/month/${id}/close`);
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to close config'); }
});

// ─── Trait Config ────────────────────────────────────────────────────────────
export const fetchPlpTraits = createAsyncThunk('plp/fetchTraits', async (_, { rejectWithValue }) => {
    try {
        const res = await api.get('/plp/traits');
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to fetch traits'); }
});

export const fetchPlpTrait = createAsyncThunk('plp/fetchTrait', async (id, { rejectWithValue }) => {
    try {
        const res = await api.get(`/plp/traits/${id}`);
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to fetch trait'); }
});

export const createPlpTrait = createAsyncThunk('plp/createTrait', async (data, { rejectWithValue }) => {
    try {
        const res = await api.post('/plp/traits', data);
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to create trait'); }
});

export const updatePlpTrait = createAsyncThunk('plp/updateTrait', async ({ id, data }, { rejectWithValue }) => {
    try {
        const res = await api.put(`/plp/traits/${id}`, data);
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to update trait'); }
});

export const setPlpTraitActive = createAsyncThunk('plp/setTraitActive', async ({ id, isActive }, { rejectWithValue }) => {
    try {
        const res = await api.post(`/plp/traits/${id}/activate`, { isActive });
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to update trait'); }
});

export const seedPlpTraits = createAsyncThunk('plp/seedTraits', async (_, { rejectWithValue }) => {
    try {
        const res = await api.post('/plp/traits/seed');
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to seed traits'); }
});

// ─── SEL Competencies ────────────────────────────────────────────────────────
export const fetchSelCompetencies = createAsyncThunk('plp/fetchSelCompetencies', async (params = {}, { rejectWithValue }) => {
    try {
        const res = await api.get('/plp/sel-competencies', { params });
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to fetch SEL competencies'); }
});

export const seedSelCompetencies = createAsyncThunk('plp/seedSelCompetencies', async (academicYear, { rejectWithValue }) => {
    try {
        const res = await api.post('/plp/sel-competencies/seed', { academicYear });
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to seed SEL competencies'); }
});

// ─── Character Themes ────────────────────────────────────────────────────────
export const fetchCharacterThemes = createAsyncThunk('plp/fetchCharacterThemes', async (params = {}, { rejectWithValue }) => {
    try {
        const res = await api.get('/plp/character-themes', { params });
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to fetch character themes'); }
});

export const seedCharacterThemes = createAsyncThunk('plp/seedCharacterThemes', async (academicYear, { rejectWithValue }) => {
    try {
        const res = await api.post('/plp/character-themes/seed', { academicYear });
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to seed character themes'); }
});

// ─── PLP V2 Cycles ──────────────────────────────────────────────────────────
export const fetchPlpCycles = createAsyncThunk('plp/fetchCycles', async (params = {}, { rejectWithValue }) => {
    try {
        const res = await api.get('/plp/cycles', { params });
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to fetch cycles'); }
});

export const createPlpCycle = createAsyncThunk('plp/createCycle', async (data, { rejectWithValue }) => {
    try {
        const res = await api.post('/plp/cycles', data);
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to create cycle'); }
});

export const updatePlpCycle = createAsyncThunk('plp/updateCycle', async ({ id, data }, { rejectWithValue }) => {
    try {
        const res = await api.put(`/plp/cycles/${id}`, data);
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to update cycle'); }
});

export const publishPlpCycle = createAsyncThunk('plp/publishCycle', async (id, { rejectWithValue }) => {
    try {
        const res = await api.post(`/plp/cycles/${id}/publish`);
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to publish cycle'); }
});

export const closePlpCycle = createAsyncThunk('plp/closeCycle', async (id, { rejectWithValue }) => {
    try {
        const res = await api.post(`/plp/cycles/${id}/close`);
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to close cycle'); }
});

// ─── PLP V2 Goals ───────────────────────────────────────────────────────────
export const fetchPlpGoals = createAsyncThunk('plp/fetchGoals', async (recordId, { rejectWithValue }) => {
    try {
        const res = await api.get(`/plp/records/${recordId}/goals`);
        return { recordId, goals: res.data.data };
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to fetch goals'); }
});

export const createPlpGoal = createAsyncThunk('plp/createGoal', async ({ recordId, data }, { rejectWithValue }) => {
    try {
        const res = await api.post(`/plp/records/${recordId}/goals`, data);
        return { recordId, goal: res.data.data };
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to create goal'); }
});

export const updatePlpGoal = createAsyncThunk('plp/updateGoal', async ({ goalId, data }, { rejectWithValue }) => {
    try {
        const res = await api.put(`/plp/goals/${goalId}`, data);
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to update goal'); }
});

// ─── PLP V2 Tasks ───────────────────────────────────────────────────────────
export const fetchPlpTasks = createAsyncThunk('plp/fetchTasks', async (goalId, { rejectWithValue }) => {
    try {
        const res = await api.get(`/plp/goals/${goalId}/tasks`);
        return { goalId, tasks: res.data.data };
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to fetch tasks'); }
});

export const createPlpTask = createAsyncThunk('plp/createTask', async ({ goalId, data }, { rejectWithValue }) => {
    try {
        const res = await api.post(`/plp/goals/${goalId}/tasks`, data);
        return { goalId, task: res.data.data };
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to create task'); }
});

export const updatePlpTask = createAsyncThunk('plp/updateTask', async ({ taskId, data }, { rejectWithValue }) => {
    try {
        const res = await api.put(`/plp/tasks/${taskId}`, data);
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to update task'); }
});

export const fetchMyPlpStudentTasks = createAsyncThunk('plp/fetchMyStudentTasks', async (_, { rejectWithValue }) => {
    try {
        const res = await api.get('/plp/students/me/tasks');
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to fetch my tasks'); }
});

export const submitMyPlpTask = createAsyncThunk('plp/submitMyTask', async ({ taskId, data }, { rejectWithValue }) => {
    try {
        const res = await api.post(`/plp/tasks/${taskId}/student-submit`, data);
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to submit task'); }
});

export const reviewPlpTask = createAsyncThunk('plp/reviewTask', async ({ taskId, data }, { rejectWithValue }) => {
    try {
        const res = await api.post(`/plp/tasks/${taskId}/teacher-review`, data);
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to review task'); }
});

// ─── Records ─────────────────────────────────────────────────────────────────
export const fetchPlpRecords = createAsyncThunk('plp/fetchRecords', async (params = {}, { rejectWithValue }) => {
    try {
        const res = await api.get('/plp/records', { params });
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to fetch records'); }
});

export const fetchPlpRecord = createAsyncThunk('plp/fetchRecord', async (id, { rejectWithValue }) => {
    try {
        const res = await api.get(`/plp/records/${id}`);
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to fetch record'); }
});

export const createPlpRecord = createAsyncThunk('plp/createRecord', async (data, { rejectWithValue }) => {
    try {
        const res = await api.post('/plp/records', data);
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to create record'); }
});

export const updatePlpRecord = createAsyncThunk('plp/updateRecord', async ({ id, data }, { rejectWithValue }) => {
    try {
        const res = await api.put(`/plp/records/${id}`, data);
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to update record'); }
});

export const submitPlpRecord = createAsyncThunk('plp/submitRecord', async (id, { rejectWithValue }) => {
    try {
        const res = await api.post(`/plp/records/${id}/submit`);
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to submit record'); }
});

// ─── Evidence ────────────────────────────────────────────────────────────────
export const fetchPlpEvidence = createAsyncThunk('plp/fetchEvidence', async (recordId, { rejectWithValue }) => {
    try {
        const res = await api.get(`/plp/records/${recordId}/evidence`);
        return { recordId, evidence: res.data.data };
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to fetch evidence'); }
});

export const createPlpEvidence = createAsyncThunk('plp/createEvidence', async ({ recordId, data }, { rejectWithValue }) => {
    try {
        const res = await api.post(`/plp/records/${recordId}/evidence`, data);
        return { recordId, evidence: res.data.data };
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to add evidence'); }
});

export const deletePlpEvidence = createAsyncThunk('plp/deleteEvidence', async (id, { rejectWithValue }) => {
    try {
        await api.delete(`/plp/evidence/${id}`);
        return id;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to delete evidence'); }
});

// ─── Awards ──────────────────────────────────────────────────────────────────
export const fetchPlpAwardCandidates = createAsyncThunk('plp/fetchAwardCandidates', async (params, { rejectWithValue }) => {
    try {
        const res = await api.get('/plp/awards/candidates', { params });
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to fetch candidates'); }
});

export const setPlpAwardDecision = createAsyncThunk('plp/setAwardDecision', async (data, { rejectWithValue }) => {
    try {
        const res = await api.post('/plp/awards/decision', data);
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to set decision'); }
});

// ─── Supervisor assignments ───────────────────────────────────────────────────
export const fetchPlpSupervisorAssignments = createAsyncThunk('plp/fetchSupervisorAssignments', async (_, { rejectWithValue }) => {
    try {
        const res = await api.get('/plp/supervisor-assignments');
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to fetch assignments'); }
});

export const createPlpSupervisorAssignment = createAsyncThunk('plp/createSupervisorAssignment', async (data, { rejectWithValue }) => {
    try {
        const res = await api.post('/plp/supervisor-assignments', data);
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to create assignment'); }
});

export const deletePlpSupervisorAssignment = createAsyncThunk('plp/deleteSupervisorAssignment', async (id, { rejectWithValue }) => {
    try {
        await api.delete(`/plp/supervisor-assignments/${id}`);
        return id;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to delete assignment'); }
});

// ─── Supervisor teachers ──────────────────────────────────────────────────────
export const fetchSupervisorTeachers = createAsyncThunk('plp/fetchSupervisorTeachers', async (_, { rejectWithValue }) => {
    try {
        const res = await api.get('/plp/supervisor/teachers');
        return res.data.data;
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to fetch teachers'); }
});

// ─── Interactions / Supervisor notes ────────────────────────────────────────
export const fetchPlpRecordInteractions = createAsyncThunk('plp/fetchRecordInteractions', async (recordId, { rejectWithValue }) => {
    try {
        const res = await api.get(`/plp/records/${recordId}/interactions`);
        return { recordId, interactions: res.data.data };
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to fetch interactions'); }
});

export const addSupervisorNote = createAsyncThunk('plp/addSupervisorNote', async ({ recordId, note }, { rejectWithValue }) => {
    try {
        const res = await api.post(`/plp/records/${recordId}/supervisor-note`, { note });
        return { recordId, interaction: res.data.data };
    } catch (e) { return rejectWithValue(e.response?.data?.message || 'Failed to add supervisor note'); }
});

// ─── Slice ────────────────────────────────────────────────────────────────────
const plpSlice = createSlice({
    name: 'plp',
    initialState: {
        configs: [],
        records: [],
        selectedRecord: null,
        evidence: {},
        awardCandidates: [],
        supervisorAssignments: [],
        supervisorTeachers: [],
        cycles: [],
        goalsByRecord: {},
        tasksByGoal: {},
        myStudentTasks: [],
        selCompetencies: [],
        characterThemes: [],
        interactions: {},
        traits: [],
        traitLoading: false,
        traitError: null,
        loading: false,
        error: null,
    },
    reducers: {
        clearPlpError: (state) => { state.error = null; },
        clearPlpTraitError: (state) => { state.traitError = null; },
        clearSelectedRecord: (state) => { state.selectedRecord = null; },
    },
    extraReducers: (builder) => {
        const pending = (state) => { state.loading = true; state.error = null; };
        const failed = (state, action) => { state.loading = false; state.error = action.payload; };
        const traitPending = (state) => { state.traitLoading = true; state.traitError = null; };
        const traitFailed = (state, action) => { state.traitLoading = false; state.traitError = action.payload; };

        builder
            .addCase(fetchPlpMonthConfigs.pending, pending)
            .addCase(fetchPlpMonthConfigs.fulfilled, (state, action) => { state.loading = false; state.configs = action.payload; })
            .addCase(fetchPlpMonthConfigs.rejected, failed)

            .addCase(createPlpMonthConfig.fulfilled, (state, action) => { state.configs.unshift(action.payload); })
            .addCase(updatePlpMonthConfig.fulfilled, (state, action) => {
                const idx = state.configs.findIndex((c) => c._id === action.payload._id);
                if (idx !== -1) state.configs[idx] = action.payload;
            })
            .addCase(publishPlpMonthConfig.fulfilled, (state, action) => {
                const idx = state.configs.findIndex((c) => c._id === action.payload._id);
                if (idx !== -1) state.configs[idx] = action.payload;
            })
            .addCase(closePlpMonthConfig.fulfilled, (state, action) => {
                const idx = state.configs.findIndex((c) => c._id === action.payload._id);
                if (idx !== -1) state.configs[idx] = action.payload;
            })

            .addCase(fetchPlpRecords.pending, pending)
            .addCase(fetchPlpRecords.fulfilled, (state, action) => { state.loading = false; state.records = action.payload; })
            .addCase(fetchPlpRecords.rejected, failed)

            .addCase(fetchPlpRecord.fulfilled, (state, action) => { state.selectedRecord = action.payload; })

            .addCase(createPlpRecord.fulfilled, (state, action) => { state.records.unshift(action.payload); })
            .addCase(updatePlpRecord.fulfilled, (state, action) => {
                const idx = state.records.findIndex((r) => r._id === action.payload._id);
                if (idx !== -1) state.records[idx] = action.payload;
                if (state.selectedRecord?._id === action.payload._id) state.selectedRecord = action.payload;
            })
            .addCase(submitPlpRecord.fulfilled, (state, action) => {
                const idx = state.records.findIndex((r) => r._id === action.payload._id);
                if (idx !== -1) state.records[idx] = action.payload;
                if (state.selectedRecord?._id === action.payload._id) state.selectedRecord = action.payload;
            })

            .addCase(fetchPlpEvidence.fulfilled, (state, action) => {
                state.evidence[action.payload.recordId] = action.payload.evidence;
            })
            .addCase(createPlpEvidence.fulfilled, (state, action) => {
                const { recordId, evidence } = action.payload;
                if (!state.evidence[recordId]) state.evidence[recordId] = [];
                state.evidence[recordId].unshift(evidence);
            })
            .addCase(deletePlpEvidence.fulfilled, (state, action) => {
                Object.keys(state.evidence).forEach((recordId) => {
                    state.evidence[recordId] = state.evidence[recordId].filter((e) => e._id !== action.payload);
                });
            })

            .addCase(fetchPlpAwardCandidates.fulfilled, (state, action) => { state.awardCandidates = action.payload; })
            .addCase(setPlpAwardDecision.fulfilled, (state, action) => {
                const idx = state.awardCandidates.findIndex((r) => r._id === action.payload._id);
                if (idx !== -1) state.awardCandidates[idx] = action.payload;
            })

            .addCase(fetchPlpSupervisorAssignments.fulfilled, (state, action) => { state.supervisorAssignments = action.payload; })
            .addCase(createPlpSupervisorAssignment.fulfilled, (state, action) => { state.supervisorAssignments.unshift(action.payload); })
            .addCase(deletePlpSupervisorAssignment.fulfilled, (state, action) => {
                state.supervisorAssignments = state.supervisorAssignments.filter((a) => a._id !== action.payload);
            })

            .addCase(fetchSupervisorTeachers.fulfilled, (state, action) => { state.supervisorTeachers = action.payload; })

            .addCase(fetchPlpCycles.fulfilled, (state, action) => { state.cycles = action.payload; })
            .addCase(createPlpCycle.fulfilled, (state, action) => { state.cycles.unshift(action.payload); })
            .addCase(updatePlpCycle.fulfilled, (state, action) => {
                const idx = state.cycles.findIndex((c) => c._id === action.payload._id);
                if (idx !== -1) state.cycles[idx] = action.payload;
            })
            .addCase(publishPlpCycle.fulfilled, (state, action) => {
                const idx = state.cycles.findIndex((c) => c._id === action.payload._id);
                if (idx !== -1) state.cycles[idx] = action.payload;
            })
            .addCase(closePlpCycle.fulfilled, (state, action) => {
                const idx = state.cycles.findIndex((c) => c._id === action.payload._id);
                if (idx !== -1) state.cycles[idx] = action.payload;
            })

            .addCase(fetchPlpGoals.fulfilled, (state, action) => {
                state.goalsByRecord[action.payload.recordId] = action.payload.goals;
            })
            .addCase(createPlpGoal.fulfilled, (state, action) => {
                const { recordId, goal } = action.payload;
                if (!state.goalsByRecord[recordId]) state.goalsByRecord[recordId] = [];
                state.goalsByRecord[recordId].unshift(goal);
            })
            .addCase(updatePlpGoal.fulfilled, (state, action) => {
                const nextGoal = action.payload;
                Object.keys(state.goalsByRecord).forEach((recordId) => {
                    state.goalsByRecord[recordId] = state.goalsByRecord[recordId].map((goal) => (
                        goal._id === nextGoal._id ? nextGoal : goal
                    ));
                });
            })

            .addCase(fetchPlpTasks.fulfilled, (state, action) => {
                state.tasksByGoal[action.payload.goalId] = action.payload.tasks;
            })
            .addCase(createPlpTask.fulfilled, (state, action) => {
                const { goalId, task } = action.payload;
                if (!state.tasksByGoal[goalId]) state.tasksByGoal[goalId] = [];
                state.tasksByGoal[goalId].unshift(task);
            })
            .addCase(updatePlpTask.fulfilled, (state, action) => {
                const nextTask = action.payload;
                Object.keys(state.tasksByGoal).forEach((goalId) => {
                    state.tasksByGoal[goalId] = state.tasksByGoal[goalId].map((task) => (
                        task._id === nextTask._id ? nextTask : task
                    ));
                });
            })
            .addCase(fetchMyPlpStudentTasks.fulfilled, (state, action) => {
                state.myStudentTasks = action.payload;
            })
            .addCase(submitMyPlpTask.fulfilled, (state, action) => {
                const nextTask = action.payload;
                state.myStudentTasks = state.myStudentTasks.map((task) => (
                    task._id === nextTask._id ? nextTask : task
                ));
                Object.keys(state.tasksByGoal).forEach((goalId) => {
                    state.tasksByGoal[goalId] = state.tasksByGoal[goalId].map((task) => (
                        task._id === nextTask._id ? nextTask : task
                    ));
                });
            })
            .addCase(reviewPlpTask.fulfilled, (state, action) => {
                const nextTask = action.payload;
                Object.keys(state.tasksByGoal).forEach((goalId) => {
                    state.tasksByGoal[goalId] = state.tasksByGoal[goalId].map((task) => (
                        task._id === nextTask._id ? nextTask : task
                    ));
                });
                state.myStudentTasks = state.myStudentTasks.map((task) => (
                    task._id === nextTask._id ? nextTask : task
                ));
            })

            .addCase(fetchSelCompetencies.fulfilled, (state, action) => { state.selCompetencies = action.payload; })
            .addCase(seedSelCompetencies.fulfilled, (state, action) => { state.selCompetencies = action.payload; })

            .addCase(fetchCharacterThemes.fulfilled, (state, action) => { state.characterThemes = action.payload; })
            .addCase(seedCharacterThemes.fulfilled, (state, action) => { state.characterThemes = action.payload; })

            .addCase(fetchPlpRecordInteractions.fulfilled, (state, action) => {
                state.interactions[action.payload.recordId] = action.payload.interactions;
            })
            .addCase(addSupervisorNote.fulfilled, (state, action) => {
                const { recordId, interaction } = action.payload;
                if (!state.interactions[recordId]) state.interactions[recordId] = [];
                state.interactions[recordId].unshift(interaction);
            })

            .addCase(fetchPlpTraits.pending, traitPending)
            .addCase(fetchPlpTraits.fulfilled, (state, action) => { state.traitLoading = false; state.traits = action.payload; })
            .addCase(fetchPlpTraits.rejected, traitFailed)

            .addCase(fetchPlpTrait.fulfilled, (state, action) => {
                const idx = state.traits.findIndex((t) => t._id === action.payload._id);
                if (idx !== -1) state.traits[idx] = action.payload;
            })

            .addCase(createPlpTrait.fulfilled, (state, action) => { state.traits.unshift(action.payload); })
            .addCase(updatePlpTrait.fulfilled, (state, action) => {
                const idx = state.traits.findIndex((t) => t._id === action.payload._id);
                if (idx !== -1) state.traits[idx] = action.payload;
            })
            .addCase(setPlpTraitActive.fulfilled, (state, action) => {
                const idx = state.traits.findIndex((t) => t._id === action.payload._id);
                if (idx !== -1) state.traits[idx] = action.payload;
            })
            .addCase(seedPlpTraits.fulfilled, (state, action) => { state.traits = action.payload; });
    },
});

export const { clearPlpError, clearPlpTraitError, clearSelectedRecord } = plpSlice.actions;

export const selectPlpConfigs = (s) => s.plp.configs;
export const selectPlpRecords = (s) => s.plp.records;
export const selectSelectedPlpRecord = (s) => s.plp.selectedRecord;
export const selectPlpEvidence = (recordId) => (s) => s.plp.evidence[recordId] || [];
export const selectPlpAwardCandidates = (s) => s.plp.awardCandidates;
export const selectPlpSupervisorAssignments = (s) => s.plp.supervisorAssignments;
export const selectSupervisorTeachers = (s) => s.plp.supervisorTeachers;
export const selectSelCompetencies = (s) => s.plp.selCompetencies;
export const selectCharacterThemes = (s) => s.plp.characterThemes;
export const selectPlpInteractions = (recordId) => (s) => s.plp.interactions[recordId] || [];
export const selectPlpCycles = (s) => s.plp.cycles;
export const selectPlpGoals = (recordId) => (s) => s.plp.goalsByRecord[recordId] || [];
export const selectPlpTasks = (goalId) => (s) => s.plp.tasksByGoal[goalId] || [];
export const selectMyPlpStudentTasks = (s) => s.plp.myStudentTasks;
export const selectPlpLoading = (s) => s.plp.loading;
export const selectPlpError = (s) => s.plp.error;
export const selectPlpTraits = (s) => s.plp.traits;
export const selectPlpTraitLoading = (s) => s.plp.traitLoading;
export const selectPlpTraitError = (s) => s.plp.traitError;
export const selectPlpActiveTraits = (s) => s.plp.traits.filter((t) => t.isActive);

export default plpSlice.reducer;
