// Official program offerings per campus — the one list used by both
// registration (LoginPage.tsx) and the student's own profile edit
// (StudentProfile.tsx). profiles.program is plain text that Analytics
// groups on, so every screen must write exactly these spellings: no
// "(BSIT)"-style abbreviations, majors written "… major in X", matching
// the official student roster already in the system. Two spellings of
// one course show up as two separate courses in every chart.
//
// Undergraduate only — graduate programs were removed from registration
// on purpose (see the note that used to live in LoginPage.tsx).
export const PROGRAMS_BY_CAMPUS: Record<string, string[]> = {
  'Labangan Campus': [
    'Bachelor of Science in Social Work',
    'Bachelor of Science in Development Communication',
    'Bachelor of Arts in History',
    'Bachelor of Arts in Communication',
    'Bachelor in Human Services',
    'Bachelor of Business Administration major in Financial Management',
    'Bachelor of Business Administration major in Operations Management',
    'Bachelor of Science in Accounting Information System',
    'Bachelor of Science in Office Administration',
    'Bachelor of Public Administration',
    'Bachelor of Science in Hospitality Management',
    'Bachelor of Science in Management Accounting',
    'Bachelor of Science in Accountancy',
    'Bachelor of Science in Architecture',
    'Bachelor of Science in Civil Engineering',
    'Bachelor of Science in Electrical Engineering',
    'Bachelor of Science in Industrial Engineering',
    'Bachelor of Science in Criminology',
    'Bachelor of Science in Industrial Security Management',
    'Other',
  ],
  'San Jose Campus': [
    'Bachelor of Elementary Education',
    'Bachelor of Secondary Education major in English',
    'Bachelor of Secondary Education major in Filipino',
    'Bachelor of Secondary Education major in Mathematics',
    'Bachelor of Secondary Education major in Science',
    'Teacher Certificate Program',
    'Bachelor of Technology and Livelihood Education major in Home Economics',
    'Bachelor of Technical-Vocational Teacher Education major in Automotive Technology',
    'Bachelor of Technical-Vocational Teacher Education major in Electrical Technology',
    'Bachelor of Technical-Vocational Teacher Education major in Electronics Technology',
    'Bachelor of Technical-Vocational Teacher Education major in Food Technology and Service Management',
    'Bachelor of Technical-Vocational Teacher Education major in Welding and Fabrication Technology',
    'Bachelor of Physical Education',
    'Bachelor of Science in Information Technology',
    'Bachelor of Science in Midwifery',
    'Diploma in Midwifery',
    'Other',
  ],
  'Murtha Campus': [
    'Bachelor of Technical-Vocational Teacher Education major in Animal Production',
    'Bachelor of Technical-Vocational Teacher Education major in Horticulture',
    'Bachelor of Technical-Vocational Teacher Education major in Agricultural Crops Production',
    'Bachelor of Science in Agriculture',
    'Bachelor of Science in Agroforestry',
    'Other',
  ],
};

// Every program across all campuses, for a student whose campus is
// unknown.
export const ALL_PROGRAMS: string[] = [
  ...new Set(Object.values(PROGRAMS_BY_CAMPUS).flat()),
];

// Stored as "1".."4" (what registration writes and Analytics reads).
export const YEAR_LEVELS: { value: string; label: string }[] = [
  { value: '1', label: '1st Year' },
  { value: '2', label: '2nd Year' },
  { value: '3', label: '3rd Year' },
  { value: '4', label: '4th Year' },
];

// Older rows may hold "4th Year"-style values; read them as "4".
export function normalizeYearLevel(value: string | null | undefined): string {
  const digit = String(value ?? '').match(/[1-9]/);
  return digit ? digit[0] : '';
}
