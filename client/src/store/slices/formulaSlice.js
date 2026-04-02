import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import formulaService from '../../services/formulaService';

export const fetchFormulas = createAsyncThunk(
    'formulas/fetch',
    async ({ classId, subjectId, academicYear, semester }, { rejectWithValue }) => {
        try {
            const result = await formulaService.getFormulas({ classId, subjectId, academicYear, semester });
            return result.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to load formulas');
        }
    }
);

export const createFormula = createAsyncThunk(
    'formulas/create',
    async (data, { rejectWithValue }) => {
        try {
            const result = await formulaService.createFormula(data);
            return result.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to create formula');
        }
    }
);

export const updateFormula = createAsyncThunk(
    'formulas/update',
    async ({ id, data }, { rejectWithValue }) => {
        try {
            const result = await formulaService.updateFormula(id, data);
            return result.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to update formula');
        }
    }
);

export const deleteFormula = createAsyncThunk(
    'formulas/delete',
    async (id, { rejectWithValue }) => {
        try {
            await formulaService.deleteFormula(id);
            return id;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to delete formula');
        }
    }
);

export const calculateFormula = createAsyncThunk(
    'formulas/calculate',
    async ({ id, studentIds }, { rejectWithValue }) => {
        try {
            const result = await formulaService.calculateFormula(id, studentIds);
            return { formulaId: id, results: result.data };
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to calculate formula');
        }
    }
);

export const fetchPresets = createAsyncThunk(
    'formulas/fetchPresets',
    async (_, { rejectWithValue }) => {
        try {
            const result = await formulaService.getPresets();
            return result.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to load presets');
        }
    }
);

const formulaSlice = createSlice({
    name: 'formulas',
    initialState: {
        formulas: [],
        presets: [],
        calculationResults: {},
        loading: false,
        saving: false,
        calculating: false,
        error: null
    },
    reducers: {
        clearFormulaError: (state) => { state.error = null; },
        clearCalculationResults: (state) => { state.calculationResults = {}; }
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchFormulas.pending, (state) => { state.loading = true; state.error = null; })
            .addCase(fetchFormulas.fulfilled, (state, action) => { state.loading = false; state.formulas = action.payload; })
            .addCase(fetchFormulas.rejected, (state, action) => { state.loading = false; state.error = action.payload; })
            .addCase(createFormula.pending, (state) => { state.saving = true; state.error = null; })
            .addCase(createFormula.fulfilled, (state, action) => {
                state.saving = false;
                state.formulas.push(action.payload);
            })
            .addCase(createFormula.rejected, (state, action) => { state.saving = false; state.error = action.payload; })
            .addCase(updateFormula.pending, (state) => { state.saving = true; state.error = null; })
            .addCase(updateFormula.fulfilled, (state, action) => {
                state.saving = false;
                const idx = state.formulas.findIndex(f => f._id === action.payload._id);
                if (idx !== -1) state.formulas[idx] = action.payload;
            })
            .addCase(updateFormula.rejected, (state, action) => { state.saving = false; state.error = action.payload; })
            .addCase(deleteFormula.fulfilled, (state, action) => {
                state.formulas = state.formulas.filter(f => f._id !== action.payload);
            })
            .addCase(calculateFormula.pending, (state) => { state.calculating = true; })
            .addCase(calculateFormula.fulfilled, (state, action) => {
                state.calculating = false;
                state.calculationResults[action.payload.formulaId] = action.payload.results;
            })
            .addCase(calculateFormula.rejected, (state, action) => { state.calculating = false; state.error = action.payload; })
            .addCase(fetchPresets.fulfilled, (state, action) => { state.presets = action.payload; });
    }
});

export const { clearFormulaError, clearCalculationResults } = formulaSlice.actions;

export const selectFormulas = (state) => state.formulas?.formulas || [];
export const selectFormulasLoading = (state) => state.formulas?.loading || false;
export const selectFormulasSaving = (state) => state.formulas?.saving || false;
export const selectFormulasError = (state) => state.formulas?.error || null;
export const selectFormulaPresets = (state) => state.formulas?.presets || [];
export const selectCalculationResults = (state) => state.formulas?.calculationResults || {};

export default formulaSlice.reducer;
