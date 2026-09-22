import {
  HiOutlineBell,
  HiOutlineBookOpen,
  HiOutlineChartBar,
  HiOutlineClipboardList,
  HiOutlineHome,
  HiOutlineLightningBolt,
} from "react-icons/hi";

export const studentNavLinks = [
  {
    path: "/portal/dashboard",
    icon: HiOutlineHome,
    labelKey: "dashboard",
    section: "overview",
  },
  
  // {
  //   path: "/portal/attendance-requests",
  //   icon: HiOutlineClipboardList,
  //   labelKey: "attendanceRequests",
  //   section: "attendance",
  // },
  {
    path: "/portal/my-grades",
    icon: HiOutlineClipboardList,
    labelKey: "myGrades",
    section: "learning",
  },
  {
    path: "/portal/social-studies/student",
    icon: HiOutlineBookOpen,
    labelKey: "socialStudiesStudent",
    feature: "socialStudies",
    section: "learning",
  },
  {
    path: "/portal/my-assignments",
    icon: HiOutlineBookOpen,
    labelKey: "assignments",
    section: "learning",
  },
  {
    path: "/portal/practice",
    icon: HiOutlineLightningBolt,
    labelKey: "practice",
    section: "learning",
  },
  {
    path: "/portal/practice/sb-results",
    icon: HiOutlineChartBar,
    labelKey: "sbResults",
    section: "learning",
  },
  // {
  //   path: "/portal/reading",
  //   icon: HiOutlineBookOpen,
  //   labelKey: "reading",
  //   feature: "readingAssistant",
  //   section: "learning",
  // },
  // {
  //   path: "/portal/settings",
  //   icon: HiOutlineCog,
  //   labelKey: "settings",
  //   section: "account",
  // },
];