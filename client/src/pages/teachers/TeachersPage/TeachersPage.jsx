import { useEffect, useMemo, useRef, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    assignMultipleClassesToTeacher,
    bulkSendTeacherLoginInvites,
    createTeacher,
    deleteTeacher,
    fetchTeachers,
    removeClassFromTeacher,
    selectTeachers,
    selectTeachersLoading,
    sendTeacherLoginInvite,
    updateTeacher
} from '../../../store/slices/teacherSlice';
import { fetchSubjects, selectSubjects } from '../../../store/slices/subjectSlice';
import { fetchClasses, selectClasses } from '../../../store/slices/classSlice';
import { fetchDepartments, selectDepartments } from '../../../store/slices/departmentSlice';
import {
    fetchSchoolFeatures,
    selectSchoolFeatureLimits,
    selectSchoolFeatureUsage
} from '../../../store/slices/schoolFeaturesSlice';
import { selectIsAdmin, selectUser } from '../../../store/slices/authSlice';
import toast from 'react-hot-toast';
import TeachersHeader from './components/TeachersHeader';
import TeachersFilters from './components/TeachersFilters';
import TeachersTable from './components/TeachersTable';
import TeacherFormModal from './components/TeacherFormModal';
import TeacherAssignmentsModal from './components/TeacherAssignmentsModal';
import {
    BulkTeacherInviteModal,
    TeacherInviteModal
} from './components/TeacherInviteModals';
import useTeachersPageState from './hooks/useTeachersPageState';
import { mapTeacherToFormData } from './utils/teacherPresentation';
import teacherService from '../../../services/teacherService';
import { parseCsvFile } from '../../../utils/csvImport';
import importTemplateService from '../../../services/importTemplateService';
import TablePagination from '../../../components/common/TablePagination';
import './TeachersPage.css';

const DEFAULT_PAGE_SIZE = 10;

const TeachersPage = () => {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const { t } = useTranslation(['teachers']);
    const teachers = useSelector(selectTeachers);
    const subjects = useSelector(selectSubjects);
    const classes = useSelector(selectClasses);
    const departments = useSelector(selectDepartments);
    const loading = useSelector(selectTeachersLoading);
    const schoolLimits = useSelector(selectSchoolFeatureLimits);
    const schoolUsage = useSelector(selectSchoolFeatureUsage);
    const isAdmin = useSelector(selectIsAdmin);
    const user = useSelector(selectUser);
    const canManageTeachers = isAdmin || user?.role === 'department_principal';
    const importInputRef = useRef(null);
    const [selectedTeacherIds, setSelectedTeacherIds] = useState(new Set());
    const [sendingInviteTeacherId, setSendingInviteTeacherId] = useState(null);
    const [bulkInviteLoading, setBulkInviteLoading] = useState(false);
    const [teacherInviteResult, setTeacherInviteResult] = useState(null);
    const [bulkTeacherInviteResults, setBulkTeacherInviteResults] = useState(null);
    const [templateMeta, setTemplateMeta] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

    const {
        searchTerm,
        setSearchTerm,
        showModal,
        setShowModal,
        showEditModal,
        setShowEditModal,
        showAssignModal,
        setShowAssignModal,
        selectedTeacher,
        setSelectedTeacher,
        editingTeacher,
        setEditingTeacher,
        submitting,
        setSubmitting,
        formData,
        setFormData,
        assignments,
        filteredTeachers,
        resetFormData,
        resetAssignments,
        addAssignmentRow,
        removeAssignmentRow,
        updateAssignmentField
    } = useTeachersPageState(teachers);

    useEffect(() => {
        dispatch(fetchTeachers({ limit: 0 }));
        dispatch(fetchSubjects());
        dispatch(fetchClasses());
        dispatch(fetchDepartments());
        dispatch(fetchSchoolFeatures());
    }, [dispatch]);

    const teacherCapacity = useMemo(() => {
        const maxTeachers = Number(schoolLimits?.maxTeachers);
        const currentTeachers = Number(schoolUsage?.currentTeachers || 0);

        if (!Number.isFinite(maxTeachers) || maxTeachers < 0) {
            return {
                isLimited: false,
                maxTeachers: null,
                currentTeachers,
                remainingSeats: null,
                isFull: false
            };
        }

        const remainingSeats = Math.max(0, maxTeachers - currentTeachers);
        return {
            isLimited: true,
            maxTeachers,
            currentTeachers,
            remainingSeats,
            isFull: remainingSeats <= 0
        };
    }, [schoolLimits, schoolUsage]);

    const showCapacityBanner = canManageTeachers && (teacherCapacity.isLimited || teacherCapacity.currentTeachers > 0);

    useEffect(() => {
        let mounted = true;
        importTemplateService.getEntityTemplate('teachers')
            .then((meta) => {
                if (mounted) setTemplateMeta(meta);
            })
            .catch(() => {
                if (mounted) setTemplateMeta(null);
            });
        return () => {
            mounted = false;
        };
    }, []);

    useEffect(() => {
        if (!selectedTeacher?._id) return;

        const refreshedTeacher = teachers.find((teacher) => teacher._id === selectedTeacher._id);
        if (refreshedTeacher) {
            setSelectedTeacher(refreshedTeacher);
            return;
        }

        setShowAssignModal(false);
        setSelectedTeacher(null);
    }, [selectedTeacher?._id, setSelectedTeacher, setShowAssignModal, teachers]);

    useEffect(() => {
        setSelectedTeacherIds((previous) => {
            const visibleTeacherIds = new Set(filteredTeachers.map((teacher) => teacher._id));
            const next = new Set();
            previous.forEach((teacherId) => {
                if (visibleTeacherIds.has(teacherId)) {
                    next.add(teacherId);
                }
            });
            return next;
        });
    }, [filteredTeachers]);

    const totalPages = Math.max(1, Math.ceil(filteredTeachers.length / pageSize));
    const paginatedTeachers = useMemo(() => {
        const startIndex = (currentPage - 1) * pageSize;
        return filteredTeachers.slice(startIndex, startIndex + pageSize);
    }, [filteredTeachers, currentPage, pageSize]);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm]);

    useEffect(() => {
        if (currentPage > totalPages) {
            setCurrentPage(totalPages);
        }
    }, [currentPage, totalPages]);

    const copyToClipboard = async (value) => {
        try {
            await navigator.clipboard.writeText(value);
            toast.success(t('teachers:toast.copied'));
        } catch {
            toast.error(t('teachers:toast.copyFailed'));
        }
    };

    const downloadBulkInviteCsv = () => {
        if (!bulkTeacherInviteResults?.created?.length) return;

        const header = 'Teacher Name,Email,Password,Email Sent';
        const rows = bulkTeacherInviteResults.created.map((item) =>
            [
                item.name,
                item.email,
                item.tempPassword,
                item.emailSent ? 'Yes' : 'No'
            ].map((field) => `"${String(field).replace(/"/g, '""')}"`).join(',')
        );

        const csv = [header, ...rows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = 'teacher_login_invites.csv';
        anchor.click();
        URL.revokeObjectURL(url);
        toast.success(t('teachers:toast.csvDownloaded'));
    };

    const copyAllBulkInvites = () => {
        if (!bulkTeacherInviteResults?.created?.length) return;

        const text = bulkTeacherInviteResults.created
            .map((item) => `${item.name}\t${item.email}\t${item.tempPassword}\t${item.emailSent ? 'sent' : 'failed'}`)
            .join('\n');
        copyToClipboard(text);
    };

    const toggleSelectTeacher = (teacherId) => {
        setSelectedTeacherIds((previous) => {
            const next = new Set(previous);
            if (next.has(teacherId)) {
                next.delete(teacherId);
            } else {
                next.add(teacherId);
            }
            return next;
        });
    };

    const toggleSelectAllTeachers = () => {
        setSelectedTeacherIds((previous) => {
            const allVisibleSelected = paginatedTeachers.length > 0
                && paginatedTeachers.every((teacher) => previous.has(teacher._id));

            if (allVisibleSelected) {
                const next = new Set(previous);
                paginatedTeachers.forEach((teacher) => next.delete(teacher._id));
                return next;
            }

            const next = new Set(previous);
            paginatedTeachers.forEach((teacher) => next.add(teacher._id));
            return next;
        });
    };

    const handleSendTeacherInvite = async (teacher) => {
        if (!teacher?._id) return;

        setSendingInviteTeacherId(teacher._id);
        const result = await dispatch(sendTeacherLoginInvite(teacher._id));
        setSendingInviteTeacherId(null);

        if (sendTeacherLoginInvite.fulfilled.match(result)) {
            const teacherName = `${teacher.user?.firstName || ''} ${teacher.user?.lastName || ''}`.trim();
            const inviteResult = {
                ...result.payload.data,
                teacherName: teacherName || teacher.employeeId || teacher._id
            };

            setTeacherInviteResult(inviteResult);
            dispatch(fetchTeachers({ limit: 0 }));

            if (inviteResult.emailSent) {
                toast.success(t('teachers:toast.inviteSent'));
            } else {
                toast.error(result.payload.message || t('teachers:toast.invitePreparedWithIssues'));
            }
            return;
        }

        toast.error(result.payload || t('teachers:toast.inviteFailed'));
    };

    const handleBulkSendTeacherInvites = async () => {
        const teacherIds = Array.from(selectedTeacherIds);
        if (teacherIds.length === 0) {
            toast.error(t('teachers:actions.selectTeachersFirst'));
            return;
        }

        setBulkInviteLoading(true);
        const result = await dispatch(bulkSendTeacherLoginInvites(teacherIds));
        setBulkInviteLoading(false);

        if (bulkSendTeacherLoginInvites.fulfilled.match(result)) {
            setBulkTeacherInviteResults(result.payload.data);
            setSelectedTeacherIds(new Set());
            dispatch(fetchTeachers({ limit: 0 }));

            const createdCount = result.payload.data.created?.length || 0;
            const errorCount = result.payload.data.errors?.length || 0;

            if (errorCount > 0 && createdCount > 0) {
                toast(result.payload.message || t('teachers:toast.bulkInvitesCompletedWithIssues'));
            } else if (errorCount > 0) {
                toast.error(result.payload.message || t('teachers:toast.bulkInvitesFailed'));
            } else {
                toast.success(t('teachers:toast.bulkInvitesSent'));
            }
            return;
        }

        toast.error(result.payload || t('teachers:toast.bulkInvitesFailed'));
    };

    const handleCreateTeacher = async (event) => {
        event.preventDefault();
        setSubmitting(true);
        try {
            const result = await dispatch(createTeacher({
                ...formData,
                department: formData.department || null
            }));
            if (createTeacher.fulfilled.match(result)) {
                toast.success(t('teachers:toast.created'));
                dispatch(fetchSchoolFeatures());
                handleCloseCreateModal();
            } else {
                toast.error(result.payload || t('teachers:toast.createFailed'));
            }
        } finally {
            setSubmitting(false);
        }
    };

    const handleEditTeacher = (teacher) => {
        setEditingTeacher(teacher);
        setFormData(mapTeacherToFormData(teacher));
        setShowEditModal(true);
    };

    const handleUpdateTeacher = async (event) => {
        event.preventDefault();
        if (!editingTeacher?._id) return;

        setSubmitting(true);
        try {
            const result = await dispatch(updateTeacher({
                id: editingTeacher._id,
                teacherData: { ...formData, department: formData.department || null }
            }));

            if (updateTeacher.fulfilled.match(result)) {
                toast.success(t('teachers:toast.updated'));
                handleCloseEditModal();
            } else {
                toast.error(result.payload || t('teachers:toast.updateFailed'));
            }
        } finally {
            setSubmitting(false);
        }
    };

    const handleDeleteTeacher = async (teacher) => {
        if (!window.confirm(t('teachers:confirm.deleteTeacher', { name: `${teacher.user?.firstName || ''} ${teacher.user?.lastName || ''}`.trim() }))) {
            return;
        }

        try {
            const result = await dispatch(deleteTeacher(teacher._id));
            if (deleteTeacher.fulfilled.match(result)) {
                toast.success(t('teachers:toast.deleted'));
                dispatch(fetchSchoolFeatures());
                if (selectedTeacher?._id === teacher._id) {
                    handleCloseAssignModal();
                }
                setSelectedTeacherIds((previous) => {
                    const next = new Set(previous);
                    next.delete(teacher._id);
                    return next;
                });
            } else {
                toast.error(result.payload || t('teachers:toast.deleteFailed'));
            }
        } catch {
            toast.error(t('teachers:toast.deleteFailed'));
        }
    };

    const handleOpenAssignModal = (teacher) => {
        setSelectedTeacher(teacher);
        resetAssignments();
        setShowAssignModal(true);
    };

    const handleOpenCreateModal = () => {
        setEditingTeacher(null);
        resetFormData();
        setShowModal(true);
    };

    const handleCloseCreateModal = () => {
        setShowModal(false);
        resetFormData();
    };

    const handleCloseEditModal = () => {
        setShowEditModal(false);
        setEditingTeacher(null);
        resetFormData();
    };

    const handleCloseAssignModal = () => {
        setShowAssignModal(false);
        setSelectedTeacher(null);
        resetAssignments();
    };

    const handleRemoveExistingAssignment = async (assignmentId) => {
        if (!selectedTeacher?._id) return;

        if (!window.confirm(t('teachers:confirm.removeAssignment'))) {
            return;
        }

        setSubmitting(true);
        try {
            const result = await dispatch(removeClassFromTeacher({
                teacherId: selectedTeacher._id,
                assignmentId
            }));

            if (removeClassFromTeacher.fulfilled.match(result)) {
                if (result.payload?.teacher) {
                    setSelectedTeacher(result.payload.teacher);
                }
                toast.success(t('teachers:toast.assignmentRemoved'));
                dispatch(fetchClasses());
            } else {
                toast.error(result.payload || t('teachers:toast.assignmentRemoveFailed'));
            }
        } finally {
            setSubmitting(false);
        }
    };

    const handleAssignClasses = async (event) => {
        event.preventDefault();

        const validAssignments = assignments.filter((assignment) => assignment.classId && assignment.subjectId);
        if (validAssignments.length === 0) {
            toast.error(t('teachers:toast.selectClassAndSubject'));
            return;
        }

        if (!selectedTeacher?._id) return;

        setSubmitting(true);
        try {
            const result = await dispatch(assignMultipleClassesToTeacher({
                teacherId: selectedTeacher._id,
                assignments: validAssignments
            }));

            if (assignMultipleClassesToTeacher.fulfilled.match(result)) {
                toast.success(t('teachers:toast.assigned'));
                handleCloseAssignModal();
                dispatch(fetchClasses());
            } else {
                toast.error(result.payload || t('teachers:toast.assignFailed'));
            }
        } finally {
            setSubmitting(false);
        }
    };

    const handleTriggerTeacherImport = () => {
        importInputRef.current?.click();
    };

    const handleDownloadTeacherTemplate = async () => {
        try {
            await importTemplateService.downloadEntityTemplate('teachers');
        } catch (error) {
            toast.error(error?.response?.data?.message || t('teachers:toast.importFailed'));
        }
    };

    const handleTeacherImportFileChange = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;

        if (!file.name.toLowerCase().endsWith('.csv')) {
            toast.error(t('teachers:toast.selectCsv'));
            return;
        }

        const { rows, errors } = await parseCsvFile(file, {
            requiredColumns: ['firstName', 'lastName', 'email']
        });
        if (errors.length > 0) {
            toast.error(errors[0]);
            return;
        }
        if (rows.length === 0) {
            toast.error(t('teachers:toast.noValidRows'));
            return;
        }

        try {
            const response = await teacherService.importTeachers(rows);
            const imported = response?.summary?.importedRows ?? response?.data?.imported ?? 0;
            const failed = response?.summary?.failedRows ?? response?.data?.failed ?? 0;
            const skipped = response?.summary?.skippedRows ?? response?.data?.skipped ?? 0;
            toast.success(response?.message || t('teachers:toast.imported', { count: imported }));
            if (failed > 0) {
                toast.error(t('teachers:toast.importFailedRows', { count: failed }));
            } else if (skipped > 0) {
                toast(t('teachers:toast.importSkippedRows', { count: skipped }));
            }
            dispatch(fetchTeachers({ limit: 0 }));
            dispatch(fetchSchoolFeatures());
        } catch (importError) {
            const responseData = importError?.response?.data || {};
            const failed = responseData?.summary?.failedRows ?? responseData?.data?.failed ?? 0;
            const skipped = responseData?.summary?.skippedRows ?? responseData?.data?.skipped ?? 0;
            const rowErrors = responseData?.errors || responseData?.data?.errors || [];

            toast.error(responseData?.message || t('teachers:toast.importFailed'));

            if (failed > 0 && rowErrors.length > 0) {
                const firstError = rowErrors[0];
                const field = firstError?.field ? `${firstError.field}: ` : '';
                toast.error(t('teachers:toast.importRowError', {
                    row: firstError?.row || '?',
                    field,
                    message: firstError?.message || t('teachers:toast.importValidationFailed')
                }));
            } else if (failed === 0 && skipped > 0) {
                toast(t('teachers:toast.importSkippedRows', { count: skipped }));
            }
        }
    };

    return (
        <div className="teachers-page">
            <input
                ref={importInputRef}
                type="file"
                accept=".csv"
                style={{ display: 'none' }}
                onChange={handleTeacherImportFileChange}
            />

            <TeachersHeader
                canManageTeachers={canManageTeachers}
                onCreateTeacher={handleOpenCreateModal}
                onImportTeachers={handleTriggerTeacherImport}
                onDownloadTemplate={handleDownloadTeacherTemplate}
                onBulkSendInvites={handleBulkSendTeacherInvites}
                selectedCount={selectedTeacherIds.size}
                bulkInviteLoading={bulkInviteLoading}
                templateMeta={templateMeta}
                importDisabled={teacherCapacity.isFull}
                createDisabled={teacherCapacity.isFull}
                capacityTitle={t('teachers:capacity.planFull')}
            />

            {showCapacityBanner && (
                <div className={`teachers-capacity-banner ${teacherCapacity.isFull ? 'full' : ''}`}>
                    {teacherCapacity.isLimited ? (
                        <>
                            <strong>{t('teachers:capacity.title')}</strong>
                            <span>
                                {t('teachers:capacity.summary', {
                                    current: teacherCapacity.currentTeachers,
                                    max: teacherCapacity.maxTeachers,
                                    remaining: teacherCapacity.remainingSeats
                                })}
                            </span>
                        </>
                    ) : (
                        <span>
                            {t('teachers:capacity.unlimitedSummary', {
                                current: teacherCapacity.currentTeachers
                            })}
                        </span>
                    )}
                </div>
            )}

            <TeachersFilters
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
            />

            <TeachersTable
                loading={loading}
                teachers={paginatedTeachers}
                canManageTeachers={canManageTeachers}
                selectedTeacherIds={selectedTeacherIds}
                isAllTeachersSelected={
                    paginatedTeachers.length > 0
                    && paginatedTeachers.every((teacher) => selectedTeacherIds.has(teacher._id))
                }
                toggleSelectAllTeachers={toggleSelectAllTeachers}
                toggleSelectTeacher={toggleSelectTeacher}
                onView={(teacher) => navigate(`/portal/teachers/${teacher._id}`)}
                onEdit={handleEditTeacher}
                onAssign={handleOpenAssignModal}
                onDelete={handleDeleteTeacher}
                onSendInvite={handleSendTeacherInvite}
                sendingInviteTeacherId={sendingInviteTeacherId}
            />
            <TablePagination
                page={currentPage}
                pageSize={pageSize}
                totalItems={filteredTeachers.length}
                totalPages={totalPages}
                onPageChange={(nextPage) => setCurrentPage(Math.max(1, Math.min(nextPage, totalPages)))}
                onPageSizeChange={(nextSize) => {
                    setPageSize(nextSize);
                    setCurrentPage(1);
                }}
            />

            <TeacherFormModal
                open={showModal}
                mode="create"
                formData={formData}
                setFormData={setFormData}
                departments={departments}
                subjects={subjects}
                submitting={submitting}
                onClose={handleCloseCreateModal}
                onSubmit={handleCreateTeacher}
            />

            <TeacherFormModal
                open={showEditModal && !!editingTeacher}
                mode="edit"
                formData={formData}
                setFormData={setFormData}
                departments={departments}
                subjects={subjects}
                submitting={submitting}
                onClose={handleCloseEditModal}
                onSubmit={handleUpdateTeacher}
            />

            <TeacherAssignmentsModal
                open={showAssignModal && !!selectedTeacher}
                selectedTeacher={selectedTeacher}
                assignments={assignments}
                classes={classes}
                subjects={subjects}
                submitting={submitting}
                onClose={handleCloseAssignModal}
                onSubmit={handleAssignClasses}
                onAddAssignmentRow={addAssignmentRow}
                onRemoveAssignmentRow={removeAssignmentRow}
                onAssignmentChange={updateAssignmentField}
                onRemoveExistingAssignment={handleRemoveExistingAssignment}
            />

            <TeacherInviteModal
                open={!!teacherInviteResult}
                inviteResult={teacherInviteResult}
                onClose={() => setTeacherInviteResult(null)}
                copyToClipboard={copyToClipboard}
            />

            <BulkTeacherInviteModal
                open={!!bulkTeacherInviteResults}
                inviteResults={bulkTeacherInviteResults}
                onClose={() => setBulkTeacherInviteResults(null)}
                downloadCsv={downloadBulkInviteCsv}
                copyAll={copyAllBulkInvites}
            />
        </div>
    );
};

export default TeachersPage;
