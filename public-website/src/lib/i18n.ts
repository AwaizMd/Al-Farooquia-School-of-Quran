export const LANGS = ['en', 'ar'] as const
export type Lang = (typeof LANGS)[number]
export const isLang = (x: string): x is Lang => (LANGS as readonly string[]).includes(x)
export const dirOf = (l: Lang) => (l === 'ar' ? 'rtl' : 'ltr')
/** English lives at the root; Arabic under /ar. */
export const href = (l: Lang, path: string) => (l === 'en' ? path : `/ar${path === '/' ? '' : path}`)

const en = {
  home: 'Home', about: 'About', programs: 'Programs', halaqas: 'Halaqas', admissions: 'Admissions', news: 'News', events: 'Events', contact: 'Contact', menu: 'Menu', close: 'Close',
  register: 'Register', apply: 'Apply for admission', applyNow: 'Apply now', enquire: 'Send an enquiry', readMore: 'Read more', allNews: 'All news', allEvents: 'All events', allPrograms: 'All programs', allHalaqas: 'All Halaqas',
  mission: 'Mission', vision: 'Vision', principal: 'From the Principal', history: 'Our history', philosophy: 'Educational philosophy', achievements: 'Achievements', facilities: 'Facilities',
  ourPrograms: 'Our programs', latestNews: 'Latest announcements', upcoming: 'Upcoming events', halaqaIntro: 'Halaqas', admissionOpen: 'Admissions', contactUs: 'Contact us', visit: 'Visit us',
  eligibility: 'Eligibility', duration: 'Duration', timings: 'Timings', seats: 'Available seats', howToRegister: 'How to register', schedule: 'Schedule', location: 'Location', category: 'Category', date: 'Date', time: 'Time', venue: 'Venue', instructions: 'Registration', contactInfo: 'Contact',
  process: 'Admission process', requiredDocuments: 'Required documents', importantDates: 'Important dates', availablePrograms: 'Available programs', faq: 'Frequently asked questions',
  address: 'Address', phone: 'Phone', email: 'Email', hours: 'Office hours', map: 'Open in maps', privacy: 'Privacy notice', published: 'Published', nothing: 'Nothing has been published here yet.', notFound: 'This page could not be found.', backHome: 'Back to the home page',
  regAdmission: 'Student admission', regHalaqa: 'Halaqa registration', regMureed: 'Mureed registration', regEvent: 'Event registration', regEnquiry: 'General enquiry', closedForm: 'This form is not open at the moment.',
  fullName: 'Full name', studentName: 'Student’s full name', yourPhone: 'Phone number', yourEmail: 'Email address', contactHint: 'Give at least a phone number or an email address, so we can reach you.', chooseHalaqa: 'Preferred Halaqa', chooseEvent: 'Event', chooseProgram: 'Preferred program', choose: 'Choose…', optional: 'optional',
  documents: 'Documents', documentsHint: 'PDF or image, up to 5 MB each, at most 5 files.', send: 'Send', sending: 'Sending…', received: 'We have received your application', referenceIs: 'Your reference number is', keepRef: 'Please keep it. You can use it to check the status of your application.', checkStatus: 'Check application status', tryAgain: 'Something went wrong. Your details are still here. Please try again.', offline: 'We could not reach the server. Check your connection; your details are still here.', fixFields: 'Please correct the highlighted fields.',
  statusTitle: 'Application status', reference: 'Reference number', contactUsed: 'Phone or email used in the application', check: 'Check', statusNotFound: 'We could not find an application with those details.', status_PENDING: 'Received, waiting for review', status_INFO_REQUESTED: 'More information is needed: please check your email', status_APPROVED: 'Accepted', status_REJECTED: 'Not accepted', status_CLOSED: 'Closed', receivedOn: 'Received on',
  respondTitle: 'Send the information requested', yourReply: 'Your reply', replySent: 'Thank you. Your reply has been sent.', linkInvalid: 'This link has expired or was already used. Please contact the office.',
  previewBanner: 'Preview. This is not visible to the public.', days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], weekly: 'Weekly', monthly: 'Monthly', oneOff: 'One gathering', custom: 'By arrangement', registrationClosed: 'Registration is closed', rights: 'All rights reserved.', language: 'العربية', skip: 'Skip to content',
}
export type Dict = typeof en
const ar: Dict = {
  home: 'الرئيسية', about: 'من نحن', programs: 'البرامج', halaqas: 'الحلقات', admissions: 'القبول', news: 'الأخبار', events: 'الفعاليات', contact: 'اتصل بنا', menu: 'القائمة', close: 'إغلاق',
  register: 'التسجيل', apply: 'التقديم للقبول', applyNow: 'قدّم الآن', enquire: 'أرسل استفسارًا', readMore: 'اقرأ المزيد', allNews: 'كل الأخبار', allEvents: 'كل الفعاليات', allPrograms: 'كل البرامج', allHalaqas: 'كل الحلقات',
  mission: 'رسالتنا', vision: 'رؤيتنا', principal: 'كلمة المدير', history: 'تاريخنا', philosophy: 'فلسفتنا التعليمية', achievements: 'الإنجازات', facilities: 'المرافق',
  ourPrograms: 'برامجنا', latestNews: 'آخر الإعلانات', upcoming: 'الفعاليات القادمة', halaqaIntro: 'الحلقات', admissionOpen: 'القبول', contactUs: 'اتصل بنا', visit: 'زورونا',
  eligibility: 'شروط الالتحاق', duration: 'المدة', timings: 'المواعيد', seats: 'المقاعد المتاحة', howToRegister: 'طريقة التسجيل', schedule: 'الموعد', location: 'المكان', category: 'التصنيف', date: 'التاريخ', time: 'الوقت', venue: 'المكان', instructions: 'التسجيل', contactInfo: 'للتواصل',
  process: 'خطوات القبول', requiredDocuments: 'المستندات المطلوبة', importantDates: 'تواريخ مهمة', availablePrograms: 'البرامج المتاحة', faq: 'الأسئلة الشائعة',
  address: 'العنوان', phone: 'الهاتف', email: 'البريد الإلكتروني', hours: 'ساعات العمل', map: 'افتح في الخرائط', privacy: 'إشعار الخصوصية', published: 'نُشر في', nothing: 'لم يُنشر شيء هنا بعد.', notFound: 'تعذر العثور على هذه الصفحة.', backHome: 'العودة إلى الرئيسية',
  regAdmission: 'قبول طالب', regHalaqa: 'التسجيل في حلقة', regMureed: 'تسجيل مريد', regEvent: 'التسجيل في فعالية', regEnquiry: 'استفسار عام', closedForm: 'هذا النموذج غير متاح حاليًا.',
  fullName: 'الاسم الكامل', studentName: 'الاسم الكامل للطالب', yourPhone: 'رقم الهاتف', yourEmail: 'البريد الإلكتروني', contactHint: 'أدخل رقم هاتف أو بريدًا إلكترونيًا على الأقل لنتمكن من التواصل معك.', chooseHalaqa: 'الحلقة المفضلة', chooseEvent: 'الفعالية', chooseProgram: 'البرنامج المفضل', choose: 'اختر…', optional: 'اختياري',
  documents: 'المستندات', documentsHint: 'ملف PDF أو صورة، حتى 5 ميغابايت لكل ملف، وخمسة ملفات كحد أقصى.', send: 'إرسال', sending: 'جارٍ الإرسال…', received: 'تم استلام طلبك', referenceIs: 'رقمك المرجعي هو', keepRef: 'يرجى الاحتفاظ به، فيمكنك استخدامه لمعرفة حالة طلبك.', checkStatus: 'معرفة حالة الطلب', tryAgain: 'حدث خطأ. بياناتك ما زالت هنا، يرجى المحاولة مرة أخرى.', offline: 'تعذر الوصول إلى الخادم. تحقق من اتصالك؛ بياناتك ما زالت هنا.', fixFields: 'يرجى تصحيح الحقول المحددة.',
  statusTitle: 'حالة الطلب', reference: 'الرقم المرجعي', contactUsed: 'الهاتف أو البريد المستخدم في الطلب', check: 'تحقق', statusNotFound: 'لم نجد طلبًا بهذه البيانات.', status_PENDING: 'تم الاستلام، بانتظار المراجعة', status_INFO_REQUESTED: 'نحتاج إلى معلومات إضافية: يرجى مراجعة بريدك', status_APPROVED: 'مقبول', status_REJECTED: 'غير مقبول', status_CLOSED: 'مغلق', receivedOn: 'تاريخ الاستلام',
  respondTitle: 'إرسال المعلومات المطلوبة', yourReply: 'ردك', replySent: 'شكرًا لك. تم إرسال ردك.', linkInvalid: 'انتهت صلاحية هذا الرابط أو تم استخدامه. يرجى التواصل مع المكتب.',
  previewBanner: 'معاينة. هذا غير ظاهر للعامة.', days: ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'], weekly: 'أسبوعيًا', monthly: 'شهريًا', oneOff: 'لقاء واحد', custom: 'حسب الترتيب', registrationClosed: 'التسجيل مغلق', rights: 'جميع الحقوق محفوظة.', language: 'English', skip: 'تخطَّ إلى المحتوى',
}
export const dict = (l: Lang): Dict => (l === 'ar' ? ar : en)
