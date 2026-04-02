import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import gradebookSpreadsheetService from '../../services/gradebookSpreadsheetService';

export const fetchSpreadsheetData = createAsyncThunk(
    'spreadsheet/fetch',
    async ({ classId, params }, { rejectWithValue }) => {
        try {
            const result = await gradebookSpreadsheetService.getSpreadsheetData(classId, params);
            return result.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to load spreadsheet data');
        }
    }
);

export const batchSaveGrades = createAsyncThunk(
    'spreadsheet/batchSave',
    async (data, { rejectWithValue }) => {
        try {
            const result = await gradebookSpreadsheetService.batchSaveGrades(data);
            return result.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to save grades');
        }
    }
);

export const autoFillColumn = createAsyncThunk(
    'spreadsheet/autoFill',
    async (data, { rejectWithValue }) => {
        try {
            const result = await gradebookSpreadsheetService.autoFillColumn(data);
            return result.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to auto-fill');
        }
    }
);

export const importGrades = createAsyncThunk(
    'spreadsheet/import',
    async (data, { rejectWithValue }) => {
        try {
            const result = await gradebookSpreadsheetService.importGrades(data);
            return result.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to import grades');
        }
    }
);

export const exportGradebook = createAsyncThunk(
    'spreadsheet/export',
    async ({ classId, params }, { rejectWithValue }) => {
        try {
            const result = await gradebookSpreadsheetService.exportGradebook(classId, params);
            return result.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to export gradebook');
        }
    }
);

export const fetchMissingReport = createAsyncThunk(
    'spreadsheet/missingReport',
    async ({ classId, params }, { rejectWithValue }) => {
        try {
            const result = await gradebookSpreadsheetService.getMissingReport(classId, params);
            return result.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Failed to load missing report');
        }
    }
);

const spreadsheetSlice = createSlice({
    name: 'spreadsheet',
    initialState: {
        students: [],
        columns: [],
        grades: {},
        gradingScale: null,
        missingReport: null,
        exportData: null,
        importResult: null,
        dirtyCells: {},
        loading: false,
        saving: false,
        error: null
    },
    reducers: {
        clearSpreadsheetError: (state) => { state.error = null; },
        clearImportResult: (state) => { state.importResult = null; },
        clearExportData: (state) => { state.exportData = null; },
        setCellDirty: (state, action) => {
            const { studentId, columnId, marks } = action.payload;
            const key = `${studentId}:${columnId}`;
            state.dirtyCells[key] = { studentId, columnId, marks };
            // Optimistic update
            if (!state.grades[studentId]) state.grades[studentId] = {};
            state.grades[studentId][columnId] = { ...state.grades[studentId][columnId], marks };
        },
        clearDirtyCells: (state) => { state.dirtyCells = {}; }
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchSpreadsheetData.pending, (state) => { state.loading = true; state.error = null; })
            .addCase(fetchSpreadsheetData.fulfilled, (state, action) => {
                state.loading = false;
                state.students = action.payload.students || [];
                state.columns = action.payload.columns || [];
                state.grades = action.payload.grades || {};
                state.gradingScale = action.payload.gradingScale || null;
            })
            .addCase(fetchSpreadsheetData.rejected, (state, action) => { state.loading = false; state.error = action.payload; })
            .addCase(batchSaveGrades.pending, (state) => { state.saving = true; state.error = null; })
            .addCase(batchSaveGrades.fulfilled, (state) => { state.saving = false; state.dirtyCells = {}; })
            .addCase(batchSaveGrades.rejected, (state, action) => { state.saving = false; state.error = action.payload; })
            .addCase(autoFillColumn.fulfilled, (state) => { /* Refetch needed after auto-fill */ })
            .addCase(importGrades.fulfilled, (state, action) => { state.importResult = action.payload; })
            .addCase(exportGradebook.fulfilled, (state, action) => { state.exportData = action.payload; })
            .addCase(fetchMissingReport.fulfilled, (state, action) => { state.missingReport = action.payload; });
    }
});

export const { clearSpreadsheetError, clearImportResult, clearExportData, setCellDirty, clearDirtyCells } = spreadsheetSlice.actions;

export const selectSpreadsheetStudents = (state) => state.spreadsheet?.students || [];
export const selectSpreadsheetColumns = (state) => state.spreadsheet?.columns || [];
export const selectSpreadsheetGrades = (state) => state.spreadsheet?.grades || {};
export const selectSpreadsheetGradingScale = (state) => state.spreadsheet?.gradingScale || null;
export const selectSpreadsheetLoading = (state) => state.spreadsheet?.loading || false;
export const selectSpreadsheetSaving = (state) => state.spreadsheet?.saving || false;
export const selectSpreadsheetDirtyCells = (state) => state.spreadsheet?.dirtyCells || {};
export const selectSpreadsheetError = (state) => state.spreadsheet?.error || null;
export const selectMissingReport = (state) => state.spreadsheet?.missingReport || null;
export const selectImportResult = (state) => state.spreadsheet?.importResult || null;

export default spreadsheetSlice.reducer;
