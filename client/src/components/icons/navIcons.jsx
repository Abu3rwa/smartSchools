const Svg = ({ size, children, ...rest }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...rest}
  >
    {children}
  </svg>
);

export const NavHome = (props) => (
  <Svg {...props}>
    <path d="M4 10.5 12 4l8 6.5" />
    <path d="M6 9.6V19a1 1 0 0 0 1 1h3.5v-4.5h3V20H17a1 1 0 0 0 1-1V9.6" />
  </Svg>
);

export const NavBell = (props) => (
  <Svg {...props}>
    <path d="M18 9a6 6 0 1 0-12 0c0 4.2-1.5 5.8-2 6h16c-.5-.2-2-1.8-2-6" />
    <path d="M10 19a2 2 0 0 0 4 0" />
  </Svg>
);

export const NavMail = (props) => (
  <Svg {...props}>
    <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
    <path d="M3.5 7.5l8.5 6 8.5-6" />
  </Svg>
);

export const NavUsers = (props) => (
  <Svg {...props}>
    <path d="M15 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20" />
    <circle cx="9" cy="7" r="3.5" />
    <path d="M17 3.7a3.5 3.5 0 0 1 0 6.6" />
    <path d="M21 20v-1.5a4 4 0 0 0-3-3.87" />
  </Svg>
);

export const NavBook = (props) => (
  <Svg {...props}>
    <path d="M12 6.3C10.4 5 8.2 4.3 4.5 4.3V18c3.7 0 5.9.7 7.5 2 1.6-1.3 3.8-2 7.5-2V4.3c-3.7 0-5.9.7-7.5 2Z" />
    <path d="M12 6.3V20" />
  </Svg>
);

export const NavChart = (props) => (
  <Svg {...props}>
    <rect x="4.5" y="12" width="4.5" height="8" rx="1.2" />
    <rect x="9.75" y="7" width="4.5" height="13" rx="1.2" />
    <rect x="15" y="4.5" width="4.5" height="15.5" rx="1.2" />
  </Svg>
);

export const NavChecklist = (props) => (
  <Svg {...props}>
    <rect x="5.5" y="4.5" width="13" height="16.5" rx="2" />
    <rect x="9" y="2.5" width="6" height="4" rx="1.2" />
    <path d="m9.2 13.4 2 2 3.6-4.2" />
  </Svg>
);

export const NavCalendar = (props) => (
  <Svg {...props}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
    <path d="M3.5 9.75h17" />
    <path d="M8 2.75v3.5M16 2.75v3.5" />
    <path d="M7.75 13.5h.01M12 13.5h.01M16.25 13.5h.01M7.75 17h.01M12 17h.01" />
  </Svg>
);

export const NavCog = (props) => (
  <Svg {...props}>
    <path d="M19.8 10.6A7.9 7.9 0 0 1 19.8 13.4L18 13.1A6.1 6.1 0 0 1 17 15.5L18.5 16.5A7.9 7.9 0 0 1 16.5 18.5L15.5 17A6.1 6.1 0 0 1 13.1 18L13.4 19.8A7.9 7.9 0 0 1 10.6 19.8L10.9 18A6.1 6.1 0 0 1 8.5 17L7.5 18.5A7.9 7.9 0 0 1 5.5 16.5L7 15.5A6.1 6.1 0 0 1 6 13.1L4.2 13.4A7.9 7.9 0 0 1 4.2 10.6L6 10.9A6.1 6.1 0 0 1 7 8.5L5.5 7.5A7.9 7.9 0 0 1 7.5 5.5L8.5 7A6.1 6.1 0 0 1 10.9 6L10.6 4.2A7.9 7.9 0 0 1 13.4 4.2L13.1 6A6.1 6.1 0 0 1 15.5 7L16.5 5.5A7.9 7.9 0 0 1 18.5 7.5L17 8.5A6.1 6.1 0 0 1 18 10.9L19.8 10.6Z" />
    <circle cx="12" cy="12" r="2.3" />
  </Svg>
);

export const NavSparkles = (props) => (
  <Svg {...props}>
    <path d="M10.1 4c.6 3.2 1.8 4.4 5 5-3.2.6-4.4 1.8-5 5-.6-3.2-1.8-4.4-5-5 3.2-.6 4.4-1.8 5-5Z" />
    <path d="M16.1 13.5c.35 1.8 1 2.45 2.8 2.8-1.8.35-2.45 1-2.8 2.8-.35-1.8-1-2.45-2.8-2.8 1.8-.35 2.45-1 2.8-2.8Z" />
  </Svg>
);

/* Communication */
export const NavChat = (props) => (
  <Svg {...props}>
    <path d="M4 8a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3h-6l-4 2.5V17a3 3 0 0 1-3-3Z" />
    <path d="M9 10.6h.01M12 10.6h.01M15 10.6h.01" />
  </Svg>
);

export const NavInbox = (props) => (
  <Svg {...props}>
    <path d="M5.2 12.8 6.7 6.9a2 2 0 0 1 1.9-1.5h6.8a2 2 0 0 1 1.9 1.5l1.5 5.9" />
    <path d="M5.2 12.8h3.3a1.3 1.3 0 0 1 1.2.8 2.5 2.5 0 0 0 4.6 0 1.3 1.3 0 0 1 1.2-.8h3.3v3.1a2.2 2.2 0 0 1-2.2 2.2H7.4a2.2 2.2 0 0 1-2.2-2.2Z" />
    <path d="M12 17.5v-3M10.9 15.8l1.1 1.4 1.1-1.4" />
  </Svg>
);

/* People */
export const NavUserCircle = (props) => (
  <Svg {...props}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="9.6" r="2.6" />
    <path d="M7.4 18.2a4.9 4.9 0 0 1 9.2 0" />
  </Svg>
);

export const NavMic = (props) => (
  <Svg {...props}>
    <rect x="9.2" y="3.5" width="5.6" height="10.6" rx="2.8" />
    <path d="M6 11.3a6 6 0 0 0 12 0" />
    <path d="M12 17.3v3.2M9.2 20.5h5.6" />
  </Svg>
);

export const NavIdCard = (props) => (
  <Svg {...props}>
    <rect x="3.5" y="5" width="17" height="14" rx="2" />
    <circle cx="9" cy="10.4" r="2.2" />
    <path d="M5.9 15.6a3.2 3.2 0 0 1 6.2 0" />
    <path d="M14.8 9.8h3.1M14.8 13.4h3.1" />
  </Svg>
);

/* Teaching */
export const NavClasses = (props) => (
  <Svg {...props}>
    <rect x="3.5" y="4.5" width="9" height="6.6" rx="1.8" />
    <rect x="14.5" y="4.5" width="6" height="6.6" rx="1.8" />
    <rect x="3.5" y="13.1" width="17" height="6.6" rx="1.8" />
  </Svg>
);

export const NavRepeat = (props) => (
  <Svg {...props}>
    <path d="M4.5 10.2V8.7A3.2 3.2 0 0 1 7.7 5.5h8.6a3.2 3.2 0 0 1 3.2 3.2v1.5" />
    <path d="M19.5 13.8v1.5a3.2 3.2 0 0 1-3.2 3.2H7.7a3.2 3.2 0 0 1-3.2-3.2v-1.5" />
    <path d="m16.8 7.9 2.7 2.5-2.7 2.5" />
    <path d="m7.2 16.1-2.7-2.5 2.7-2.5" />
  </Svg>
);

export const NavGrad = (props) => (
  <Svg {...props}>
    <path d="M3.5 8.9 12 4.9l8.5 4-8.5 4Z" />
    <path d="M6.8 10.7v4.2c0 1.7 2.3 3 5.2 3s5.2-1.3 5.2-3v-4.2" />
    <path d="M20.5 9v4.6" />
  </Svg>
);

export const NavTable = (props) => (
  <Svg {...props}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <path d="M3.5 9.5h17M3.5 14.5h17M12 9.5v10" />
  </Svg>
);

/* Documents */
export const NavDoc = (props) => (
  <Svg {...props}>
    <path d="M14 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8.5Z" />
    <path d="M13.9 3.6v4.9h4.6" />
    <path d="M9 12.5h6M9 16h4.5" />
  </Svg>
);

export const NavPencil = (props) => (
  <Svg {...props}>
    <path d="M12.4 5H6.5a2 2 0 0 0-2 2v10.5a2 2 0 0 0 2 2H17a2 2 0 0 0 2-2v-6" />
    <path d="M17.5 3.9a1.9 1.9 0 1 1 2.7 2.7l-7.9 7.9-3.6.8.8-3.6Z" />
  </Svg>
);

export const NavPlusCircle = (props) => (
  <Svg {...props}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 8v8M8 12h8" />
  </Svg>
);

export const NavDocChart = (props) => (
  <Svg {...props}>
    <path d="M14 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8.5Z" />
    <path d="M13.9 3.6v4.9h4.6" />
    <path d="M9.2 17.2v-2.6M12 17.2v-4.8M14.8 17.2v-3.6" />
  </Svg>
);

export const NavDocCheck = (props) => (
  <Svg {...props}>
    <path d="M14 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8.5Z" />
    <path d="M13.9 3.6v4.9h4.6" />
    <path d="m9 14.7 2.2 2.2 4-4.5" />
  </Svg>
);

export const NavLayers = (props) => (
  <Svg {...props}>
    <rect x="6.5" y="4.5" width="11" height="4.2" rx="1.6" />
    <rect x="5" y="10.1" width="14" height="4.2" rx="1.6" />
    <rect x="3.5" y="15.7" width="17" height="4.2" rx="1.6" />
  </Svg>
);

export const NavBadgeCheck = (props) => (
  <Svg {...props}>
    <path d="M12 3.5c2.3 1.3 5 2 7.5 2.1v6c0 4-3 7.2-7.5 8.9-4.5-1.7-7.5-4.9-7.5-8.9v-6c2.5-.1 5.2-.8 7.5-2.1Z" />
    <path d="m8.8 11.7 2.2 2.2 4.2-4.6" />
  </Svg>
);

/* Analytics */
export const NavTrend = (props) => (
  <Svg {...props}>
    <path d="M3.5 16.5 9.5 10.5l3.4 3.4 7.1-7.1" />
    <path d="M15.2 6.8h4.8v4.8" />
  </Svg>
);

export const NavNews = (props) => (
  <Svg {...props}>
    <rect x="3.5" y="5" width="17" height="14" rx="2" />
    <rect x="6.5" y="8.2" width="4.6" height="4" rx="1" />
    <path d="M13.6 8.7h3.9M13.6 11.5h3.9M6.5 15.2h11" />
  </Svg>
);

export const NavPresentation = (props) => (
  <Svg {...props}>
    <rect x="3.5" y="4.5" width="17" height="11" rx="2" />
    <path d="M8.5 12.5v-3M12 12.5V7.2M15.5 12.5V9.4" />
    <path d="M12 15.5v2.2M8.8 20.5 12 17.7l3.2 2.8" />
  </Svg>
);

export const NavMegaphone = (props) => (
  <Svg {...props}>
    <path d="M3.5 10.2v3.6a2 2 0 0 0 2 2H8l8.5 4.2a1 1 0 0 0 1.5-.9V4.9a1 1 0 0 0-1.5-.9L8 8.2H5.5a2 2 0 0 0-2 2Z" />
    <path d="M20.6 9.4a4.4 4.4 0 0 1 0 5.2" />
    <path d="M8 15.8v3.1a1.6 1.6 0 0 0 3.2 0v-1.4" />
  </Svg>
);

export const NavSliders = (props) => (
  <Svg {...props}>
    <path d="M4 7.5h16M4 16.5h16" />
    <circle cx="9.5" cy="7.5" r="2" />
    <circle cx="15" cy="16.5" r="2" />
  </Svg>
);

export const NavClock = (props) => (
  <Svg {...props}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.4V12l3.1 2" />
  </Svg>
);

export const NavSmile = (props) => (
  <Svg {...props}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M8.6 14.3a4.2 4.2 0 0 0 6.8 0" />
    <path d="M9.2 9.7h.01M14.8 9.7h.01" />
  </Svg>
);

export const NavCheckCircle = (props) => (
  <Svg {...props}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="m8.3 12.3 2.5 2.5 4.9-5.5" />
  </Svg>
);

export const NavStar = (props) => (
  <Svg {...props}>
    <path d="M12 3.7 14.3 9l5.8.6-4.4 3.8 1.3 5.7-5-3-5 3 1.3-5.7L3.9 9.6 9.7 9Z" />
  </Svg>
);

export const NavRefresh = (props) => (
  <Svg {...props}>
    <path d="M16 9.3h5M3 19.6v-5m0 0h5m-5 0 3.2 3.2a8.25 8.25 0 0 0 13.8-3.7M4 9.9a8.25 8.25 0 0 1 13.8-3.7l3.2 3.2m0-5v5" />
  </Svg>
);

/* Support */
export const NavLifebuoy = (props) => (
  <Svg {...props}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="3.3" />
    <path d="m9.7 9.7-3.6-3.6M14.3 14.3l3.6 3.6M14.3 9.7l3.6-3.6M9.7 14.3l-3.6 3.6" />
  </Svg>
);

export const NavTag = (props) => (
  <Svg {...props}>
    <path d="M4 12.7V5.2A1.2 1.2 0 0 1 5.2 4h7.9a2 2 0 0 1 1.4.6l5.9 5.9a2 2 0 0 1 0 2.8l-6.9 6.9a2 2 0 0 1-2.8 0l-6.1-6.1a2 2 0 0 1-.6-1.4Z" />
    <circle cx="8.3" cy="8.3" r="1.1" />
  </Svg>
);

/* Finance */
export const NavCash = (props) => (
  <Svg {...props}>
    <rect x="3" y="6.5" width="18" height="11" rx="2" />
    <circle cx="12" cy="12" r="2.8" />
    <path d="M6 10.2v3.6M18 10.2v3.6" />
  </Svg>
);

export const NavCalculator = (props) => (
  <Svg {...props}>
    <rect x="5" y="3.5" width="14" height="17" rx="2.2" />
    <path d="M8 7.6h8" />
    <path d="M8.4 11.4h.01M12 11.4h.01M15.6 11.4h.01M8.4 15h.01M12 15h.01M15.6 15h.01M8.4 18.6h.01M12 18.6h.01M15.6 18.6h.01" />
  </Svg>
);

export const NavReceipt = (props) => (
  <Svg {...props}>
    <path d="M5.5 4.5a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v15l-2.2-1.3-2.2 1.3-2.1-1.3-2.1 1.3-2.2-1.3-2.2 1.3Z" />
    <circle cx="9.8" cy="9.7" r="1.4" />
    <circle cx="14.2" cy="13.3" r="1.4" />
    <path d="m14.9 8.6-5.8 5.8" />
  </Svg>
);

export const NavCurrency = (props) => (
  <Svg {...props}>
    <path d="M14 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8.5Z" />
    <path d="M13.9 3.6v4.9h4.6" />
    <path d="M12 10.4v6.8" />
    <path d="M14 12.3a2 2 0 0 0-3.9.5c0 1 .8 1.5 1.9 1.8 1.1.3 1.9.8 1.9 1.8a2 2 0 0 1-3.9.5" />
  </Svg>
);

export const NavCard = (props) => (
  <Svg {...props}>
    <rect x="3.5" y="5.5" width="17" height="13" rx="2.2" />
    <path d="M3.5 9.8h17" />
    <path d="M6.8 14.8h3.4" />
  </Svg>
);

/* Admin */
export const NavOffice = (props) => (
  <Svg {...props}>
    <path d="M4.5 20V5.4A1.4 1.4 0 0 1 5.9 4h7.2a1.4 1.4 0 0 1 1.4 1.4V20" />
    <path d="M14.5 9.5h3.6a1.4 1.4 0 0 1 1.4 1.4V20" />
    <path d="M3.5 20h17" />
    <path d="M7.6 7.8h1M11 7.8h1M7.6 11h1M11 11h1M7.6 14.2h1M11 14.2h1M7.6 17.4h1M11 17.4h1" />
  </Svg>
);

export const NavTerminal = (props) => (
  <Svg {...props}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <path d="m7.5 9.6 3.1 2.5-3.1 2.5" />
    <path d="M12.6 14.6h3.9" />
  </Svg>
);
