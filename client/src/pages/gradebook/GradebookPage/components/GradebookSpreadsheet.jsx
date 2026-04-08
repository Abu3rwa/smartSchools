import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
    HiOutlinePlus,
    HiOutlineSave,
    HiOutlineDownload,
    HiOutlineUpload,
    HiOutlineLockClosed,
    HiOutlineLockOpen,
    HiOutlineTrash,
    HiOutlineExclamationCircle,
    HiOutlineCalculator,
    HiOutlinePencil
} from 'react-icons/hi';
import { selectClassStudents } from '../../../../store/slices/classSlice';
import { selectCurrentAcademicYear } from '../../../../store/slices/uiSlice';
import {
    fetchSpreadsheetData,
    batchSaveGrades,
    autoFillColumn,
    exportGradebook,
    selectSpreadsheetStudents,
    selectSpreadsheetGrades,
    selectSpreadsheetGradingScale,
    selectSpreadsheetLoading,
    selectSpreadsheetSaving,
    selectSpreadsheetDirtyCells,
    selectSpreadsheetError,
    setCellDirty,
    clearDirtyCells
} from '../../../../store/slices/spreadsheetSlice';
import {
    fetchColumns,
    createColumn,
    updateColumn,
    deleteColumn,
    toggleColumnLock,
    selectColumns,
    selectColumnsLoading
} from '../../../../store/slices/gradebookColumnsSlice';
import { migrateColumns } from '../../../../store/slices/gradebookColumnsSlice';
import { getScaleBandForPercentage } from '../utils/gradebookPresentation';

import AddColumnModal from './AddColumnModal';
import AutoFillModal from './AutoFillModal';
import ImportModal from './ImportModal';

const CATEGORY_COLORS = {
    classwork: '#3b82f6',
    homework: '#10b981',
    quiz: '#f59e0b',
    test: '#ef4444',
    project: '#8b5cf6',
    participation: '#06b6d4',
    oral: '#ec4899',
    practical: '#14b8a6',
    midterm_exam: '#dc2626',
    final_exam: '#991b1b',
    exam: '#dc2626',
    other: '#64748b'
};

const GradebookSpreadsheet = ({ selectedSubject, selectedSemester }) => {
    const { classId } = useParams();
    const dispatch = useDispatch();
    const { t } = useTranslation(['gradebook']);

    const classStudents = useSelector(selectClassStudents);
    const academicYear = useSelector(selectCurrentAcademicYear);
    const spreadsheetStudents = useSelector(selectSpreadsheetStudents);
    const columns = useSelector(selectColumns);
    const grades = useSelector(selectSpreadsheetGrades);
    const gradingScale = useSelector(selectSpreadsheetGradingScale);
    const loading = useSelector(selectSpreadsheetLoading);
    const saving = useSelector(selectSpreadsheetSaving);
    const dirtyCells = useSelector(selectSpreadsheetDirtyCells);
    const spreadsheetError = useSelector(selectSpreadsheetError);
    const columnsLoading = useSelector(selectColumnsLoading);

    const [showAddColumn, setShowAddColumn] = useState(false);
    const [showAutoFill, setShowAutoFill] = useState(false);
    const [showImport, setShowImport] = useState(false);
    const [editingColumn, setEditingColumn] = useState(null);
    const [focusedCell, setFocusedCell] = useState(null);
    const tableRef = useRef(null);

    const hasDirtyChanges = useMemo(() => Object.keys(dirtyCells).length > 0, [dirtyCells]);
    const students = useMemo(
        () => (spreadsheetStudents.length > 0 ? spreadsheetStudents : classStudents),
        [spreadsheetStudents, classStudents]
    );
    const isLoading = loading || columnsLoading;

    // Fetch data when filters change
    useEffect(() => {
        if (!classId || !selectedSubject || !academicYear) return;

        // First trigger migration, then fetch spreadsheet data
        dispatch(migrateColumns({
            classId, subjectId: selectedSubject, academicYear, semester: selectedSemester
        })).then(() => {
            dispatch(fetchSpreadsheetData({
                classId,
                params: { subjectId: selectedSubject, academicYear, semester: selectedSemester }
            }));
            dispatch(fetchColumns({
                classId, subjectId: selectedSubject, academicYear, semester: selectedSemester
            }));
        });
    }, [dispatch, classId, selectedSubject, academicYear, selectedSemester]);

    const handleCellChange = useCallback((studentId, columnId, value) => {
        const marks = value === '' ? null : Number(value);
        if (value !== '' && isNaN(marks)) return;
        dispatch(setCellDirty({ studentId, columnId, marks }));
    }, [dispatch]);

    const handleKeyDown = useCallback((e, studentIdx, colIdx) => {
        const maxRow = students.length - 1;
        const maxCol = columns.length - 1;
        let next = null;

        if (e.key === 'Tab' || e.key === 'Enter') {
            e.preventDefault();
            if (e.shiftKey) {
                next = colIdx > 0 ? [studentIdx, colIdx - 1] : (studentIdx > 0 ? [studentIdx - 1, maxCol] : null);
            } else {
                next = colIdx < maxCol ? [studentIdx, colIdx + 1] : (studentIdx < maxRow ? [studentIdx + 1, 0] : null);
            }
        } else if (e.key === 'ArrowDown' && studentIdx < maxRow) {
            next = [studentIdx + 1, colIdx];
        } else if (e.key === 'ArrowUp' && studentIdx > 0) {
            next = [studentIdx - 1, colIdx];
        } else if (e.key === 'ArrowRight' && colIdx < maxCol) {
            next = [studentIdx, colIdx + 1];
        } else if (e.key === 'ArrowLeft' && colIdx > 0) {
            next = [studentIdx, colIdx - 1];
        }

        if (next) {
            setFocusedCell(next);
            const input = tableRef.current?.querySelector(`[data-cell="${next[0]}-${next[1]}"]`);
            input?.focus();
            input?.select();
        }
    }, [students, columns]);

    const handleSave = useCallback(async () => {
        if (!hasDirtyChanges) return;
        const entries = Object.values(dirtyCells).map(cell => ({
            studentId: cell.studentId,
            columnId: cell.columnId,
            marks: cell.marks
        }));
        try {
            await dispatch(batchSaveGrades({
                classId,
                subjectId: selectedSubject,
                academicYear,
                semester: selectedSemester,
                entries
            })).unwrap();
            dispatch(clearDirtyCells());
            toast.success(`${entries.length} grades saved`);
        } catch (err) {
            toast.error(err || 'Failed to save');
        }
    }, [dispatch, dirtyCells, hasDirtyChanges, classId, selectedSubject, academicYear, selectedSemester]);

    const handleExport = useCallback(() => {
        dispatch(exportGradebook({
            classId,
            params: { subjectId: selectedSubject, academicYear, semester: selectedSemester }
        })).unwrap().then((data) => {
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `gradebook_export_${classId}.json`;
            a.click();
            URL.revokeObjectURL(url);
            toast.success('Exported successfully');
        }).catch(err => toast.error(err || 'Export failed'));
    }, [dispatch, classId, selectedSubject, academicYear, selectedSemester]);

    const handleDeleteColumn = useCallback(async (colId, colName) => {
        if (!window.confirm(`Delete column "${colName}"? This will unlink all grades.`)) return;
        try {
            await dispatch(deleteColumn({ id: colId })).unwrap();
            toast.success('Column deleted');
            // Refetch
            dispatch(fetchSpreadsheetData({
                classId, params: { subjectId: selectedSubject, academicYear, semester: selectedSemester }
            }));
        } catch (err) {
            toast.error(err || 'Failed to delete');
        }
    }, [dispatch, classId, selectedSubject, academicYear, selectedSemester]);

    const handleToggleLock = useCallback(async (colId) => {
        try {
            await dispatch(toggleColumnLock(colId)).unwrap();
        } catch (err) {
            toast.error(err || 'Failed to toggle lock');
        }
    }, [dispatch]);

    const handleRenameColumn = useCallback(async (column) => {
        if (!column || column.isLocked) return;

        const currentName = column.name || '';
        const nextName = window.prompt('Rename column', currentName);
        if (nextName == null) return;

        const trimmed = nextName.trim();
        if (!trimmed || trimmed === currentName) return;

        try {
            await dispatch(updateColumn({ id: column._id, data: { name: trimmed } })).unwrap();
            toast.success('Column renamed');
        } catch (err) {
            toast.error(err || 'Failed to rename column');
        }
    }, [dispatch]);

    const getColumnAverage = useCallback((colId) => {
        let sum = 0, count = 0;
        for (const student of students) {
            const grade = grades[student._id]?.[colId];
            if (grade?.marks != null) {
                sum += grade.marks;
                count++;
            }
        }
        return count > 0 ? (sum / count).toFixed(1) : '-';
    }, [students, grades]);

    const getStudentAverage = useCallback((studentId) => {
        let sum = 0, count = 0;
        for (const col of columns) {
            const grade = grades[studentId]?.[col._id];
            if (grade?.marks != null && col.maxMarks) {
                sum += (grade.marks / col.maxMarks) * 100;
                count++;
            }
        }
        return count > 0 ? (sum / count).toFixed(1) : '-';
    }, [columns, grades]);

    return (
        <div className="gradebook-spreadsheet">
            {/* Toolbar */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1 }} />
                <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving || !hasDirtyChanges}>
                    <HiOutlineSave size={14} style={{ marginRight: 4 }} />
                    {saving ? 'Saving...' : `Save${hasDirtyChanges ? ` (${Object.keys(dirtyCells).length})` : ''}`}
                </button>
                <button className="btn btn-outline-primary btn-sm" onClick={() => setShowAddColumn(true)}>
                    <HiOutlinePlus size={14} style={{ marginRight: 4 }} />Add Column
                </button>
                <button className="btn btn-outline-secondary btn-sm" onClick={() => setShowAutoFill(true)}>
                    <HiOutlinePencil size={14} style={{ marginRight: 4 }} />Auto-Fill
                </button>
                <button className="btn btn-outline-secondary btn-sm" onClick={() => setShowImport(true)}>
                    <HiOutlineUpload size={14} style={{ marginRight: 4 }} />Import
                </button>
                <button className="btn btn-outline-secondary btn-sm" onClick={handleExport}>
                    <HiOutlineDownload size={14} style={{ marginRight: 4 }} />Export
                </button>
            </div>

            {spreadsheetError && (
                <div style={{
                    marginBottom: 10,
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid #fecaca',
                    background: '#fef2f2',
                    color: '#991b1b',
                    fontSize: 13
                }}>
                    {spreadsheetError}
                </div>
            )}

            {isLoading ? (
                <div className="card" style={{ padding: 24 }}>
                    <p className="text-muted">Loading spreadsheet...</p>
                </div>
            ) : (
                <>

                    {/* Spreadsheet Grid */}
                    <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 8 }} ref={tableRef}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead>
                                {/* Category color bar */}
                                <tr>
                                    <th style={{ position: 'sticky', left: 0, zIndex: 3, background: '#f9fafb', width: 180 }}></th>
                                    {columns.map(col => (
                                        <th key={col._id} style={{
                                            borderBottom: `3px solid ${CATEGORY_COLORS[col.category] || '#64748b'}`,
                                            padding: '4px 8px', fontSize: 11, color: '#6b7280', textAlign: 'center',
                                            minWidth: 90
                                        }}>
                                            {col.category}
                                        </th>
                                    ))}
                                    <th style={{ minWidth: 70, textAlign: 'center', background: '#f1f5f9', fontSize: 11 }}>AVG</th>
                                </tr>
                                {/* Column names */}
                                <tr style={{ background: '#f9fafb' }}>
                                    <th style={{
                                        position: 'sticky', left: 0, zIndex: 3, background: '#f9fafb',
                                        padding: '8px 12px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid #e5e7eb'
                                    }}>
                                        Student
                                    </th>
                                    {columns.map(col => (
                                        <th key={col._id} style={{
                                            padding: '6px 8px', textAlign: 'center', fontWeight: 500,
                                            borderBottom: '1px solid #e5e7eb', position: 'relative'
                                        }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                                <span style={{ fontSize: 12 }}>{col.name}</span>
                                                <span style={{ fontSize: 10, color: '#9ca3af' }}>/{col.maxMarks}</span>
                                            </div>
                                            <div style={{ display: 'flex', gap: 2, justifyContent: 'center', marginTop: 4 }}>
                                                {!col.isLocked && (
                                                    <button onClick={() => handleRenameColumn(col)}
                                                        style={{ cursor: 'pointer', background: 'none', border: 'none', padding: 1 }}
                                                        title="Rename column">
                                                        <HiOutlinePencil size={11} color="#9ca3af" />
                                                    </button>
                                                )}
                                                <button onClick={() => handleToggleLock(col._id)}
                                                    style={{ cursor: 'pointer', background: 'none', border: 'none', padding: 1 }}
                                                    title={col.isLocked ? 'Unlock' : 'Lock'}>
                                                    {col.isLocked ? <HiOutlineLockClosed size={11} color="#dc2626" /> : <HiOutlineLockOpen size={11} color="#9ca3af" />}
                                                </button>
                                                {!col.isLocked && (
                                                    <button onClick={() => handleDeleteColumn(col._id, col.name)}
                                                        style={{ cursor: 'pointer', background: 'none', border: 'none', padding: 1 }}
                                                        title="Delete column">
                                                        <HiOutlineTrash size={11} color="#9ca3af" />
                                                    </button>
                                                )}
                                            </div>
                                        </th>
                                    ))}
                                    <th style={{ background: '#f1f5f9', padding: 6, borderBottom: '1px solid #e5e7eb', fontWeight: 600, textAlign: 'center', fontSize: 12 }}>
                                        Average
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {students.map((student, sIdx) => {
                                    const avg = getStudentAverage(student._id);
                                    const avgNum = parseFloat(avg);
                                    const avgBand = !isNaN(avgNum) ? getScaleBandForPercentage(avgNum, gradingScale) : null;
                                    return (
                                        <tr key={student._id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                            <td style={{
                                                position: 'sticky', left: 0, zIndex: 2, background: '#fff',
                                                padding: '6px 12px', fontWeight: 500, whiteSpace: 'nowrap'
                                            }}>
                                                {student.name || `${student.firstName} ${student.lastName}`}
                                            </td>
                                            {columns.map((col, cIdx) => {
                                                const grade = grades[student._id]?.[col._id];
                                                const value = grade?.marks ?? '';
                                                const pct = grade?.marks != null && col.maxMarks ? (grade.marks / col.maxMarks) * 100 : null;
                                                const band = pct != null ? getScaleBandForPercentage(pct, gradingScale) : null;
                                                const isDirty = !!dirtyCells[`${student._id}:${col._id}`];
                                                return (
                                                    <td key={col._id} style={{
                                                        padding: 2, textAlign: 'center',
                                                        background: isDirty ? '#fef3c7' : (band ? `${band.color}10` : '#fff')
                                                    }}>
                                                        {col.isLocked ? (
                                                            <span style={{ fontSize: 12 }}>{value !== '' ? value : '-'}</span>
                                                        ) : (
                                                            <input
                                                                data-cell={`${sIdx}-${cIdx}`}
                                                                type="number"
                                                                min={0}
                                                                max={col.maxMarks}
                                                                step="any"
                                                                value={value}
                                                                onChange={e => handleCellChange(student._id, col._id, e.target.value)}
                                                                onKeyDown={e => handleKeyDown(e, sIdx, cIdx)}
                                                                onFocus={() => setFocusedCell([sIdx, cIdx])}
                                                                style={{
                                                                    width: '100%', textAlign: 'center', border: 'none',
                                                                    background: 'transparent', padding: '4px 2px', fontSize: 13,
                                                                    outline: focusedCell?.[0] === sIdx && focusedCell?.[1] === cIdx ? '2px solid #3b82f6' : 'none'
                                                                }}
                                                            />
                                                        )}
                                                        {band && <div style={{ fontSize: 9, color: band.color }}>{band.grade}</div>}
                                                    </td>
                                                );
                                            })}
                                            <td style={{ textAlign: 'center', background: '#f8fafc', padding: 4, fontWeight: 600, fontSize: 12 }}>
                                                {avg !== '-' && (
                                                    <span style={{ color: avgBand?.color || '#374151' }}>
                                                        {avg}%{avgBand ? ` ${avgBand.grade}` : ''}
                                                    </span>
                                                )}
                                                {avg === '-' && <span style={{ color: '#9ca3af' }}>-</span>}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            {/* Averages Row */}
                            <tfoot>
                                <tr style={{ background: '#f1f5f9', fontWeight: 600 }}>
                                    <td style={{ position: 'sticky', left: 0, zIndex: 2, background: '#f1f5f9', padding: '8px 12px', fontSize: 12 }}>
                                        Class Average
                                    </td>
                                    {columns.map(col => {
                                        const avg = getColumnAverage(col._id);
                                        return (
                                            <td key={col._id} style={{ textAlign: 'center', padding: 4, fontSize: 12 }}>
                                                {avg !== '-' ? `${avg}/${col.maxMarks}` : '-'}
                                            </td>
                                        );
                                    })}
                                    <td style={{ textAlign: 'center', background: '#e2e8f0', padding: 4, fontSize: 12 }}>—</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </>
            )}

            {students.length === 0 && !isLoading && (
                <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>
                    <HiOutlineExclamationCircle size={40} style={{ margin: '0 auto 8px' }} />
                    <p>{spreadsheetError || 'No students found for this class'}</p>
                </div>
            )}

            {/* Modals */}
            {showAddColumn && (
                <AddColumnModal
                    classId={classId}
                    subjectId={selectedSubject}
                    academicYear={academicYear}
                    semester={selectedSemester}
                    onClose={() => setShowAddColumn(false)}
                    onCreated={() => {
                        setShowAddColumn(false);
                        dispatch(fetchSpreadsheetData({
                            classId, params: { subjectId: selectedSubject, academicYear, semester: selectedSemester }
                        }));
                    }}
                />
            )}
            {showAutoFill && (
                <AutoFillModal
                    columns={columns}
                    classId={classId}
                    subjectId={selectedSubject}
                    academicYear={academicYear}
                    semester={selectedSemester}
                    onClose={() => setShowAutoFill(false)}
                    onFilled={() => {
                        setShowAutoFill(false);
                        dispatch(fetchSpreadsheetData({
                            classId, params: { subjectId: selectedSubject, academicYear, semester: selectedSemester }
                        }));
                    }}
                />
            )}
            {showImport && (
                <ImportModal
                    classId={classId}
                    subjectId={selectedSubject}
                    academicYear={academicYear}
                    semester={selectedSemester}
                    onClose={() => setShowImport(false)}
                    onImported={() => {
                        setShowImport(false);
                        dispatch(fetchSpreadsheetData({
                            classId, params: { subjectId: selectedSubject, academicYear, semester: selectedSemester }
                        }));
                    }}
                />
            )}
        </div>
    );
};

export default GradebookSpreadsheet;
