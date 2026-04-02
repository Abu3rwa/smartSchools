import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import gradebookConfigService from '../../services/gradebookConfigService';

export const fetchGradebookConfig = createAsyncThunk(
    'gradebookConfig/fetch',
    async (academicYear, { rejectWithValue }) => {
        try {
            const result = await gradebookConfigService.getConfig(academicYear);
            return result.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to load gradebook config');
        }
    }
);

export const fetchCategories = createAsyncThunk(
    'gradebookConfig/fetchCategories',
    async (academicYear, { rejectWithValue }) => {
        try {
            const result = await gradebookConfigService.getCategories(academicYear);
            return result.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to load categories');
        }
    }
);

export const saveGradebookConfig = createAsyncThunk(
    'gradebookConfig/save',
    async ({ id, data }, { rejectWithValue }) => {
        try {
            let result;
            if (id) {
                result = await gradebookConfigService.updateConfig(id, data);
            } else {
                result = await gradebookConfigService.createConfig(data);
            }
            return result.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to save gradebook config');
        }
    }
);

export const cloneGradebookConfig = createAsyncThunk(
    'gradebookConfig/clone',
    async ({ id, academicYear }, { rejectWithValue }) => {
        try {
            const result = await gradebookConfigService.cloneConfig(id, academicYear);
            return result.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to clone gradebook config');
        }
    }
);

const gradebookConfigSlice = createSlice({
    name: 'gradebookConfig',
    initialState: {
        config: null,
        categories: [],
        loading: false,
        saving: false,
        error: null
    },
    reducers: {
        clearConfigError: (state) => {
            state.error = null;
        }
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchGradebookConfig.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(fetchGradebookConfig.fulfilled, (state, action) => {
                state.loading = false;
                state.config = action.payload;
            })
            .addCase(fetchGradebookConfig.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            })
            .addCase(fetchCategories.fulfilled, (state, action) => {
                state.categories = action.payload;
            })
            .addCase(saveGradebookConfig.pending, (state) => {
                state.saving = true;
                state.error = null;
            })
            .addCase(saveGradebookConfig.fulfilled, (state, action) => {
                state.saving = false;
                state.config = action.payload;
            })
            .addCase(saveGradebookConfig.rejected, (state, action) => {
                state.saving = false;
                state.error = action.payload;
            })
            .addCase(cloneGradebookConfig.pending, (state) => {
                state.saving = true;
            })
            .addCase(cloneGradebookConfig.fulfilled, (state, action) => {
                state.saving = false;
                state.config = action.payload;
            })
            .addCase(cloneGradebookConfig.rejected, (state, action) => {
                state.saving = false;
                state.error = action.payload;
            });
    }
});

export const { clearConfigError } = gradebookConfigSlice.actions;

export const selectGradebookConfig = (state) => state.gradebookConfig?.config;
export const selectGradebookCategories = (state) => state.gradebookConfig?.categories;
export const selectGradebookConfigLoading = (state) => state.gradebookConfig?.loading;
export const selectGradebookConfigSaving = (state) => state.gradebookConfig?.saving;
export const selectGradebookConfigError = (state) => state.gradebookConfig?.error;

export default gradebookConfigSlice.reducer;
