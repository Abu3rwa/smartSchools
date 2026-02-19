export const landingPageDefaults = {
  seo: {
    organizationName: 'GradeBook Pro',
    description:
      'School management platform for grades, attendance, timetables, and parent communication.',
  },
  brand: {
    name: 'GradeBook Pro',
    tagline: 'School management for the digital age.',
    supportEmail: 'support@gradebookpro.com',
    copyrightName: 'GradeBook Pro',
  },
  header: {
    loginLabel: 'Log in',
    startLabel: 'Start free',
  },
  navigation: [
    { label: 'Features', id: 'features' },
    { label: 'Pricing', id: 'pricing' },
    { label: 'Testimonials', id: 'testimonials' },
    { label: 'FAQ', id: 'faq' },
    { label: 'Find your school', id: 'find-school' },
  ],
  hero: {
    badgeTemplate: 'Used by {{schoolCount}}+ schools',
    badgeFallback: 'Trusted by schools worldwide',
    title: 'The gradebook that runs your school-not the other way around',
    subtitle:
      'Daily grades, attendance, timetables, and parent communication in one place. Start free with up to 50 students-no credit card required.',
    highlights: ['Free up to 50 students', 'No credit card', 'Cancel anytime'],
    scrollHint: 'Scroll to explore',
    primaryCta: { label: 'Start free trial', action: 'register' },
    secondaryCta: { label: 'See pricing', action: 'scroll:pricing' },
    preview: {
      metrics: [
        { value: '245', label: 'Students' },
        { value: '18', label: 'Classes' },
        { value: '92%', label: 'Attendance' },
      ],
      tableHeaders: ['Class', 'Subject', 'Grades today'],
      tableRows: [
        ['10-A', 'Math', '24'],
        ['10-B', 'Science', '22'],
        ['11-A', 'English', '20'],
      ],
    },
  },
  trustStrip: [
    { iconKey: 'shield', text: 'Secure and compliant' },
    { iconKey: 'cloud', text: 'Cloud-based' },
    { iconKey: 'schools', text: '{{schoolCount}}+ schools' },
    { iconKey: 'uptime', text: '99.9% uptime' },
  ],
  howItWorks: {
    overline: 'How it works',
    title: 'Get started in minutes',
    subtitle:
      'Register your school, add classes and teachers, then start recording grades and attendance.',
    steps: [
      {
        title: 'Create your school',
        description:
          'Sign up with your school details. No credit card required for the Free plan.',
      },
      {
        title: 'Add classes and teachers',
        description:
          'Set up grades, subjects, and assign teachers. Import students via CSV if you like.',
      },
      {
        title: 'Start managing',
        description:
          'Enter daily grades, take attendance, and send reports to parents-all from one dashboard.',
      },
    ],
  },
  features: {
    overline: 'Features',
    title: 'Built for how schools actually work',
    subtitle:
      'One platform for grades, attendance, timetables, and parent communication.',
    items: [
      {
        iconKey: 'gradebook',
        title: 'Daily gradebook',
        description:
          'Bulk entry by class, automatic averages, and report generation. Configure max marks and passing criteria per subject.',
      },
      {
        iconKey: 'attendance',
        title: 'Attendance and timetable',
        description:
          'Period-based timetables and attendance. Teachers see their day at a glance and record attendance in one click.',
      },
      {
        iconKey: 'substitute',
        title: 'Teacher substitution',
        description:
          'When a teacher is absent, principals create sub requests, see available substitutes, and teachers confirm or decline via secure links. Full audit trail and no double-booking.',
      },
      {
        iconKey: 'analytics',
        title: 'Reports and insights',
        description:
          'Generate student and class reports, track trends, and identify gaps early.',
      },
      {
        iconKey: 'security',
        title: 'Role-based security',
        description:
          'Each school data is isolated. Role-based access, secure auth, and white-label options on paid plans.',
      },
      {
        iconKey: 'mobile',
        title: 'Works everywhere',
        description:
          'Responsive web app for desktop, tablet, or phone. No separate app install required.',
      },
    ],
  },
  pricing: {
    overline: 'Pricing',
    title: 'Simple, transparent pricing',
    subtitle: 'Start free. Scale when you grow. No hidden fees.',
    plans: [
      {
        name: 'Starter',
        price: '$0',
        period: '/month',
        description: 'Up to 50 students',
        features: [
          'Full gradebook',
          'Attendance and timetable',
          'Teacher substitution',
          'Parent notifications',
          'Email support',
        ],
        featured: false,
        ctaLabel: 'Start free',
        ctaAction: 'register',
      },
      {
        name: 'Growth',
        price: '$2',
        period: '/student/mo',
        description: 'Unlimited students plus premium features',
        features: [
          'Everything in Starter',
          'White-label branding',
          'Priority support',
          'Usage analytics',
        ],
        featured: true,
        ctaLabel: 'Get started',
        ctaAction: 'register',
      },
      {
        name: 'Enterprise',
        price: 'Custom',
        period: '',
        description: 'Advanced features and dedicated support',
        features: [
          'Everything in Growth',
          'Custom integrations',
          'Dedicated success manager',
          'SLA and training',
        ],
        featured: false,
        ctaLabel: 'Contact sales',
        ctaAction: 'mailto:support@gradebookpro.com?subject=Enterprise%20inquiry',
      },
    ],
  },
  testimonials: {
    overline: 'Testimonials',
    title: 'Loved by educators',
    subtitle: 'See what admins and teachers say about GradeBook Pro.',
    items: [
      {
        quote:
          'The analytics dashboard alone has saved us hours each week. Parents love the real-time grade updates.',
        name: 'Dr. Jane Davis',
        role: 'Principal, Lincoln High School',
        initials: 'JD',
      },
      {
        quote:
          'We switched from spreadsheets last year. Setup was quick, and our teachers actually use it every day.',
        name: 'Mark Stevens',
        role: 'IT Director, Riverside Academy',
        initials: 'MS',
      },
      {
        quote:
          'I can update grades and take attendance from my phone between classes. Game-changer.',
        name: 'Sarah Chen',
        role: 'Math Teacher, Oak Valley School',
        initials: 'SC',
      },
    ],
  },
  faq: {
    overline: 'FAQ',
    title: 'Frequently asked questions',
    items: [
      {
        question: 'How does the free trial work?',
        answer:
          'Start with our Free plan-no credit card required. You get up to 50 students, full gradebook, attendance, teacher substitution, and parent notifications. Upgrade to Growth anytime when you need more capacity or premium features.',
      },
      {
        question: 'What is teacher substitution?',
        answer:
          'When a teacher is absent, department principals create a sub request, select available substitutes from the system, and teachers receive an email with a secure link to confirm or decline. The system prevents double-booking and keeps a full audit trail.',
      },
      {
        question: 'Is my school data secure?',
        answer:
          'Yes. We use bank-level encryption, secure cloud hosting, and are designed for GDPR compliance. Each school data is isolated-no other institution can access your information.',
      },
      {
        question: 'Can we use our own branding?',
        answer:
          'Growth and Enterprise plans support white-label options: custom logo, colors, and domain so parents and staff see your school brand when they log in.',
      },
      {
        question: 'Do you integrate with existing systems?',
        answer:
          'We offer CSV import for students and grades. Enterprise plans can include API access and custom integrations-contact us to discuss your needs.',
      },
      {
        question: 'What kind of support do you offer?',
        answer:
          'All plans include email support. Growth adds priority support. Enterprise includes a dedicated success manager and optional training for your staff.',
      },
    ],
  },
  finalCta: {
    title: 'Ready to simplify your school?',
    subtitle:
      'Join schools that switched from spreadsheets and paperwork to one clear system.',
    button: { label: 'Start free trial', action: 'register' },
  },
  findSchool: {
    overline: 'Find your school',
    title: 'Log in to your institution',
    subtitle: 'Search for your school to log in, or register a new one.',
    searchPlaceholder: 'Search by school name...',
    noMatchTemplate:
      'No schools match "{{searchTerm}}". Try another search or register your school.',
    noSchoolsMessage: 'No schools yet. Be the first-register your school.',
    schoolsLabel: 'Schools on GradeBook Pro',
    matchingLabelTemplate: 'Matching "{{searchTerm}}"',
    showingLimitTemplate:
      'Showing {{shownCount}} of {{totalCount}} schools. Narrow your search to find your school.',
    registerPrompt: "Don't see your school?",
    registerCtaLabel: 'Register your school',
  },
  footer: {
    productTitle: 'Product',
    companyTitle: 'Company',
    legalTitle: 'Legal',
    productLinks: [
      { label: 'Features', action: 'scroll:features' },
      { label: 'Pricing', action: 'scroll:pricing' },
      { label: 'FAQ', action: 'scroll:faq' },
    ],
    companyLinks: [
      { label: 'About', action: 'scroll:features' },
      { label: 'Contact', action: 'mailto:support@gradebookpro.com' },
    ],
    legalLinks: [
      { label: 'Privacy', action: '#' },
      { label: 'Terms', action: '#' },
    ],
    copyrightTemplate: '(c) {{year}} {{copyrightName}}. All rights reserved.',
  },
};

export const resolveLandingTemplate = (template, variables = {}) => {
  if (typeof template !== 'string') return '';
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (Object.prototype.hasOwnProperty.call(variables, key)) {
      return String(variables[key]);
    }
    return '';
  });
};
