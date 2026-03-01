import {
    HiOutlineAcademicCap,
    HiOutlineUserGroup,
    HiOutlineChartBar,
    HiOutlineShieldCheck,
    HiOutlineCloud,
    HiOutlineDeviceMobile,
    HiOutlineSparkles,
    HiOutlineClipboardCheck,
    HiOutlineOfficeBuilding,
    HiOutlineUserAdd,
    HiOutlineCheckCircle,
} from 'react-icons/hi';

export const featureIconMap = {
    gradebook: HiOutlineClipboardCheck,
    attendance: HiOutlineUserGroup,
    substitute: HiOutlineUserAdd,
    analytics: HiOutlineChartBar,
    security: HiOutlineShieldCheck,
    mobile: HiOutlineDeviceMobile,
    ai: HiOutlineSparkles,
    automation: HiOutlineCloud,
    reporting: HiOutlineChartBar,
    communication: HiOutlineDeviceMobile,
    planning: HiOutlineAcademicCap,
    governance: HiOutlineShieldCheck,
};

export const trustIconMap = {
    shield: HiOutlineShieldCheck,
    cloud: HiOutlineCloud,
    schools: HiOutlineOfficeBuilding,
    uptime: HiOutlineCheckCircle,
};

export const featureMetaMap = {
    gradebook: { audience: 'For teachers', highlight: 'Faster grading cycles', tint: 'rgba(32,59,180,0.22)' },
    attendance: { audience: 'For operations', highlight: 'Cleaner daily routines', tint: 'rgba(14,165,233,0.2)' },
    substitute: { audience: 'For principals', highlight: 'Less scheduling friction', tint: 'rgba(245,158,11,0.2)' },
    analytics: { audience: 'For leadership', highlight: 'Data-backed decisions', tint: 'rgba(16,185,129,0.2)' },
    security: { audience: 'For admins', highlight: 'Safer school data', tint: 'rgba(99,102,241,0.2)' },
    mobile: { audience: 'For everyone', highlight: 'Work from anywhere', tint: 'rgba(147,63,231,0.2)' },
    ai: { audience: 'For instruction', highlight: 'AI-powered support', tint: 'rgba(59,130,246,0.22)' },
    automation: { audience: 'For operations', highlight: 'Less manual work', tint: 'rgba(14,165,233,0.18)' },
    reporting: { audience: 'For leadership', highlight: 'Clear performance view', tint: 'rgba(16,185,129,0.18)' },
    communication: { audience: 'For families', highlight: 'Stay informed', tint: 'rgba(244,114,182,0.2)' },
    planning: { audience: 'For admins', highlight: 'Structured planning', tint: 'rgba(245,158,11,0.2)' },
    governance: { audience: 'For platform', highlight: 'Secure oversight', tint: 'rgba(99,102,241,0.18)' },
};
