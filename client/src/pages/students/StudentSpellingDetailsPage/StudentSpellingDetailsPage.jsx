import { useEffect, useState } from 'react';
import { Box, Button, FormControl, InputLabel, MenuItem, Select, Stack } from '@mui/material';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import StudentSpellingDetailsSection from '../StudentDetailPage/components/StudentSpellingDetailsSection';
import { fetchClass, selectClassStudents, selectCurrentClass } from '../../../store/slices/classSlice';
import { selectSpelling } from '../../../store/slices/spellingSlice';
import { downloadStudentSpellingDetailsDocx } from '../../../services/spellingDetailsDocxExport';
import StudentSpellingPrintReport from './StudentSpellingPrintReport';

const StudentSpellingDetailsPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const dispatch = useDispatch();
    const { t, i18n } = useTranslation('spelling');
    const { studentDetails, loading } = useSelector(selectSpelling);
    const [printing, setPrinting] = useState(false);
    const [exportingDocx, setExportingDocx] = useState(false);
    const classStudents = useSelector(selectClassStudents);
    const selectedClass = useSelector(selectCurrentClass);
    const classId = studentDetails?.student?.classId;

    useEffect(() => {
        if (classId && String(selectedClass?._id) !== String(classId)) dispatch(fetchClass(classId));
    }, [classId, dispatch, selectedClass?._id]);

    const switcherStudents = String(selectedClass?._id) === String(classId) ? classStudents : [];
    const detailsMatchRoute = String(studentDetails?.student?.id) === String(id);
    const canPrint = detailsMatchRoute && !loading;

    const exportDocx = async () => {
        if (!detailsMatchRoute || loading || exportingDocx) return;
        setExportingDocx(true);
        try {
            await downloadStudentSpellingDetailsDocx({
                studentId: id,
                firstName: studentDetails.student.firstName,
                lastName: studentDetails.student.lastName,
                locale: i18n.resolvedLanguage || i18n.language
            });
        } catch {
            toast.error(t('exportError'));
        } finally {
            setExportingDocx(false);
        }
    };

    const printReport = async () => {
        if (!canPrint || printing) return;
        setPrinting(true);
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const previousTitle = document.title;
        document.title = `${t('spellingReportTitle')} - ${studentDetails.student?.firstName || ''} ${studentDetails.student?.lastName || ''}`.trim();
        try {
            window.print();
        } finally {
            document.title = previousTitle;
            setPrinting(false);
        }
    };

    return (
        <Box sx={{ maxWidth: 1100, mx: 'auto', p: 3 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="space-between" alignItems={{ sm: 'center' }}>
                <Button component={Link} to={`/portal/students/${id}`} variant="outlined" size="small" sx={{ alignSelf: { xs: 'flex-start', sm: 'center' } }}>
                    {t('backToStudent')}
                </Button>
                {switcherStudents.length > 1 && (
                    <FormControl size="small" sx={{ minWidth: 260 }}>
                        <InputLabel>{t('switchStudent')}</InputLabel>
                        <Select
                            value={switcherStudents.some((student) => String(student._id) === String(id)) ? id : ''}
                            label={t('switchStudent')}
                            onChange={(event) => navigate(`/portal/students/${event.target.value}/spelling`)}
                        >
                            {switcherStudents.map((student) => (
                                <MenuItem key={student._id} value={student._id}>{student.firstName} {student.lastName}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                )}
                <Button
                    variant="contained"
                    size="small"
                    disabled={!canPrint || printing || exportingDocx}
                    onClick={printReport}
                >
                    {printing ? t('preparingPrint') : t('exportPdfPrint')}
                </Button>
                <Button
                    variant="outlined"
                    size="small"
                    disabled={!detailsMatchRoute || loading || exportingDocx || printing}
                    onClick={exportDocx}
                >
                    {exportingDocx ? t('exporting') : t('exportWord')}
                </Button>
            </Stack>
            <StudentSpellingDetailsSection studentId={id} />
            {detailsMatchRoute && <StudentSpellingPrintReport details={studentDetails} />}
        </Box>
    );
};

export default StudentSpellingDetailsPage;
