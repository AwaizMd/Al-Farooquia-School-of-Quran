// Branding and institution configuration. Replace these values with the real
// Madarsa's details when preparing a deployment. Admins can also override the
// name and currency at runtime from Settings (stored locally in the demo).
export const DEFAULT_SETTINGS = {
  brandName: 'Al Farooquia School of Quran',
  shortName: 'Al Farooquia',
  brandArabic: 'مدرسۃ القرآن الفاروقیۃ',
  tagline: 'Madarsa Management System',
  address: 'Hyderabad, Telangana, India',
  phone: '+00 0000 000000',
  email: 'office@farooquia.demo',
  currency: 'INR',
  weeklyOff: 5, // 0 = Sunday … 5 = Friday
  feeDueDay: 10,
}

export const CURRENCIES = {
  INR: { code: 'INR', symbol: '₹', locale: 'en-IN', label: 'Indian Rupee (₹)' },
  PKR: { code: 'PKR', symbol: 'Rs', locale: 'en-PK', label: 'Pakistani Rupee (Rs)' },
  BDT: { code: 'BDT', symbol: '৳', locale: 'en-IN', label: 'Bangladeshi Taka (৳)' },
  GBP: { code: 'GBP', symbol: '£', locale: 'en-GB', label: 'British Pound (£)' },
  USD: { code: 'USD', symbol: '$', locale: 'en-US', label: 'US Dollar ($)' },
  AED: { code: 'AED', symbol: 'AED', locale: 'en-AE', label: 'UAE Dirham (AED)' },
}

export const STORAGE_KEY = 'farooquia-madarsa-demo-v2'
export const DEMO_PASSWORD = 'Demo123!'

export const DEMO_ACCOUNTS = [
  { role: 'admin', email: 'admin@farooquia.demo', userId: 'admin', label: 'Admin / Management', blurb: 'Full overview of students, fees, staff and reports' },
  { role: 'mentor', email: 'mentor@farooquia.demo', userId: 'm1', label: 'Mentor / Teacher', blurb: 'Record Sabaq, mark attendance, track your halqa' },
  { role: 'student', email: 'student@farooquia.demo', userId: 'S-1001', label: 'Student', blurb: 'Your learning journey, Sabaq history and library' },
  { role: 'parent', email: 'parent@farooquia.demo', userId: 'p1', label: 'Parent / Guardian', blurb: "Your children's progress, reports and fees" },
]

export const ADMIN_USER = { id: 'admin', name: 'Maulana Shoaib Akhtar', title: 'Muhtamim (Principal)', email: 'admin@farooquia.demo' }
