import { useEffect, useMemo, useState } from "react";
import { HiOutlineCheckCircle, HiOutlineExclamation, HiOutlineRefresh, HiOutlineDownload } from "react-icons/hi";
import "./TeacherAttendancePage.css";
import attendanceService from "../../services/attendanceService";
import studentService    from "../../services/studentService";

import AttendanceStatsGrid    from "./components/AttendanceStatsGrid";
import AttendanceStatusChart  from "./components/AttendanceStatusChart";
import AttendanceViewControls from "./components/AttendanceViewControls";
import AttendanceCardList     from "./components/AttendanceCardList";
import AttendanceRecordModal  from "./components/AttendanceRecordModal";
import AttendanceDetailsModal from "./components/AttendanceDetailsModal";

import {
  getDateRange, buildSelectOptions, getRoomLabel,
} from "./attendanceUtils";

// ─── Page ────────────────────────────────────────────────────────────
const TeacherAttendancePage = () => {
  const [attendanceData,    setAttendanceData]    = useState([]);
  const [missedSchedules,   setMissedSchedules]   = useState([]);
  const [loading,           setLoading]           = useState(false);
  const [saving,            setSaving]            = useState(false);
  const [error,             setError]             = useState(null);
  const [success,           setSuccess]           = useState(null);
  const [currentDate,       setCurrentDate]       = useState(new Date());
  const [selectedSchedule,  setSelectedSchedule]  = useState(null);
  const [selectedRecord,    setSelectedRecord]    = useState(null);
  const [showAttendanceModal,setShowAttendanceModal] = useState(false);
  const [showDetailsModal,  setShowDetailsModal]  = useState(false);
  const [viewMode,          setViewMode]          = useState("today");
  const [searchQuery,       setSearchQuery]       = useState("");
  const [filters,           setFilters]           = useState({ class: "", subject: "", status: "" });
  const [students,          setStudents]          = useState([]);
  const [studentAttendance, setStudentAttendance] = useState({});

  // ── Fetch ──
   useEffect(() => { fetchAttendanceData(); }, [currentDate, viewMode]); // fetchAttendanceData is stable within render

  const fetchAttendanceData = async () => {
    try {
      setLoading(true); setError(null);
      const { startDate, endDate } = getDateRange(currentDate, viewMode);
      const response = await attendanceService.getTeacherAttendance({
        startDate: startDate.toISOString(), endDate: endDate.toISOString(), viewMode,
      });
      setAttendanceData(response?.attendanceRecords || []);
      setMissedSchedules(response?.missedSchedules  || []);
    } catch (err) {
      setError(err?.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Derived data ──
  const mergedItems = useMemo(() => {
    const recordedItems = attendanceData.map((record) => {
      const schedule   = record.schedule  || null;
      const classInfo  = record.class     || schedule?.class   || null;
      const subjectInfo= record.subject   || schedule?.subject || null;
      const periodName = record.period?.name || "";
      return {
        id:              `record-${record._id}`,
        isRecorded:      true,
        title:           schedule?.title || [classInfo?.name, subjectInfo?.name || periodName].filter(Boolean).join(" • ") || "Attendance Record",
        classId:         classInfo?._id  || "",
        className:       classInfo?.name || "Unknown class",
        subjectId:       subjectInfo?._id || "",
        subjectName:     subjectInfo?.name || periodName || "Unknown subject",
        room:            getRoomLabel(record.room || schedule?.room) || "N/A",
        startTime:       record.startTime || schedule?.startTime || record.date,
        endTime:         record.endTime   || schedule?.endTime   || record.date,
        totalStudents:   record.totalStudents || 0,
        present:         record.present   || 0,
        absent:          record.absent    || 0,
        late:            record.late      || 0,
        excused:         record.excused   || 0,
        attendanceRate:  Number(record.attendanceRate || 0),
        rawRecord:       record,
      };
    });

    const pendingItems = missedSchedules.map((schedule) => {
      const classInfo   = schedule.class   || null;
      const subjectInfo = schedule.subject || null;
      return {
        id:            `pending-${schedule._id}`,
        isRecorded:    false,
        title:         schedule.title || [classInfo?.name, subjectInfo?.name].filter(Boolean).join(" • ") || "Scheduled class",
        classId:       classInfo?._id  || "",
        className:     classInfo?.name || "Unknown class",
        subjectId:     subjectInfo?._id || "",
        subjectName:   subjectInfo?.name || "Unknown subject",
        room:          getRoomLabel(schedule.room) || "N/A",
        startTime:     schedule.startTime,
        endTime:       schedule.endTime,
        totalStudents: 0, present: 0, absent: 0, late: 0, excused: 0, attendanceRate: 0,
        rawSchedule:   schedule,
      };
    });

    return [...recordedItems, ...pendingItems].sort(
      (a, b) => new Date(a.startTime || 0) - new Date(b.startTime || 0),
    );
  }, [attendanceData, missedSchedules]);

  const classOptions   = useMemo(() => buildSelectOptions(mergedItems, "classId",   "className"),   [mergedItems]);
  const subjectOptions = useMemo(() => buildSelectOptions(mergedItems, "subjectId", "subjectName"), [mergedItems]);

  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return mergedItems.filter((item) => {
      if (filters.class   && item.classId   !== filters.class)   return false;
      if (filters.subject && item.subjectId !== filters.subject) return false;
      if (filters.status === "recorded" && !item.isRecorded)     return false;
      if (filters.status === "pending"  &&  item.isRecorded)     return false;
      if (!query) return true;
      return `${item.title} ${item.className} ${item.subjectName} ${item.room}`.toLowerCase().includes(query);
    });
  }, [filters, mergedItems, searchQuery]);

  const stats = useMemo(() => {
    const recorded      = filteredItems.filter((i) => i.isRecorded);
    const totalStudents = recorded.reduce((sum, i) => sum + (i.totalStudents || 0), 0);
    const totalPresent  = recorded.reduce((sum, i) => sum + (i.present  || 0), 0);
    const totalLate     = recorded.reduce((sum, i) => sum + (i.late     || 0), 0);
    const totalAbsent   = recorded.reduce((sum, i) => sum + (i.absent   || 0), 0);
    const totalExcused  = recorded.reduce((sum, i) => sum + (i.excused  || 0), 0);
    const overallRate   = totalStudents > 0 ? (((totalPresent + totalLate) / totalStudents) * 100).toFixed(1) : "0.0";
    return {
      totalClasses:    filteredItems.length,
      recordedClasses: recorded.length,
      pendingClasses:  filteredItems.length - recorded.length,
      totalStudents, totalPresent, totalAbsent, totalLate, totalExcused, overallRate,
    };
  }, [filteredItems]);

  // ── Handlers ──
  const navigateDate = (direction) => {
    const next = new Date(currentDate);
    if (viewMode === "today") next.setDate(next.getDate() + (direction === "prev" ? -1 : 1));
    else if (viewMode === "week") next.setDate(next.getDate() + (direction === "prev" ? -7 : 7));
    else next.setMonth(next.getMonth() + (direction === "prev" ? -1 : 1));
    setCurrentDate(next);
  };

  const handleRecordAttendance = async (schedule) => {
    if (!schedule?._id || !schedule?.class?._id) return;
    setSelectedSchedule(schedule); setStudents([]); setStudentAttendance({});
    setShowAttendanceModal(true);  setError(null);  setSuccess(null);
    try {
      const response = await studentService.getStudentsByClass(schedule.class._id);
      const list = response?.data?.students || [];
      setStudents(list);
      const initial = {};
      list.forEach((student) => { initial[student._id] = "present"; });
      setStudentAttendance(initial);
    } catch (err) {
      setError(err?.response?.data?.message || err.message);
    }
  };

  const handleSaveAttendance = async () => {
    if (!selectedSchedule?._id) return;
    try {
      setSaving(true); setError(null);
      await attendanceService.createOrUpdateAttendance({
        scheduleId: selectedSchedule._id,
        studentAttendance: students.map((student) => ({
          student: student._id,
          status:  studentAttendance[student._id] || "present",
        })),
      });
      setSuccess("Attendance saved successfully.");
      setShowAttendanceModal(false);
      await fetchAttendanceData();
    } catch (err) {
      setError(err?.response?.data?.message || err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    try {
      setError(null);
      const { startDate, endDate } = getDateRange(currentDate, viewMode);
      const blob = await attendanceService.exportAttendanceData({
        startDate: startDate.toISOString(), endDate: endDate.toISOString(), format: "csv",
      });
      const url  = window.URL.createObjectURL(new Blob([blob], { type: "text/csv" }));
      const link = document.createElement("a");
      link.href  = url;
      link.download = `attendance_${startDate.toISOString().slice(0, 10)}_${endDate.toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link); link.click(); link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err?.response?.data?.message || err.message);
    }
  };

  // ── Loading / error fullscreen states ──
  if (loading) {
    return (
      <div className="attendance-loading">
        <div className="spinner" />
        <p>Loading attendance data...</p>
      </div>
    );
  }
  if (error && !showAttendanceModal && !showDetailsModal) {
    return (
      <div className="attendance-error">
        <HiOutlineExclamation size={48} />
        <h3>Error loading attendance</h3>
        <p>{error}</p>
        <button onClick={fetchAttendanceData} className="btn btn-primary">Retry</button>
      </div>
    );
  }

  // ── Render ──
  return (
    <div className="teacher-attendance-page">
      {/* Header */}
      <div className="page-header">
        <div className="header-content">
          <h1>Attendance Management</h1>
          <p>Track attendance, fill gaps, and keep classroom records current.</p>
        </div>
        <div className="header-actions">
          <button className="btn btn-secondary" onClick={fetchAttendanceData}>
            <HiOutlineRefresh size={20} /> Refresh
          </button>
          <button className="btn btn-secondary" onClick={handleExport}>
            <HiOutlineDownload size={20} /> Export
          </button>
        </div>
      </div>

      {success && (
        <div className="feedback-banner feedback-success">
          <HiOutlineCheckCircle size={18} />
          <span>{success}</span>
        </div>
      )}

      <AttendanceStatsGrid stats={stats} />
      <AttendanceStatusChart stats={stats} />
      <AttendanceViewControls
        viewMode={viewMode}     setViewMode={setViewMode}
        currentDate={currentDate} onNavigate={navigateDate}
        searchQuery={searchQuery} setSearchQuery={setSearchQuery}
        filters={filters}         setFilters={setFilters}
        classOptions={classOptions} subjectOptions={subjectOptions}
      />
      <AttendanceCardList
        items={filteredItems}
        onViewDetails={(record) => { setSelectedRecord(record); setShowDetailsModal(true); }}
        onRecordAttendance={handleRecordAttendance}
      />

      {showAttendanceModal && selectedSchedule && (
        <AttendanceRecordModal
          schedule={selectedSchedule}
          students={students}
          studentAttendance={studentAttendance}
          setStudentAttendance={setStudentAttendance}
          error={error}
          saving={saving}
          onSave={handleSaveAttendance}
          onClose={() => setShowAttendanceModal(false)}
        />
      )}

      {showDetailsModal && selectedRecord && (
        <AttendanceDetailsModal
          record={selectedRecord}
          onClose={() => setShowDetailsModal(false)}
        />
      )}
    </div>
  );
};

export default TeacherAttendancePage;
