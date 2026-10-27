import { supabase } from './supabase';

// Shared by the public About page and its admin editor, so both always agree
// on the fields, the fallback wording, and how images and links are built.

export interface AboutContent {
  heading_title: string;
  hero_intro: string;
  director_name: string;
  director_title: string;
  collaborative_approach_text: string;
  contact_email: string;
  contact_facebook: string;
  contact_phone: string;
  // PHASE 40 (all optional: an empty one is simply not shown)
  vision: string;
  mission: string;
  office_location: string;
  office_hours: string;
  system_credits: string;
  contact_facebook_url: string;
  objectives: string[] | null; // null = show the standard objectives
  hero_image_path: string | null;
  org_chart_path: string | null;
  updated_at: string | null;
}

export const DEFAULT_OBJECTIVES = [
  "To maintain the highest quality of assistance and support to the academic community by providing relevant and timely programs, services, and information in the area of students' personal, social, educational and career development in all educational levels of the colleges.",
  'To provide high-quality placement and diagnostic services to students of their aptitudes and interests toward better degree selection and career decision-making.',
  'To develop relevant and responsive student-oriented programs aimed at the mental and social health of students to promote healthy and harmonious relationship among students, teachers and administrative staff.',
];

// Shown until the DB row loads (and if it's ever missing) so the page never
// renders blank.
export const FALLBACK_CONTENT: AboutContent = {
  heading_title: 'The Guidance and Testing Center',
  hero_intro:
    'The Guidance and Testing Center is an essential and integral part of the overall educational process. School counselors, working within the framework of the program, make major contributions to the primary educational mission and vision of the institution by providing students with Guidance and Counseling activities and services that facilitate and enhance their academic, career, and personal and social development.',
  director_name: 'Dr. Angelina C. Paquibot',
  director_title: 'Guidance and Testing Center Director',
  collaborative_approach_text:
    'While school Counselors are available to respond to the unique needs of each student, the Guidance and Counseling approach is collaborative among teachers, parents and administrators. As a developmental program, it addresses the needs of all students in OMSU by facilitating their growth as well as helping to create positive and safe learning environments.',
  contact_email: 'guidanceofficeomsc@gmail.com',
  contact_facebook: 'OMSU Guidance and Testing Center',
  contact_phone: '043-491-0925 / 09632086253',
  vision: '',
  mission: '',
  office_location: '',
  office_hours: '',
  system_credits: '',
  contact_facebook_url: '',
  objectives: null,
  hero_image_path: null,
  org_chart_path: null,
  updated_at: null,
};

// The row as it comes back from the database (older rows, or a database that
// has not had PHASE 40 yet, lack the newer columns): anything missing or null
// falls back, so the page can never be blank.
export function normalizeAboutContent(row: Partial<Record<keyof AboutContent, unknown>> | null | undefined): AboutContent {
  if (!row) return FALLBACK_CONTENT;
  const text = (key: keyof AboutContent, fallback: string) => {
    const value = row[key];
    return typeof value === 'string' ? value : fallback;
  };
  const required = (key: keyof AboutContent) => {
    const value = row[key];
    return typeof value === 'string' && value.trim() ? value : (FALLBACK_CONTENT[key] as string);
  };
  const objectives = Array.isArray(row.objectives)
    ? (row.objectives as unknown[]).filter((o): o is string => typeof o === 'string' && o.trim().length > 0)
    : [];
  const path = (key: 'hero_image_path' | 'org_chart_path') => {
    const value = row[key];
    return typeof value === 'string' && value.trim() ? value : null;
  };
  return {
    heading_title: required('heading_title'),
    hero_intro: required('hero_intro'),
    director_name: required('director_name'),
    director_title: required('director_title'),
    collaborative_approach_text: required('collaborative_approach_text'),
    contact_email: required('contact_email'),
    contact_facebook: required('contact_facebook'),
    contact_phone: required('contact_phone'),
    vision: text('vision', ''),
    mission: text('mission', ''),
    office_location: text('office_location', ''),
    office_hours: text('office_hours', ''),
    system_credits: text('system_credits', ''),
    contact_facebook_url: text('contact_facebook_url', ''),
    objectives: objectives.length > 0 ? objectives : null,
    hero_image_path: path('hero_image_path'),
    org_chart_path: path('org_chart_path'),
    updated_at: typeof row.updated_at === 'string' ? row.updated_at : null,
  };
}

// ----- Images (public-read bucket, admin-only writes) ---------------------

export const ABOUT_BUCKET = 'about-assets';
export const ABOUT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const ABOUT_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
export const ABOUT_IMAGE_TYPES_LABEL = 'PNG, JPG or WebP';

// null when fine, otherwise the message to show.
export function checkAboutImage(file: File): string | null {
  if (!ABOUT_IMAGE_TYPES.includes(file.type)) return `Please choose a ${ABOUT_IMAGE_TYPES_LABEL} image.`;
  if (file.size > ABOUT_IMAGE_MAX_BYTES) return 'The image must be 5 MB or smaller.';
  return null;
}

// The public address of a stored image. ?v= changes whenever the row is saved,
// so a replaced picture shows right away instead of the browser's old copy.
export function aboutImageUrl(path: string | null, updatedAt: string | null): string | null {
  if (!path) return null;
  const base = supabase.storage.from(ABOUT_BUCKET).getPublicUrl(path).data.publicUrl;
  const version = updatedAt ? Date.parse(updatedAt) : NaN;
  return Number.isFinite(version) ? `${base}?v=${version}` : base;
}

// ----- Links ----------------------------------------------------------------

// "043-491-0925 / 09632086253" -> [{ label, href }]
export function parsePhones(value: string): { label: string; href: string }[] {
  return (value || '')
    .split('/')
    .map((n) => n.trim())
    .filter(Boolean)
    .map((label) => ({ label, href: `tel:${label.replace(/[^\d+]/g, '')}` }))
    .filter((p) => p.href.length > 4);
}

// A Facebook (or any) page link must be https. null when it is not usable.
export function safeHttpsUrl(value: string): string | null {
  const trimmed = (value || '').trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

// ----- Fixed content --------------------------------------------------------

// NCMH Crisis Hotline (National Center for Mental Health): free, confidential,
// 24/7. Numbers checked against published listings; confirm with the Guidance
// Office before a defense, since carriers occasionally change them.
export const HOTLINES = [
  { number: '1553', note: 'Landline, toll-free', href: 'tel:1553' },
  { number: '0919-057-1553', note: 'Smart / TNT', href: 'tel:09190571553' },
  { number: '0917-899-8727', note: 'Globe / TM', href: 'tel:09178998727' },
];
export const EMERGENCY = { number: '911', href: 'tel:911' };

// The six guidance services (the exact names programs are tagged with).
// Wording is a draft for the Guidance Office to review.
export const SERVICES = [
  {
    name: 'Information Services',
    desc: 'Timely information on school programs, student services, and campus life, shared through activities and materials.',
  },
  {
    name: 'Individual Inventory',
    desc: "Gathering each student's background and personal data, kept confidential, to understand and support them better.",
  },
  {
    name: 'Research and Evaluation',
    desc: 'Studying student needs and checking how well our programs work, so services keep improving.',
  },
  {
    name: 'Career Orientation',
    desc: 'Helping students explore careers, choose a course, and plan for life after graduation.',
  },
  {
    name: 'Testing Services',
    desc: 'Psychological tests and assessments of aptitudes, interests, and abilities, with results explained by our staff.',
  },
  {
    name: 'Counseling Services',
    desc: 'Confidential one-to-one and small-group counseling for personal, social, academic, and career concerns.',
  },
];

export const COMPONENTS = [
  {
    title: 'Group Guidance',
    desc: 'Structured group and classroom presentations aimed at collective proactive student growth.',
    dot: 'bg-[#4F46E5]',
  },
  {
    title: 'Individual Student Planning',
    desc: 'Student appraisal, educational and career planning, and assistance with course selection and placement.',
    dot: 'bg-[#7C3AED]',
  },
  {
    title: 'Responsive Services',
    desc: 'Individual and small-group counseling, peer support, crisis response, and referral to other professionals.',
    dot: 'bg-[#F472B6]',
  },
  {
    title: 'System Support',
    desc: 'Program management, staff development, community outreach, and research and evaluation.',
    dot: 'bg-[#FBBF24]',
  },
];

export const SYSTEM_STEPS = [
  { title: 'Read the materials', desc: 'Open the information materials that come with each guidance program.' },
  { title: 'Take the awareness check', desc: 'Answer a short pre-test before the program and a post-test after you finish the materials.' },
  { title: 'See your results', desc: 'Compare your pre-test and post-test scores and review what you answered.' },
];

export const SYSTEM_PURPOSE =
  'This system shares the Center\'s guidance programs and materials with students, and measures what students learn from them through a short awareness check taken before (pre-test) and after (post-test) each program.';
