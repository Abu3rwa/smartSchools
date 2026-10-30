import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";
import { useTranslation } from "react-i18next";
import { useTheme, useMediaQuery, Tooltip } from "@mui/material";
import { selectUser } from "../../store/slices/authSlice";
import { fetchMessageThreads } from "../../api/messagesApi";
import {
  selectSidebarOpen,
  toggleSidebar,
  setSidebarOpen,
  selectAppName,
} from "../../store/slices/uiSlice";
import { selectSchoolFeatures } from "../../store/slices/schoolFeaturesSlice";
import { fetchSubPendingCountThunk } from "../../store/slices/substitutionsSlice";
import { PERMISSIONS } from "../../constants/permissions";
import {
  HiOutlineHome,
  HiOutlineBell,
  HiOutlineChatBubbleLeftRight,
  HiOutlineEnvelope,
  HiOutlineCalendarDays,
  HiOutlineClock,
  HiOutlineUserCircle,
  HiOutlineRectangleGroup,
  HiOutlineUsers,
  HiOutlineArrowPathRoundedSquare,
  HiOutlineDocumentText,
  HiOutlinePencilSquare,
  HiOutlinePlusCircle,
  HiOutlineTableCells,
  HiOutlineCheckBadge,
  HiOutlineLink,
  HiOutlineChartBar,
  HiOutlineBookOpen,
  HiOutlineLifebuoy,
  HiOutlineSparkles,
  HiOutlineArrowTrendingUp,
  HiOutlineNewspaper,
  HiOutlineDocumentCheck,
  HiOutlineAdjustmentsHorizontal,
  HiOutlinePrinter,
  HiOutlineDocumentChartBar,
  HiOutlineCalendar,
  HiOutlineInboxArrowDown,
  HiOutlineTicket,
  HiOutlineMegaphone,
  HiOutlineUserPlus,
  HiOutlineFaceSmile,
  HiOutlineChartPie,
  HiOutlineIdentification,
  HiOutlineTag,
  HiOutlineBuildingOffice,
  HiOutlineCreditCard,
  HiOutlineCommandLine,
  HiOutlineAcademicCap,
  HiOutlineClipboardDocumentCheck,
  HiOutlineCheckCircle,
  HiOutlineStar,
  HiOutlineRectangleStack,
  HiOutlineArrowPath,
  HiOutlineCog6Tooth,
  HiOutlineChevronLeft,
  HiOutlineChevronRight,
  HiOutlineBars3,
  HiOutlineLockClosed,
  HiOutlinePresentationChartBar,
  HiOutlineBanknotes,
  HiOutlineCalculator,
  HiOutlineReceiptPercent,
  HiOutlineDocumentCurrencyDollar,
  HiOutlineUserGroup,
  HiOutlineBriefcase,
  HiOutlineSparkles as HiOutlinePLP,
  HiOutlineMagnifyingGlass,
  HiOutlineXMark,
  HiOutlineChevronDown,
} from "react-icons/hi2";
import "./Sidebar.css";

const SECTION_TONES = {
  overview: "tone-blue",
  communication: "tone-cyan",
  teaching: "tone-purple",
  assessment: "tone-pink",
  support: "tone-red",
  operations: "tone-teal",
  finance: "tone-green",
  tutoring: "tone-amber",
  hr: "tone-indigo",
  plp: "tone-amber",
  insights: "tone-orange",
  admin: "tone-indigo",
  account: "tone-cyan",
};

const COLLAPSED_SECTIONS_KEY = "sidebar.collapsedSections";

const readCollapsedSections = () => {
  try {
    const stored = JSON.parse(localStorage.getItem(COLLAPSED_SECTIONS_KEY));
    return Array.isArray(stored)
      ? stored.filter((key) => typeof key === "string")
      : [];
  } catch {
    return [];
  }
};

const isActiveNavItem = (item, pathname) =>
  item.end
    ? pathname === item.path
    : pathname === item.path || pathname.startsWith(`${item.path}/`);

const Sidebar = () => {
  const dispatch = useDispatch();
  const location = useLocation();
  const { t, i18n } = useTranslation(["layout.sidebar"]);
  const user = useSelector(selectUser);
  const sidebarOpen = useSelector(selectSidebarOpen);
  const appName = useSelector(selectAppName);
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up("md"));
  const isAdmin = user?.role === "admin";
  const isTeacher = user?.role === "teacher";
  const isStudent = user?.role === "student";
  const schoolFeatures = useSelector(selectSchoolFeatures);
  const [messageUnreadCount, setMessageUnreadCount] = useState(0);
  const isRtl = i18n.dir() === "rtl";
  const [searchInput, setSearchInput] = useState({
    path: location.pathname,
    value: "",
  });
  const [collapsedSections, setCollapsedSections] = useState(
    readCollapsedSections,
  );
  const searchInputRef = useRef(null);

  // A navigation clears the filter without an extra state update
  const searchQuery =
    searchInput.path === location.pathname ? searchInput.value.trim() : "";
  const updateSearchQuery = (value) =>
    setSearchInput({ path: location.pathname, value });

  const canSeeMessages = useMemo(() => {
    return ["admin", "teacher", "department_principal", "staff"].includes(
      user?.role,
    );
  }, [user?.role]);
  const displayUnreadCount = canSeeMessages ? messageUnreadCount : 0;

  // Helper function to check if user has permission
  const hasPermission = (permission) => {
    if (!user) return false;
    // Super admin and admin have all permissions
    if (user.role === "super_admin" || user.role === "admin") return true;
    // Check if user has the permission
    return user.permissions?.includes(permission) ?? false;
  };

  // Close drawer on mobile only when route changes (not when opening)
  const prevPathRef = useRef(location.pathname);
  useEffect(() => {
    if (!isDesktop && prevPathRef.current !== location.pathname) {
      prevPathRef.current = location.pathname;
      dispatch(setSidebarOpen(false));
    } else {
      prevPathRef.current = location.pathname;
    }
  }, [location.pathname, isDesktop, dispatch]);

  useEffect(() => {
    if (!canSeeMessages) {
      return undefined;
    }

    let isMounted = true;

    const loadUnreadCount = async () => {
      try {
        const data = await fetchMessageThreads({ page: 1, limit: 1 });
        if (isMounted) {
          setMessageUnreadCount(data?.unreadCount || 0);
        }
      } catch {
        if (isMounted) {
          setMessageUnreadCount(0);
        }
      }
    };

    loadUnreadCount();
    const intervalId = window.setInterval(loadUnreadCount, 60000);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, [canSeeMessages]);

  useEffect(() => {
    if (!isTeacher) return undefined;

    dispatch(fetchSubPendingCountThunk());
    const intervalId = window.setInterval(() => {
      dispatch(fetchSubPendingCountThunk());
    }, 60000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [dispatch, isTeacher]);

  // Ctrl/Cmd+K or "/" focuses the sidebar filter on desktop
  useEffect(() => {
    if (!isDesktop) return undefined;

    const openSearch = () => {
      if (!sidebarOpen) dispatch(setSidebarOpen(true));
      window.setTimeout(() => searchInputRef.current?.focus(), 0);
    };

    const handleKeyDown = (event) => {
      const active = document.activeElement;
      const isTyping =
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        active?.isContentEditable;

      if (event.ctrlKey || event.metaKey) {
        // leave Ctrl/Cmd+Shift+K (browser devtools) and form fields alone
        if (event.shiftKey || isTyping || event.key.toLowerCase() !== "k")
          return;
        event.preventDefault();
        openSearch();
        return;
      }
      if (event.altKey || event.key !== "/" || isTyping) return;
      event.preventDefault();
      openSearch();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [dispatch, isDesktop, sidebarOpen]);

  const toggleSection = (sectionKey) => {
    const next = collapsedSections.includes(sectionKey)
      ? collapsedSections.filter((key) => key !== sectionKey)
      : [...collapsedSections, sectionKey];
    setCollapsedSections(next);
    try {
      localStorage.setItem(COLLAPSED_SECTIONS_KEY, JSON.stringify(next));
    } catch {
      // Storage can be full or blocked; the in-memory state still works
    }
  };

  const SECTION_ORDER = [
    "overview",
    "communication",
    "teaching",
    "assessment",
    "support",
    "operations",
    "finance",
    "tutoring",
    "hr",
    "plp",
    "insights",
    "admin",
    "account",
  ];

  const navItems = [
    {
      path: "/portal/dashboard",
      icon: HiOutlineHome,
      labelKey: "dashboard",
      section: "overview",
    },
    {
      path: "/portal/notifications",
      icon: HiOutlineBell,
      labelKey: "notifications",
      roles: ["admin", "teacher", "department_principal", "staff"],
      section: "overview",
    },
    {
      path: "/portal/messages",
      icon: HiOutlineChatBubbleLeftRight,
      labelKey: "messages",
      roles: ["admin", "teacher", "department_principal", "staff"],
      section: "communication",
      badgeCount: displayUnreadCount,
    },
    {
      path: "/portal/email-composer",
      icon: HiOutlineEnvelope,
      labelKey: "emailComposer",
      roles: ["admin", "teacher", "department_principal", "staff"],
      permissions: [
        PERMISSIONS.SEND_COMMUNICATION_EMAILS,
        PERMISSIONS.SEND_NOTIFICATIONS,
      ],
      section: "communication",
    },
    // {
    //   path: "/portal/my-schedule",
    //   icon: HiOutlineCalendarDays,
    //   labelKey: "mySchedule",
    //   teacher: true,
    //   section: "teaching",
    // },
    // {
    //   path: "/portal/my-timetable",
    //   icon: HiOutlineClock,
    //   labelKey: "myTimetable",
    //   teacher: true,
    //   section: "teaching",
    // },
    // {
    //   path: "/portal/my-attendance",
    //   icon: HiOutlineUserCircle,
    //   labelKey: "myAttendance",
    //   teacher: true,
    //   section: "teaching",
    // },
    {
      path: "/portal/classes",
      icon: HiOutlineRectangleGroup,
      labelKey: "classes",
      roles: ["admin", "department_principal", "teacher"],
      section: "teaching",
    },
    {
      path: "/portal/students",
      icon: HiOutlineUsers,
      labelKey: "students",
      roles: ["admin", "department_principal", "teacher"],
      section: "teaching",
    },
    {
      path: "/portal/students/promotion-center",
      icon: HiOutlineArrowPathRoundedSquare,
      labelKey: "promotionCenter",
      admin: true,
      section: "assessment",
    },
    {
      path: "/portal/lessons",
      icon: HiOutlineDocumentText,
      labelKey: "lessonPlans",
      roles: ["admin", "department_principal", "teacher"],
      permissions: [
        PERMISSIONS.EDIT_LESSON_PLANS,
        PERMISSIONS.REVIEW_LESSON_PLANS,
      ],
      section: "teaching",
    },
    {
      path: "/portal/assignments",
      icon: HiOutlinePencilSquare,
      labelKey: "assignments",
      roles: ["admin", "department_principal", "teacher"],
      section: "teaching",
    },
    {
      path: "/portal/grades/entry",
      icon: HiOutlinePlusCircle,
      labelKey: "gradeEntry",
      roles: ["admin", "teacher"],
      section: "assessment",
    },
    {
      path: "/portal/gradebook",
      icon: HiOutlineTableCells,
      labelKey: "gradebook",
      roles: ["admin", "teacher", "department_principal"],
      section: "assessment",
    },
    {
      path: "/portal/parent-gradebook",
      icon: HiOutlineAcademicCap,
      labelKey: "myGrades",
      roles: ["parent"],
      feature: "parentGradebook",
      section: "assessment",
    },
    {
      path: "/portal/sbr/reports",
      icon: HiOutlineDocumentChartBar,
      labelKey: "sbrReports",
      roles: ["parent"],
      permissions: [PERMISSIONS.VIEW_SBR_REPORTS],
      section: "assessment",
    },
    {
      path: "/portal/attendance-requests",
      icon: HiOutlineInboxArrowDown,
      labelKey: "attendanceRequests",
      roles: ["parent"],
      section: "operations",
    },
    {
      path: "/portal/parent/timetable",
      icon: HiOutlineCalendarDays,
      labelKey: "parentTimetable",
      roles: ["parent"],
      section: "operations",
    },
    {
      path: "/portal/map-test-prep",
      icon: HiOutlineAcademicCap,
      labelKey: "mapTestPrep",
      roles: ["admin", "teacher"],
      feature: "mapTestPrep",
      section: "assessment",
    },
    {
      path: "/portal/map-test-prep/student",
      icon: HiOutlineAcademicCap,
      labelKey: "mapTestPrep",
      roles: ["student"],
      feature: "mapTestPrep",
      section: "assessment",
    },
    {
      path: "/portal/spelling",
      icon: HiOutlinePencilSquare,
      labelKey: "spelling",
      roles: ["admin", "department_principal", "teacher"],
      section: "assessment",
    },
    {
      path: "/portal/spelling/student",
      icon: HiOutlinePencilSquare,
      labelKey: "spelling",
      roles: ["student"],
      section: "assessment",
    },
    {
      path: "/portal/vocabulary",
      icon: HiOutlineBookOpen,
      labelKey: "vocabulary",
      roles: ["admin", "department_principal", "teacher"],
      section: "assessment",
    },
    {
      path: "/portal/vocabulary/student",
      icon: HiOutlineBookOpen,
      labelKey: "vocabulary",
      roles: ["student"],
      section: "assessment",
    },
    {
      path: "/portal/standards",
      icon: HiOutlineCheckBadge,
      labelKey: "standards",
      roles: ["admin", "teacher", "department_principal"],
      feature: "standardsPractice",
      end: true,
      section: "assessment",
    },
    {
      path: "/portal/grammar-assessments",
      icon: HiOutlineClipboardDocumentCheck,
      labelKey: "grammarAssessments",
      roles: ["admin", "teacher", "department_principal"],
      feature: "standardsPractice",
      section: "assessment",
    },
    // Social Studies — teacher
    // {
    //   path: "/portal/social-studies",
    //   icon: HiOutlineBookOpen,
    //   labelKey: "socialStudies",
    //   roles: ["admin", "teacher", "department_principal"],
    //   feature: "socialStudies",
    //   section: "teaching",
    // },

    // {
    //   path: "/portal/curriculum",
    //   icon: HiOutlineBookOpen,
    //   labelKey: "curriculumPlanning",
    //   roles: ["admin", "teacher", "department_principal"],
    //   permissions: [
    //     PERMISSIONS.VIEW_CURRICULUM_MAPS,
    //     PERMISSIONS.EDIT_CURRICULUM_MAPS,
    //     PERMISSIONS.REVIEW_CURRICULUM_MAPS,
    //     PERMISSIONS.PUBLISH_CURRICULUM_MAPS,
    //     PERMISSIONS.CREATE_CURRICULUM_MAP,
    //     PERMISSIONS.EDIT_OWN_CURRICULUM_MAP,
    //     PERMISSIONS.EDIT_ANY_CURRICULUM_MAP,
    //     PERMISSIONS.REVIEW_CURRICULUM_MAP,
    //     PERMISSIONS.APPROVE_CURRICULUM_MAP,
    //     PERMISSIONS.REJECT_CURRICULUM_MAP,
    //     PERMISSIONS.EXPORT_CURRICULUM_MAP,
    //     PERMISSIONS.PRINT_CURRICULUM_MAP,
    //     PERMISSIONS.CONFIGURE_CURRICULUM_MAP_TEMPLATES,
    //   ],
    //   section: "teaching",
    // },
    // {
    //   path: "/portal/interventions",
    //   icon: HiOutlineLifebuoy,
    //   labelKey: "interventions",
    //   roles: ["admin", "teacher", "department_principal"],
    //   feature: "interventionTracking",
    //   section: "support",
    // },
    // {
    //   path: "/portal/teacher-academic-excellence",
    //   icon: HiOutlineSparkles,
    //   labelKey: "academicExcellenceTeacher",
    //   roles: ["admin", "teacher", "department_principal"],
    //   feature: "academicIntelligence",
    //   section: "insights",
    // },
    {
      path: "/portal/student-grouping",
      icon: HiOutlineRectangleStack,
      labelKey: "studentGrouping",
      roles: ["admin", "teacher", "department_principal"],
      feature: "academicIntelligence",
      section: "insights",
    },
    {
      path: "/portal/admin-academic-excellence",
      icon: HiOutlineArrowTrendingUp,
      labelKey: "academicExcellenceAnalytics",
      roles: ["admin", "department_principal"],
      feature: "academicIntelligence",
      section: "insights",
    },
    {
      path: "/portal/newsletters",
      icon: HiOutlineNewspaper,
      labelKey: "newsletters",
      teacher: true,
      feature: "newsletterCommunication",
      section: "communication",
    },
    {
      path: "/portal/live-lessons",
      icon: HiOutlinePresentationChartBar,
      labelKey: "liveLessons",
      roles: ["admin", "department_principal", "teacher"],
      liveLessons: true,
      section: "teaching",
    },
    {
      path: "/portal/live-lessons/join",
      icon: HiOutlinePresentationChartBar,
      labelKey: "liveLessons",
      roles: ["student"],
      liveLessons: true,
      section: "assessment",
    },
    {
      path: "/portal/newsletters/admin",
      icon: HiOutlineDocumentCheck,
      labelKey: "newslettersReview",
      admin: true,
      feature: "newsletterCommunication",
      section: "communication",
    },
    {
      path: "/portal/newsletters/history",
      icon: HiOutlineNewspaper,
      labelKey: "newsletters",
      roles: ["parent"],
      feature: "newsletterCommunication",
      section: "communication",
    },
    {
      path: "/portal/parent/updates",
      icon: HiOutlineMegaphone,
      labelKey: "parentUpdates",
      roles: ["parent"],
      section: "communication",
    },
    {
      path: "/portal/sbr/config",
      icon: HiOutlineAdjustmentsHorizontal,
      labelKey: "sbrConfig",
      roles: ["admin"],
      permissions: [PERMISSIONS.MANAGE_SBR_SCALES],
      section: "admin",
    },
    // {
    //   path: "/portal/sbr",
    //   icon: HiOutlineDocumentChartBar,
    //   labelKey: "sbrReports",
    //   roles: ["admin", "teacher", "parent"],
    //   permissions: [
    //     PERMISSIONS.GENERATE_SBR_REPORTS,
    //     PERMISSIONS.VIEW_SBR_REPORTS,
    //   ],
    //   section: "assessment",
    // },
    // {
    //   path: "/portal/schedules",
    //   icon: HiOutlineCalendar,
    //   labelKey: "scheduleManagement",
    //   roles: ["admin"],
    //   section: "operations",
    // },
    {
      path: "/portal/timetable",
      icon: HiOutlineClock,
      labelKey: "timetable",
      roles: ["admin", "teacher", "department_principal"],
      section: "operations",
    },
    // {
    //   path: "/portal/school-calendar",
    //   icon: HiOutlineCalendarDays,
    //   labelKey: "schoolCalendar",
    //   roles: ["admin", "department_principal", "teacher"],
    //   permissions: [PERMISSIONS.MANAGE_EVENTS],
    //   section: "operations",
    // },
    // {
    //   path: "/portal/attendance",
    //   icon: HiOutlineUsers,
    //   labelKey: "attendance",
    //   roles: ["admin", "department_principal"],
    //   section: "operations",
    // },
    // {
    //   path: "/portal/attendance-requests",
    //   icon: HiOutlineInboxArrowDown,
    //   labelKey: "attendanceRequests",
    //   roles: ["admin", "department_principal", "teacher", "parent"],
    //   section: "operations",
    // },
    // {
    //   path: "/portal/review-attendance-requests",
    //   icon: HiOutlineTicket,
    //   labelKey: "attendanceTickets",
    //   roles: ["admin", "department_principal"],
    //   section: "operations",
    // },
    // {
    //   path: "/portal/attendance-reminders",
    //   icon: HiOutlineMegaphone,
    //   labelKey: "attendanceReminders",
    //   roles: ["admin"],
    //   section: "operations",
    // },
    // {
    //   path: "/portal/substitutions",
    //   icon: HiOutlineUserPlus,
    //   labelKey: "subRequests",
    //   roles: ["admin", "department_principal", "teacher"],
    //   section: "operations",
    //   badgeCount: isTeacher ? pendingSubCount?.count || 0 : 0,
    // },
    {
      path: "/portal/behavior",
      icon: HiOutlineFaceSmile,
      labelKey: "behaviorManagement",
      roles: ["admin", "department_principal", "teacher"],
      permissions: [PERMISSIONS.MANAGE_BEHAVIOR, PERMISSIONS.VIEW_BEHAVIOR],
      section: "support",
    },
    {
      path: "/portal/support",
      icon: HiOutlineLifebuoy,
      labelKey: "studentSupport",
      roles: ["admin", "teacher"],
      section: "support",
    },
    {
      path: "/portal/parent/support",
      icon: HiOutlineLifebuoy,
      labelKey: "studentSupport",
      roles: ["parent"],
      section: "support",
    },
    {
      path: "/portal/teachers",
      icon: HiOutlineIdentification,
      labelKey: "teachers",
      roles: ["admin", "department_principal"],
      section: "admin",
    },
    {
      path: "/portal/subjects",
      icon: HiOutlineTag,
      labelKey: "subjects",
      roles: ["Admin"],
      section: "teaching",
    },
    {
      path: "/portal/reading/texts",
      icon: HiOutlineRectangleStack,
      labelKey: "reading",
      roles: ["admin", "teacher"],
      feature: "readingAssistant",
      section: "teaching",
    },
    {
      path: "/portal/reading/assignments",
      icon: HiOutlineRectangleStack,
      labelKey: "readingResults",
      roles: ["admin", "teacher"],
      feature: "readingAssistant",
      section: "teaching",
    },
    {
      path: "/portal/writing/assignments",
      icon: HiOutlinePencilSquare,
      labelKey: "writing",
      roles: ["admin", "teacher"],
      feature: "writingAssistant",
      section: "teaching",
    },
    {
      path: "/portal/tutor/students",
      icon: HiOutlineChatBubbleLeftRight,
      labelKey: "tutorConversations",
      roles: ["admin", "teacher"],
      feature: "studentAiTutor",
      section: "teaching",
    },
    {
      path: "/portal/tutor/admin",
      icon: HiOutlineAdjustmentsHorizontal,
      labelKey: "tutorControl",
      roles: ["admin"],
      feature: "studentAiTutor",
      section: "admin",
    },
    {
      path: "/portal/ai-credit",
      icon: HiOutlineCreditCard,
      labelKey: "aiCreditDashboard",
      roles: ["admin"],
      section: "admin",
    },
    {
      path: "/portal/spelling-analysis",
      icon: HiOutlineSparkles,
      labelKey: "spellingAnalysis",
      roles: ["admin"],
      feature: "spellingAnalysis",
      section: "assessment",
    },
    {
      path: "/portal/school-settings",
      icon: HiOutlineBuildingOffice,
      labelKey: "schoolSettings",
      admin: true,
      section: "admin",
    },
    {
      path: "/portal/user-management",
      icon: HiOutlineUsers,
      labelKey: "userManagement",
      roles: ["admin"],
      section: "admin",
    },
    {
      path: "/portal/settings/subscription",
      icon: HiOutlineCreditCard,
      labelKey: "subscription",
      admin: true,
      section: "admin",
    },
    {
      path: "/portal/api-docs",
      icon: HiOutlineCommandLine,
      labelKey: "apiDocumentation",
      admin: true,
      feature: "apiAccess",
      section: "admin",
    },
    {
      path: "/portal/my-grades",
      icon: HiOutlineAcademicCap,
      labelKey: "myGrades",
      roles: ["student"],
      section: "assessment",
    },
    // Social Studies — student
    {
      path: "/portal/social-studies/student",
      icon: HiOutlineBookOpen,
      labelKey: "socialStudiesStudent",
      roles: ["student"],
      feature: "socialStudies",
      section: "assessment",
    },
    {
      path: "/portal/my-assignments",
      icon: HiOutlinePencilSquare,
      labelKey: "assignments",
      roles: ["student"],
      section: "assessment",
    },
    {
      path: "/portal/student-attendance",
      icon: HiOutlineClipboardDocumentCheck,
      labelKey: "myAttendance",
      roles: ["student"],
      section: "operations",
    },
    {
      path: "/portal/practice",
      icon: HiOutlineSparkles,
      labelKey: "practice",
      roles: ["student"],
      section: "assessment",
    },
    {
      path: "/portal/practice/sb-results",
      icon: HiOutlineCheckCircle,
      labelKey: "sbResults",
      roles: ["student"],
      section: "assessment",
    },
    {
      path: "/portal/academic-excellence",
      icon: HiOutlineStar,
      labelKey: "academicExcellence",
      roles: ["student"],
      feature: "academicIntelligence",
      section: "insights",
    },
    {
      path: "/portal/reading",
      icon: HiOutlineRectangleStack,
      labelKey: "reading",
      roles: ["student"],
      feature: "readingAssistant",
      section: "teaching",
    },
    {
      path: "/portal/writing",
      icon: HiOutlinePencilSquare,
      labelKey: "myWriting",
      roles: ["student"],
      feature: "writingAssistant",
      section: "teaching",
    },
    {
      path: "/portal/tutor",
      icon: HiOutlineSparkles,
      labelKey: "aiTutor",
      roles: ["student"],
      feature: "studentAiTutor",
      section: "teaching",
    },
    {
      path: "/portal/revision",
      icon: HiOutlineArrowPath,
      labelKey: "revisionPlans",
      roles: ["admin"],
      feature: "revisionPlanning",
      section: "support",
    },
    {
      path: "/portal/finance",
      icon: HiOutlineBanknotes,
      labelKey: "financeDashboard",
      roles: ["admin"],
      permissions: [
        PERMISSIONS.VIEW_FEE_STRUCTURES,
        PERMISSIONS.VIEW_INVOICES,
        PERMISSIONS.VIEW_FINANCE_REPORTS,
      ],
      section: "finance",
      end: true,
    },
    {
      path: "/portal/finance/fee-structures",
      icon: HiOutlineCalculator,
      labelKey: "feeStructures",
      roles: ["admin"],
      permissions: [
        PERMISSIONS.MANAGE_FEE_STRUCTURES,
        PERMISSIONS.VIEW_FEE_STRUCTURES,
      ],
      section: "finance",
    },
    {
      path: "/portal/finance/discounts",
      icon: HiOutlineReceiptPercent,
      labelKey: "discounts",
      roles: ["admin"],
      permissions: [PERMISSIONS.MANAGE_DISCOUNTS],
      section: "finance",
    },
    {
      path: "/portal/finance/invoices",
      icon: HiOutlineDocumentCurrencyDollar,
      labelKey: "invoices",
      roles: ["admin", "department_principal"],
      permissions: [PERMISSIONS.VIEW_INVOICES, PERMISSIONS.CREATE_INVOICES],
      section: "finance",
    },
    {
      path: "/portal/finance/payments",
      icon: HiOutlineCreditCard,
      labelKey: "payments",
      roles: ["admin"],
      permissions: [PERMISSIONS.RECORD_PAYMENTS],
      section: "finance",
    },
    {
      path: "/portal/finance/reports",
      icon: HiOutlineChartBar,
      labelKey: "financeReports",
      roles: ["admin", "department_principal"],
      permissions: [PERMISSIONS.VIEW_FINANCE_REPORTS],
      section: "finance",
    },
    {
      path: "/portal/finance/session-billing",
      icon: HiOutlineClock,
      labelKey: "sessionBilling",
      roles: ["admin"],
      permissions: [PERMISSIONS.VIEW_FINANCE_REPORTS],
      feature: "liveSessionBilling",
      section: "tutoring",
    },
    {
      path: "/portal/lesson-account",
      icon: HiOutlineBanknotes,
      labelKey: "lessonAccount",
      roles: ["student", "parent"],
      feature: "liveSessionBilling",
      section: "tutoring",
    },
    /*
    // ── HR & Staff Management ──    {
      path: "/portal/hr",
      icon: HiOutlineUserGroup,
      labelKey: "hrDashboard",
      roles: ["admin", "department_principal"],
      permissions: [PERMISSIONS.VIEW_STAFF_PROFILES],
      section: "hr",
    },
    {
      path: "/portal/hr/staff",
      icon: HiOutlineIdentification,
      labelKey: "staffDirectory",
      roles: ["admin", "department_principal"],
      permissions: [PERMISSIONS.VIEW_STAFF_PROFILES],
      section: "hr",
    },
    {
      path: "/portal/hr/leave",
      icon: HiOutlineCalendarDays,
      labelKey: "leaveManagement",
      roles: ["admin", "department_principal"],
      permissions: [PERMISSIONS.APPROVE_LEAVE],
      section: "hr",
    },
    {
      path: "/portal/hr/leave-settings",
      icon: HiOutlineAdjustmentsHorizontal,
      labelKey: "leaveSettings",
      roles: ["admin"],
      permissions: [PERMISSIONS.MANAGE_LEAVE_TYPES],
      section: "hr",
    },
    {
      path: "/portal/hr/certifications",
      icon: HiOutlineAcademicCap,
      labelKey: "certifications",
      roles: ["admin", "department_principal"],
      permissions: [PERMISSIONS.VIEW_CERTIFICATIONS],
      section: "hr",
    },
    {
      path: "/portal/hr/reviews",
      icon: HiOutlineClipboardDocumentCheck,
      labelKey: "performanceReviews",
      roles: ["admin", "department_principal"],
      permissions: [PERMISSIONS.MANAGE_PERFORMANCE_REVIEWS],
      section: "hr",
    },
    {
      path: "/portal/hr/pd",
      icon: HiOutlineBookOpen,
      labelKey: "professionalDevelopment",
      roles: ["admin", "department_principal"],
      permissions: [PERMISSIONS.VIEW_PD_REPORTS],
      section: "hr",
    },
    {
      path: "/portal/hr/my",
      icon: HiOutlineBriefcase,
      labelKey: "myHRProfile",
      roles: ["admin", "teacher", "department_principal", "staff"],
      permissions: [PERMISSIONS.VIEW_OWN_HR_PROFILE],
      section: "hr",
    },
    {
      path: "/portal/hr/settings",
      icon: HiOutlineCog6Tooth,
      labelKey: "hrSettings",
      roles: ["admin"],
      permissions: [PERMISSIONS.MANAGE_HR_SETTINGS],
      section: "hr",
    },
    */
    // ── PLP – Character Development ──
    {
      path: "/portal/plp",
      icon: HiOutlinePLP,
      labelKey: "plp",
      roles: ["admin", "teacher", "department_principal", "student"],
      section: "support",
      end: true,
    },
    {
      path: "/portal/plp/my-tasks",
      icon: HiOutlineCheckCircle,
      labelKey: "plpMyTasks",
      roles: ["student"],
      section: "support",
    },
    {
      path: "/portal/settings",
      icon: HiOutlineCog6Tooth,
      roles: ["admin", "teacher", "department_principal"],
      labelKey: "settings",
      section: "account",
    },
  ];

  const filteredNavItems = navItems.filter((item) => {
    if (
      item.liveLessons &&
      import.meta.env.VITE_LIVE_LESSONS_ENABLED !== "true"
    ) {
      return false;
    }
    if ((item.section || "overview") === "finance") {
      return false;
    }

    // Check role-based access first
    let hasRoleAccess = true;
    if (item.roles) {
      hasRoleAccess = item.roles.includes(user?.role);
    } else if (item.admin && !isAdmin) {
      hasRoleAccess = false;
    } else if (item.teacher && !isTeacher) {
      hasRoleAccess = false;
    } else if (item.student && !isStudent) {
      hasRoleAccess = false;
    }

    // If permissions are specified, check if user has at least one
    if (item.permissions && item.permissions.length > 0) {
      const hasRequiredPermission = item.permissions.some((permission) =>
        hasPermission(permission),
      );
      // User needs either role access OR permission access
      return hasRoleAccess || hasRequiredPermission;
    }

    return hasRoleAccess;
  });

  const matchesSearch = (item) => {
    if (!searchQuery) return true;
    return [
      t(`layout.sidebar:items.${item.labelKey}`),
      t(`layout.sidebar:sections.${item.section || "overview"}`),
      item.path,
    ]
      .join(" ")
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
  };

  // The section holding the open page never auto-collapses
  const activeSectionKeys = new Set(
    filteredNavItems
      .filter((item) => isActiveNavItem(item, location.pathname))
      .map((item) => item.section || "overview"),
  );

  // Group by section (preserve order), only include sections that have items
  const itemsBySection = SECTION_ORDER.reduce((acc, sectionKey) => {
    const items = filteredNavItems.filter(
      (item) =>
        (item.section || "overview") === sectionKey && matchesSearch(item),
    );
    if (items.length > 0) acc.push({ key: sectionKey, items });
    return acc;
  }, []);

  return (
    <aside className={`sidebar ${sidebarOpen ? "open" : "collapsed"}`}>
      {/* Logo */}
      <div className="sidebar-header">
        <div className="logo">
          <div className="logo-icon">
            <img src="/logo.svg" alt="Logo" width={55} height={55} />
          </div>
          {sidebarOpen && <span className="logo-text">{appName}</span>}
        </div>
        <button
          className="toggle-btn"
          onClick={() => dispatch(toggleSidebar())}
          aria-label={
            sidebarOpen
              ? t("layout.sidebar:actions.collapseSidebar")
              : t("layout.sidebar:actions.expandSidebar")
          }
        >
          {sidebarOpen ? (
            isRtl ? (
              <HiOutlineChevronRight size={20} />
            ) : (
              <HiOutlineChevronLeft size={20} />
            )
          ) : (
            <HiOutlineBars3 size={24} />
          )}
        </button>
      </div>

      {/* Filter */}
      {sidebarOpen && (
        <div className="sidebar-search">
          <HiOutlineMagnifyingGlass size={16} />
          <input
            ref={searchInputRef}
            type="text"
            className="sidebar-search-input"
            value={searchQuery}
            onChange={(event) => updateSearchQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Escape") return;
              updateSearchQuery("");
              event.currentTarget.blur();
            }}
            placeholder={t("layout.sidebar:actions.search")}
            aria-label={t("layout.sidebar:actions.search")}
          />
          {searchQuery && (
            <button
              type="button"
              className="sidebar-search-clear"
              onClick={() => updateSearchQuery("")}
              aria-label={t("layout.sidebar:actions.clearSearch")}
            >
              <HiOutlineXMark size={12} />
            </button>
          )}
        </div>
      )}

      {/* Navigation */}
      <nav className="sidebar-nav">
        {itemsBySection.map(({ key: sectionKey, items }, sectionIndex) => {
          const isSectionCollapsed =
            !searchQuery &&
            !activeSectionKeys.has(sectionKey) &&
            collapsedSections.includes(sectionKey);

          return (
            <div
              key={sectionKey}
              className={`sidebar-nav-section ${
                SECTION_TONES[sectionKey] || ""
              } ${isSectionCollapsed ? "sidebar-section-collapsed" : ""}`}
            >
              {sidebarOpen && (
                <button
                  type="button"
                  className="sidebar-section-title"
                  onClick={() => toggleSection(sectionKey)}
                  aria-expanded={!isSectionCollapsed}
                  aria-label={t(
                    isSectionCollapsed
                      ? "layout.sidebar:actions.expandSection"
                      : "layout.sidebar:actions.collapseSection",
                    { section: t(`layout.sidebar:sections.${sectionKey}`) },
                  )}
                >
                  <span>{t(`layout.sidebar:sections.${sectionKey}`)}</span>
                  {!searchQuery && isSectionCollapsed && (
                    <span className="sidebar-section-count">
                      {items.length}
                    </span>
                  )}
                  {!searchQuery && (
                    <HiOutlineChevronDown
                      className="sidebar-section-chevron"
                      size={14}
                    />
                  )}
                </button>
              )}
              {!sidebarOpen && sectionIndex > 0 && (
                <div className="sidebar-section-divider" />
              )}
              {!isSectionCollapsed &&
                items.map((item) => {
                  const isLocked =
                    item.feature && schoolFeatures?.[item.feature] === false;
                  const itemClassName = `nav-item ${isLocked ? "locked" : ""}`;
                  const label = t(`layout.sidebar:items.${item.labelKey}`);

                  const row = (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      end={item.end || false}
                      className={({ isActive }) =>
                        `${itemClassName} ${isActive ? "active" : ""}`
                      }
                    >
                      <item.icon className="nav-icon" size={20} />
                      {sidebarOpen && (
                        <span className="nav-label">{label}</span>
                      )}
                      {isLocked && sidebarOpen && (
                        <HiOutlineLockClosed
                          className="nav-feature-lock"
                          size={14}
                        />
                      )}
                      {/* {isLocked && sidebarOpen && (
                        <span className="nav-badge nav-badge-upgrade">
                          {t("layout.sidebar:actions.upgrade")}
                        </span>
                      )} */}
                      {isLocked && !sidebarOpen && (
                        <span
                          className="nav-lock-dot"
                          aria-label={t("layout.sidebar:actions.featureLocked")}
                        >
                          <HiOutlineLockClosed size={10} />
                        </span>
                      )}
                      {!!item.badgeCount && item.badgeCount > 0 && (
                        <span className="nav-badge">{item.badgeCount}</span>
                      )}
                    </NavLink>
                  );

                  if (sidebarOpen || !isDesktop) return row;

                  return (
                    <Tooltip
                      key={item.path}
                      arrow
                      placement={isRtl ? "left" : "right"}
                      title={`${label} · ${t(
                        `layout.sidebar:sections.${sectionKey}`,
                      )}`}
                    >
                      {row}
                    </Tooltip>
                  );
                })}
            </div>
          );
        })}
        {searchQuery && itemsBySection.length === 0 && (
          <div className="sidebar-empty">
            {t("layout.sidebar:actions.noResults")}
          </div>
        )}
      </nav>

      {/* User info */}
      {/* {sidebarOpen && user && (
        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar">
              {user.firstName?.charAt(0)}
              {user.lastName?.charAt(0)}
            </div>
            <div className="user-details">
              <span className="user-name">
                {user.firstName} {user.lastName}
              </span>
              <span className="user-role">{user.role}</span>
              {user.role === "department_principal" && (
                <span
                  className="scope-badge"
                  title={
                    user.department
                      ? "Viewing only your department"
                      : "Viewing all school data"
                  }
                >
                  {user.department?.name
                    ? `Department: ${user.department.name}`
                    : "Whole-school principal"}
                </span>
              )}
            </div>
          </div>
        </div>
      )} */}
    </aside>
  );
};

export default Sidebar;
