import {
  LayoutDashboard, Users, UserRound, CalendarCheck, BookOpenCheck, ClipboardList, Wallet, BellRing, BedDouble,
  Library, BarChart3, History, Settings, Sprout, FileText, ScrollText, Plus, ShieldCheck, BadgeCheck, Landmark,
} from 'lucide-react'

// Role-aware navigation. These are UI restrictions for the demo only — a
// production system must enforce permissions on the server.
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
        { to: '/exams', label: 'Examinations', icon: ClipboardList },
        { to: '/library', label: 'Digital Library', icon: Library },
      ] },
      { title: 'Finance & Campus', items: [
        { to: '/fees', label: 'Fees', icon: Wallet },
        { to: '/payment-verification', label: 'Payment Verification', icon: BadgeCheck },
        { to: '/reminders', label: 'Fee Reminders', icon: BellRing },
        { to: '/payment-settings', label: 'Fee Payment Settings', icon: Landmark },
        { to: '/hostel', label: 'Hostel', icon: BedDouble },
      ] },
      { title: 'Insights', items: [
        { to: '/reports', label: 'Reports', icon: BarChart3 },
        { to: '/progress-report', label: 'Progress Reports', icon: FileText },
        { to: '/audit', label: 'Activity Log', icon: History },
        { to: '/admin/users', label: 'Users & Access', icon: ShieldCheck },
        { to: '/settings', label: 'Settings', icon: Settings },
      ] },
    ],
    bottom: [
      { to: '/dashboard', label: 'Home', icon: LayoutDashboard },
      { to: '/students', label: 'Students', icon: Users },
      { to: '/attendance', label: 'Attendance', icon: CalendarCheck },
      { to: '/fees', label: 'Fees', icon: Wallet },
    ],
  },
  // Institution-wide oversight: read access to people, learning, fees and reports; no settings or security administration.
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
        { to: '/exams', label: 'Examinations', icon: ClipboardList },
        { to: '/library', label: 'Digital Library', icon: Library },
      ] },
      { title: 'Insights', items: [
        { to: '/fees', label: 'Fees', icon: Wallet },
        { to: '/payment-verification', label: 'Payment Verification', icon: BadgeCheck },
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
        { to: '/exams', label: 'Tests & Marks', icon: ClipboardList },
        { to: '/progress-report', label: 'Progress Reports', icon: FileText },
        { to: '/library', label: 'Digital Library', icon: Library },
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
        { to: '/exams', label: 'Tests & Report Card', icon: ClipboardList },
        { to: '/library', label: 'Digital Library', icon: Library },
        { to: '/fees', label: 'My Fees', icon: Wallet },
      ] },
    ],
    bottom: [
      { to: '/dashboard', label: 'Home', icon: LayoutDashboard },
      { to: '/journey', label: 'Journey', icon: Sprout },
      { to: '/sabaq', label: 'Sabaq', icon: ScrollText },
      { to: '/library', label: 'Library', icon: Library },
    ],
  },
  parent: {
    sections: [
      { title: 'My Children', items: [
        { to: '/dashboard', label: 'Overview', icon: LayoutDashboard },
        { to: '/journey', label: 'Learning Report', icon: Sprout },
        { to: '/sabaq', label: 'Sabaq Records', icon: ScrollText, end: true },
        { to: '/progress-report', label: 'Progress Report', icon: FileText },
        { to: '/exams', label: 'Tests & Report Card', icon: ClipboardList },
        { to: '/fees', label: 'Fees & Payments', icon: Wallet },
        { to: '/library', label: 'Digital Library', icon: Library },
      ] },
    ],
    bottom: [
      { to: '/dashboard', label: 'Home', icon: LayoutDashboard },
      { to: '/journey', label: 'Learning', icon: Sprout },
      { to: '/fees', label: 'Fees', icon: Wallet },
      { to: '/progress-report', label: 'Report', icon: FileText },
    ],
  },
}

export const ROUTE_ROLES = {
  '/students': ['admin', 'principal', 'mentor'],
  '/students/new': ['admin'],
  '/mentors': ['admin', 'principal'],
  '/attendance': ['admin', 'principal', 'mentor'],
  '/sabaq/new': ['admin', 'mentor'],
  '/fees': ['admin', 'principal', 'student', 'parent'],
  '/reminders': ['admin'],
  '/payment-settings': ['admin'],
  '/payment-verification': ['admin', 'principal'],
  '/hostel': ['admin', 'warden'],
  '/reports': ['admin', 'principal'],
  '/audit': ['admin', 'principal'],
  '/settings': ['admin'],
  '/admin/users': ['admin'],
  '/journey': ['student', 'parent'],
  '/progress-report': ['admin', 'principal', 'mentor', 'parent'],
  '/exams': ['admin', 'principal', 'mentor', 'student', 'parent'],
  '/sabaq': ['admin', 'principal', 'mentor', 'student', 'parent'],
  '/library': ['admin', 'principal', 'mentor', 'student', 'parent'],
}

export const PAGE_TITLES = [
  ['/dashboard', 'Dashboard'], ['/students/new', 'Add Student'], ['/students', 'Students'], ['/mentors', 'Mentors'],
  ['/attendance', 'Attendance'], ['/sabaq/new', 'Record Sabaq'], ['/sabaq', 'Sabaq Records'], ['/journey', 'Learning'],
  ['/progress-report', 'Progress Report'], ['/exams', 'Examinations'], ['/report-card', 'Report Card'], ['/fees', 'Fees'],
  ['/reminders', 'Fee Reminders'], ['/payment-settings', 'Fee Payment Settings'], ['/payment-verification', 'Payment Verification'], ['/hostel', 'Hostel'], ['/library', 'Library'], ['/reports', 'Reports'],
  ['/audit', 'Activity Log'], ['/notifications', 'Notifications'], ['/settings', 'Settings'], ['/admin/users', 'Users & Access'], ['/account/security', 'Account security'],
]
