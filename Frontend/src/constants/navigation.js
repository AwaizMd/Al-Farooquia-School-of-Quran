import {
  LayoutDashboard, Users, UserRound, CalendarCheck, BookOpenCheck, ClipboardList, Wallet, BellRing, BedDouble,
  BarChart3, History, Settings, Sprout, FileText, ScrollText, Plus, ShieldCheck, BadgeCheck, Landmark, Building2,
} from 'lucide-react'

// Role-aware navigation for the madrasa the account is working in. Hiding a link is
// only a convenience: the server enforces every permission and refuses modules a
// madrasa has switched off. `feature` hides an item when that module is off;
// `perm` hides it without that permission.
const ORG = { to: '/organization', label: 'Madrasas', icon: Building2, perm: 'org.manage' }

export const NAV = {
  admin: {
    sections: [
      { title: 'Overview', items: [{ to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }] },
      { title: 'People', items: [
        { to: '/students', label: 'Students', icon: Users },
        { to: '/mentors', label: 'Mentors', icon: UserRound },
      ] },
      { title: 'Learning', items: [
        { to: '/attendance', label: 'Attendance', icon: CalendarCheck },
        { to: '/sabaq/new', label: 'Record Sabaq', icon: BookOpenCheck },
        { to: '/sabaq', label: 'Sabaq Records', icon: ScrollText, end: true },
        { to: '/exams', label: 'Examinations', icon: ClipboardList, feature: 'ASSESSMENTS' },
      ] },
      { title: 'Finance & Campus', items: [
        { to: '/fees', label: 'Fees', icon: Wallet, feature: 'FEES' },
        { to: '/payment-verification', label: 'Payment Verification', icon: BadgeCheck, feature: 'FEES' },
        { to: '/reminders', label: 'Fee Reminders', icon: BellRing, feature: 'FEES' },
        { to: '/payment-settings', label: 'Fee Payment Settings', icon: Landmark, feature: 'FEES' },
        { to: '/hostel', label: 'Hostel', icon: BedDouble, feature: 'HOSTEL' },
      ] },
      { title: 'Insights', items: [
        { to: '/reports', label: 'Reports', icon: BarChart3 },
        { to: '/progress-report', label: 'Progress Reports', icon: FileText },
        { to: '/audit', label: 'Activity Log', icon: History },
      ] },
      { title: 'Administration', items: [
        { to: '/admin/users', label: 'Users & Access', icon: ShieldCheck },
        { to: '/settings', label: 'Settings', icon: Settings },
        ORG,
      ] },
    ],
    bottom: [
      { to: '/dashboard', label: 'Home', icon: LayoutDashboard },
      { to: '/students', label: 'Students', icon: Users },
      { to: '/attendance', label: 'Attendance', icon: CalendarCheck },
      { to: '/fees', label: 'Fees', icon: Wallet, feature: 'FEES' },
    ],
  },
  // Madrasa-wide oversight: read access to people, learning, fees and reports; no settings or security administration.
  principal: {
    sections: [
      { title: 'Overview', items: [{ to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }] },
      { title: 'People', items: [
        { to: '/students', label: 'Students', icon: Users },
        { to: '/mentors', label: 'Mentors', icon: UserRound },
      ] },
      { title: 'Learning', items: [
        { to: '/attendance', label: 'Attendance', icon: CalendarCheck },
        { to: '/sabaq', label: 'Sabaq Records', icon: ScrollText, end: true },
        { to: '/exams', label: 'Examinations', icon: ClipboardList, feature: 'ASSESSMENTS' },
      ] },
      { title: 'Insights', items: [
        { to: '/fees', label: 'Fees', icon: Wallet, feature: 'FEES' },
        { to: '/payment-verification', label: 'Payment Verification', icon: BadgeCheck, feature: 'FEES' },
        { to: '/reports', label: 'Reports', icon: BarChart3 },
        { to: '/progress-report', label: 'Progress Reports', icon: FileText },
        { to: '/audit', label: 'Activity Log', icon: History },
      ] },
    ],
    bottom: [
      { to: '/dashboard', label: 'Home', icon: LayoutDashboard },
      { to: '/students', label: 'Students', icon: Users },
      { to: '/attendance', label: 'Attendance', icon: CalendarCheck },
      { to: '/reports', label: 'Reports', icon: BarChart3 },
    ],
  },
  // Fees and payments of one madrasa (the Accounts module arrives with CR-01 phase 3).
  accountant: {
    sections: [
      { title: 'Fees', items: [
        { to: '/dashboard', label: 'Fees', icon: Wallet },
        { to: '/payment-verification', label: 'Payment Verification', icon: BadgeCheck, feature: 'FEES' },
        { to: '/reminders', label: 'Fee Reminders', icon: BellRing, feature: 'FEES' },
      ] },
      { title: 'People', items: [{ to: '/students', label: 'Students', icon: Users }] },
    ],
    bottom: [
      { to: '/dashboard', label: 'Fees', icon: Wallet },
      { to: '/payment-verification', label: 'Verify', icon: BadgeCheck, feature: 'FEES' },
      { to: '/students', label: 'Students', icon: Users },
      { to: '/notifications', label: 'Alerts', icon: BellRing },
    ],
  },
  // Chartered accountant: read-only fee records of the assigned madrasas.
  ca: {
    sections: [
      { title: 'Accounts (read-only)', items: [
        { to: '/dashboard', label: 'Fees', icon: Wallet },
        { to: '/payment-verification', label: 'Reported Payments', icon: BadgeCheck, feature: 'FEES' },
      ] },
    ],
    bottom: [
      { to: '/dashboard', label: 'Fees', icon: Wallet },
      { to: '/payment-verification', label: 'Payments', icon: BadgeCheck, feature: 'FEES' },
      { to: '/notifications', label: 'Alerts', icon: BellRing },
      { to: '/account/security', label: 'Security', icon: ShieldCheck },
    ],
  },
  // Committee: read-only analytics across the assigned madrasas (dashboards arrive with CR-01 phase 3).
  committee: {
    sections: [
      { title: 'Overview', items: [
        { to: '/dashboard', label: 'Overview', icon: BarChart3 },
        { to: '/notifications', label: 'Notifications', icon: BellRing },
      ] },
    ],
    bottom: [
      { to: '/dashboard', label: 'Overview', icon: BarChart3 },
      { to: '/notifications', label: 'Alerts', icon: BellRing },
    ],
  },
  warden: {
    sections: [
      { title: 'Hostel', items: [
        { to: '/dashboard', label: 'Hostel', icon: BedDouble },
        { to: '/notifications', label: 'Notifications', icon: BellRing },
      ] },
    ],
    bottom: [
      { to: '/dashboard', label: 'Hostel', icon: BedDouble },
      { to: '/notifications', label: 'Alerts', icon: BellRing },
    ],
  },
  mentor: {
    sections: [
      { title: 'My Halqa', items: [
        { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { to: '/students', label: 'My Students', icon: Users },
        { to: '/attendance', label: 'Attendance', icon: CalendarCheck },
        { to: '/sabaq/new', label: 'Record Sabaq', icon: BookOpenCheck },
        { to: '/sabaq', label: 'Sabaq Records', icon: ScrollText, end: true },
      ] },
      { title: 'Teaching', items: [
        { to: '/exams', label: 'Tests & Marks', icon: ClipboardList, feature: 'ASSESSMENTS' },
        { to: '/progress-report', label: 'Progress Reports', icon: FileText },
      ] },
    ],
    bottom: [
      { to: '/dashboard', label: 'Home', icon: LayoutDashboard },
      { to: '/students', label: 'Students', icon: Users },
      { to: '/sabaq/new', label: 'Sabaq', icon: Plus, primary: true },
      { to: '/attendance', label: 'Attendance', icon: CalendarCheck },
    ],
  },
  student: {
    sections: [
      { title: 'My Learning', items: [
        { to: '/dashboard', label: 'Home', icon: LayoutDashboard },
        { to: '/journey', label: 'My Learning Journey', icon: Sprout },
        { to: '/sabaq', label: 'My Sabaq History', icon: ScrollText, end: true },
        { to: '/exams', label: 'Tests & Report Card', icon: ClipboardList, feature: 'ASSESSMENTS' },
        { to: '/fees', label: 'My Fees', icon: Wallet, feature: 'FEES' },
      ] },
    ],
    bottom: [
      { to: '/dashboard', label: 'Home', icon: LayoutDashboard },
      { to: '/journey', label: 'Journey', icon: Sprout },
      { to: '/sabaq', label: 'Sabaq', icon: ScrollText },
      { to: '/exams', label: 'Tests', icon: ClipboardList, feature: 'ASSESSMENTS' },
    ],
  },
  parent: {
    sections: [
      { title: 'My Children', items: [
        { to: '/dashboard', label: 'Overview', icon: LayoutDashboard },
        { to: '/journey', label: 'Learning Report', icon: Sprout },
        { to: '/sabaq', label: 'Sabaq Records', icon: ScrollText, end: true },
        { to: '/progress-report', label: 'Progress Report', icon: FileText },
        { to: '/exams', label: 'Tests & Report Card', icon: ClipboardList, feature: 'ASSESSMENTS' },
        { to: '/fees', label: 'Fees & Payments', icon: Wallet, feature: 'FEES' },
      ] },
    ],
    bottom: [
      { to: '/dashboard', label: 'Home', icon: LayoutDashboard },
      { to: '/journey', label: 'Learning', icon: Sprout },
      { to: '/fees', label: 'Fees', icon: Wallet, feature: 'FEES' },
      { to: '/progress-report', label: 'Report', icon: FileText },
    ],
  },
}

/** Items the account should see: the module is on in this madrasa and the permission is held. */
export const visibleItems = (items, auth) => items.filter((it) => (!it.feature || auth.feature(it.feature)) && (!it.perm || auth.can(it.perm)))

export const ROUTE_ROLES = {
  '/students': ['admin', 'principal', 'mentor', 'accountant'],
  '/students/new': ['admin'],
  '/mentors': ['admin', 'principal'],
  '/attendance': ['admin', 'principal', 'mentor'],
  '/sabaq/new': ['admin', 'mentor'],
  '/fees': ['admin', 'principal', 'accountant', 'ca', 'student', 'parent'],
  '/reminders': ['admin', 'accountant'],
  '/payment-settings': ['admin'],
  '/payment-verification': ['admin', 'principal', 'accountant', 'ca'],
  '/hostel': ['admin', 'warden'],
  '/reports': ['admin', 'principal'],
  '/audit': ['admin', 'principal'],
  '/settings': ['admin'],
  '/admin/users': ['admin'],
  '/organization': ['admin'],
  '/journey': ['student', 'parent'],
  '/progress-report': ['admin', 'principal', 'mentor', 'parent'],
  '/exams': ['admin', 'principal', 'mentor', 'student', 'parent'],
  '/sabaq': ['admin', 'principal', 'mentor', 'student', 'parent'],
}

export const PAGE_TITLES = [
  ['/dashboard', 'Dashboard'], ['/students/new', 'Add Student'], ['/students', 'Students'], ['/mentors', 'Mentors'],
  ['/attendance', 'Attendance'], ['/sabaq/new', 'Record Sabaq'], ['/sabaq', 'Sabaq Records'], ['/journey', 'Learning'],
  ['/progress-report', 'Progress Report'], ['/exams', 'Examinations'], ['/report-card', 'Report Card'], ['/fees', 'Fees'],
  ['/reminders', 'Fee Reminders'], ['/payment-settings', 'Fee Payment Settings'], ['/payment-verification', 'Payment Verification'], ['/hostel', 'Hostel'], ['/reports', 'Reports'],
  ['/audit', 'Activity Log'], ['/notifications', 'Notifications'], ['/settings', 'Settings'], ['/admin/users', 'Users & Access'], ['/organization', 'Madrasas'], ['/account/security', 'Account security'],
]
