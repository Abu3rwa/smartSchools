export const landingPageDefaults = {
  seo: {
    organizationName: 'ClassHope',
    description:
      'School operations platform for gradebook, attendance, standards practice, interventions, reports, reading, and revision planning.',
  },
  brand: {
    name: 'ClassHope',
    tagline: 'Core school operations plus learning support in one platform.',
    supportEmail: 'support@nextgenschool.com',
    copyrightName: 'ClassHope',
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
      'Manage students, classes, gradebook, attendance, standards practice, behavior, reports, reading, and revision from one secure school platform.',
    highlights: ['Role-based access', 'School data isolation', 'AI-assisted learning workflows'],
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
    { iconKey: 'shield', text: 'Role-based and secure' },
    { iconKey: 'cloud', text: 'Cloud-based operations' },
    { iconKey: 'schools', text: '{{schoolCount}}+ schools' },
    { iconKey: 'uptime', text: 'Built for daily school workflows' },
  ],
  howItWorks: {
    overline: 'How it works',
    title: 'Get started in minutes',
    subtitle:
      'Set up your school, onboard academic structure, and run daily operations with clear role-based access.',
    steps: [
      {
        title: 'Set up school and roles',
        description:
          'Create your school workspace and assign admin, teacher, student, and parent access.',
      },
      {
        title: 'Add classes, subjects, and students',
        description:
          'Configure classes and subjects, assign teachers, and organize your academic data.',
      },
      {
        title: 'Run teaching and support workflows',
        description:
          'Use gradebook, attendance, standards practice, interventions, and reporting from one dashboard.',
      },
    ],
  },
  features: {
    overline: 'Features',
    title: 'Built for how schools actually work',
    subtitle:
      'Core school operations plus AI-assisted teaching, intervention, and communication tools.',
    items: [
      {
        iconKey: 'gradebook',
        title: 'Student, class, and gradebook operations',
        description:
          'Manage student records, classes, subjects, and grades with reporting views for teachers and school leaders.',
      },
      {
        iconKey: 'attendance',
        title: 'Attendance, timetable, and calendar',
        description:
          'Track attendance, manage timetables, handle room planning, and apply school calendar exceptions with control.',
      },
      {
        iconKey: 'substitute',
        title: 'Substitution and request workflows',
        description:
          'Manage teacher substitution requests and attendance request approvals with structured status tracking.',
      },
      {
        iconKey: 'analytics',
        title: 'Standards practice and mastery tracking',
        description:
          'Assign standards-based practice, track attempts and mastery, and surface learning gaps quickly.',
      },
      {
        iconKey: 'ai',
        title: 'AI lesson plan evaluation',
        description:
          'Review lesson plans against school-defined criteria with AI scoring and feedback to speed up approvals.',
      },
      {
        iconKey: 'ai',
        title: 'AI-assisted reporting',
        description:
          'Generate advanced reports with templates, analytics, and automated summaries for leaders and teachers.',
      },
      {
        iconKey: 'analytics',
        title: 'Behavior analytics and interventions',
        description:
          'Track behavior incidents, monitor trends, and manage intervention queues for targeted student support.',
      },
      {
        iconKey: 'mobile',
        title: 'Reading assistant and revision planning',
        description:
          'Support learners with reading workflows, simplified texts, and revision plans to improve outcomes.',
      },
      {
        iconKey: 'communication',
        title: 'Notifications and newsletters',
        description:
          'Keep families and staff informed with in-app notifications and scheduled newsletter workflows.',
      },
      {
        iconKey: 'automation',
        title: 'Workflow automation',
        description:
          'Automate reminders, review queues, and request lifecycles to reduce manual administration.',
      },
      {
        iconKey: 'planning',
        title: 'School settings and departments',
        description:
          'Configure school structure, departments, roles, and academic year settings in one place.',
      },
      {
        iconKey: 'governance',
        title: 'Super admin oversight and subscriptions',
        description:
          'Manage multi-school access, subscriptions, and platform governance with secure controls.',
      },
      {
        iconKey: 'security',
        title: 'Secure access and multi-tenant design',
        description:
          'Protect each school with isolated data, role-based permissions, secure auth, and admin governance controls.',
      },
    ],
  },
  pricing: {
    overline: 'Pricing',
    title: 'Simple, transparent pricing',
    subtitle: 'Start free. Scale when you grow. No hidden fees.',
    popularLabel: 'Most popular',
    plans: [
      {
        name: 'Starter',
        price: '$0',
        period: '/month',
        description: 'Up to 50 students',
        features: [
          'Student, class, and subject management',
          'Gradebook, attendance, and timetable',
          'Standards practice and mastery tracking',
          'Attendance and substitution workflows',
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
          'Behavior analytics and interventions',
          'Advanced reporting with templates',
          'Reading assistant and revision planning',
          'Priority support',
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
          'Custom branding options',
          'Custom integrations and API access',
          'Dedicated success manager',
          'SLA, onboarding, and training',
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
    subtitle: 'See what admins, principals, and teachers say about daily usage.',
    items: [
      {
        quote:
          'We replaced disconnected tools with one workflow for grades, attendance, and interventions. It changed our weekly operations.',
        name: 'Dr. Jane Davis',
        role: 'Principal, Lincoln High School',
        initials: 'JD',
      },
      {
        quote:
          'The standards practice and mastery view helps us support students earlier, with less manual tracking.',
        name: 'Mark Stevens',
        role: 'IT Director, Riverside Academy',
        initials: 'MS',
      },
      {
        quote:
          'I use gradebook, attendance, and reading support in one place between classes. It saves real time every day.',
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
          'Start with our Free plan-no credit card required. You get up to 50 students with core operations including students, classes, gradebook, attendance, and timetable workflows.',
      },
      {
        question: 'What learning support features are included?',
        answer:
          'The platform includes standards-based practice with mastery tracking, intervention management, reading assistant workflows, and revision planning support.',
      },
      {
        question: 'Is my school data secure?',
        answer:
          'Yes. Access is role-based and each school data is tenant-isolated. Authentication and security controls help protect institutional data.',
      },
      {
        question: 'Do you support behavior and attendance workflows?',
        answer:
          'Yes. Teams can track behavior incidents and analytics, manage attendance operations, and process attendance requests and approvals.',
      },
      {
        question: 'Can admins oversee multiple schools?',
        answer:
          'Yes. Super admin capabilities include multi-school oversight for users, subscriptions, and platform-level analytics.',
      },
      {
        question: 'What kind of support do you offer?',
        answer:
          'All plans include email support. Growth adds priority support. Enterprise includes a dedicated success manager plus onboarding and training.',
      },
    ],
  },
  finalCta: {
    title: 'Ready to simplify your school?',
    subtitle:
      'Move from fragmented tools to one system for operations, learning support, and reporting.',
    button: { label: 'Start free trial', action: 'register' },
  },
  findSchool: {
    overline: 'Find your school',
    title: 'Log in to your institution',
    subtitle: 'Search for your school to log in, or register a new one.',
    searchPlaceholder: 'Search by school name...',
    searchHint: 'Type at least 2 letters to quickly find your school.',
    clearSearchAriaLabel: 'Clear search',
    maxStudentsTemplate: 'Up to {{maxStudents}} students',
    totalSchoolsLabelTemplate: '{{count}} schools available',
    filteredResultsLabelTemplate: '{{count}} results',
    noMatchTemplate:
      'No schools match "{{searchTerm}}". Try another search or register your school.',
    noSchoolsMessage: 'No schools yet. Be the first-register your school.',
    schoolsLabel: 'Schools on ClassHope',
    matchingLabelTemplate: 'Matching "{{searchTerm}}"',
    showingLimitTemplate:
      'Showing {{shownCount}} of {{totalCount}} schools. Narrow your search to find your school.',
    registerPrompt: "Don't see your school?",
    registerCtaLabel: 'Register your school',
  },
  dynamicFallback: {
    announcement: {
      title: 'School operations update',
      message:
        'The latest product updates for attendance, gradebook, and communication are now available.',
      ctaLabel: 'Learn more',
      ctaAction: 'scroll:features',
    },
    promotions: [
      {
        id: 'starter-boost',
        badge: 'Limited offer',
        title: 'Launch faster with guided onboarding',
        description: 'Activate your school workspace with setup assistance and import templates.',
        ctaLabel: 'Start free',
        ctaAction: 'register',
      },
      {
        id: 'growth-plan',
        badge: 'Growth plan',
        title: 'Unlock intervention and analytics workflows',
        description:
          'Enable advanced behavior analytics, interventions, and reporting for school leaders.',
        ctaLabel: 'See pricing',
        ctaAction: 'scroll:pricing',
      },
    ],
    testimonials: [
      {
        id: 'dyn-jd',
        quote:
          'We onboarded teachers and classes in under a week. The platform now runs our daily operations.',
        name: 'Dr. Jane Davis',
        role: 'Principal',
      },
      {
        id: 'dyn-ms',
        quote:
          'Attendance and gradebook updates now stay in one workflow, which reduced manual work significantly.',
        name: 'Mark Stevens',
        role: 'IT Director',
      },
    ],
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
