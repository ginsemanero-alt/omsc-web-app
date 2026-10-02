import { useCallback, useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import TopNavBar from '../components/layout/TopNavBar';
import ProgramManagement from '../components/admin/ProgramManager';
import MaterialLibrary from '../components/admin/MaterialLibrary';
import SurveyBuilder from '../components/admin/SurveyBuilder';
import AnalyticsDashboard from '../components/admin/AnalyticsDashboard';
import UserManagement from '../components/admin/UserManagement';
import ActivityLog from '../components/admin/ActivityLog';
import ArchiveScreen from '../components/admin/ArchiveScreen';
import AboutContentManager from '../components/admin/AboutContentManager';
import { useToast } from '../hooks/use-toast';
import { supabase } from '../lib/supabase';
import { getEffectiveProgramStatus } from '../lib/programStatus';
import { IEC_CATEGORIES } from '../lib/iecCategories';

interface AdminDashboardProps {
  onLogout: () => void;
}

type ContentTab = 'programs' | 'materials' | 'surveys';

const focusRing =
  'focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#A5B4FC]';

// A request for a child screen to do something (open a dialog, open one
// record). `n` changes on every request, so asking twice still fires.
export type OpenRequest = { n: number; id?: number };

// How many "Needs attention" items show before "Show all".
const ATTENTION_PREVIEW = 6;

interface AttentionItem {
  key: string;
  title: string;
  detail: string;
  action: string;
  onClick: () => void;
}

interface ContentSummary {
  programs: { id: number; title: string; date: string; date_display?: string | null; time_range?: string | null; status: string; entryCount: number }[];
  materialCount: number;
  categoriesCovered: number;
  knowledgeChecks: { id: number; title: string; status: string; program_id: number | null }[];
  // program id -> linked IEC materials students can see (PHASE 29)
  linkedCountByProgram: Record<number, number>;
}

// Read-only numbers for the stat cards and the "Needs attention" list.
async function fetchContentSummary(): Promise<ContentSummary> {
  const [programsRes, materialsRes, surveysRes, linksRes] = await Promise.all([
    supabase
      .from('programs')
      .select('id, title, date, date_display, time_range, status, program_entries(id)')
      .is('archived_at', null),
    supabase.from('materials').select('id, category').is('program_id', null).is('archived_at', null),
    supabase.from('surveys').select('id, title, status, program_id').eq('type', 'knowledge').is('archived_at', null),
    supabase.from('program_materials').select('program_id, materials(id, archived_at, program_id)'),
  ]);
  if (programsRes.error) throw programsRes.error;
  if (materialsRes.error) throw materialsRes.error;
  if (surveysRes.error) throw surveysRes.error;
  if (linksRes.error) throw linksRes.error;

  // Counted the way students see them: not archived, never handouts.
  const linkedCountByProgram: Record<number, number> = {};
  (linksRes.data || []).forEach((row: any) => {
    const material = row.materials;
    if (!material || material.archived_at || material.program_id !== null) return;
    linkedCountByProgram[row.program_id] = (linkedCountByProgram[row.program_id] || 0) + 1;
  });

  const categories = new Set((materialsRes.data || []).map((m: any) => m.category).filter(Boolean));
  return {
    programs: (programsRes.data || []).map((p: any) => ({ ...p, entryCount: (p.program_entries || []).length })),
    materialCount: (materialsRes.data || []).length,
    categoriesCovered: IEC_CATEGORIES.filter((c) => categories.has(c)).length,
    knowledgeChecks: (surveysRes.data || []) as ContentSummary['knowledgeChecks'],
    linkedCountByProgram,
  };
}

function StatCard({ label, value, note, dark = false }: { label: string; value: number | string; note: string; dark?: boolean }) {
  return (
    <div className={`px-6 py-[22px] rounded-[28px] flex flex-col gap-1 min-w-0 ${dark ? 'bg-[#1E1B4B] text-white' : 'bg-white'}`}>
      <span className={`text-sm font-semibold ${dark ? 'text-[#FBBF24]' : 'text-[#5B6477]'}`}>{label}</span>
      <span className={`font-bricolage font-extrabold text-[40px] leading-none tracking-[-0.02em] ${dark ? 'text-white' : 'text-[#1E1B4B]'}`}>
        {value}
      </span>
      <span className={`text-[13px] ${dark ? 'text-[#C7C9F2]' : 'text-[#5B6477]'}`}>{note}</span>
    </div>
  );
}

function ContentManagement() {
  const [tab, setTab] = useState<ContentTab>('programs');
  const [summary, setSummary] = useState<ContentSummary | null>(null);
  const [newProgramRequest, setNewProgramRequest] = useState<OpenRequest | null>(null);
  const [editProgramRequest, setEditProgramRequest] = useState<OpenRequest | null>(null);
  const [uploadRequest, setUploadRequest] = useState<OpenRequest | null>(null);
  const [openSurveyRequest, setOpenSurveyRequest] = useState<OpenRequest | null>(null);
  const [showAllAttention, setShowAllAttention] = useState(false);

  const refreshSummary = useCallback(() => {
    fetchContentSummary()
      .then(setSummary)
      .catch((err) => console.error('Content summary failed:', err));
  }, []);

  useEffect(() => {
    refreshSummary();
  }, [refreshSummary, tab]);

  const request = (setter: (r: OpenRequest) => void, id?: number) => setter({ n: Date.now(), id });

  const openProgram = (id: number) => {
    setTab('programs');
    request(setEditProgramRequest, id);
  };

  // "Needs attention": read-only checks on data that already exists.
  const attention: AttentionItem[] = [];
  if (summary) {
    // An active knowledge check whose program has no linked IEC materials
    // (e.g. they were unlinked or archived after it went live): students
    // can't unlock its post-test.
    for (const check of summary.knowledgeChecks.filter((c) => c.status === 'active')) {
      if (check.program_id == null || summary.linkedCountByProgram[check.program_id]) continue;
      const program = summary.programs.find((p) => p.id === check.program_id);
      attention.push({
        key: `no-materials-${check.id}`,
        title: `${(program?.title || check.title).trim()} has no linked IEC materials`,
        detail: 'Its knowledge check is active, but students can’t unlock the post-test until materials are linked.',
        action: 'Link materials',
        onClick: () => (program ? openProgram(program.id) : setTab('programs')),
      });
    }
    for (const check of summary.knowledgeChecks.filter((c) => c.status === 'draft')) {
      attention.push({
        key: `draft-${check.id}`,
        title: `${check.title} is still a draft`,
        detail: 'Students can’t take it until it is published.',
        action: 'Open',
        onClick: () => {
          setTab('surveys');
          request(setOpenSurveyRequest, check.id);
        },
      });
    }
    for (const program of summary.programs) {
      if (program.status === 'ongoing' && getEffectiveProgramStatus(program) === 'completed') {
        attention.push({
          key: `ended-${program.id}`,
          title: `${program.title.trim()} is marked ongoing`,
          detail: 'Its date has passed. Update its status if it has ended.',
          action: 'Edit program',
          onClick: () => openProgram(program.id),
        });
      }
    }
    for (const program of summary.programs.filter((p) => p.entryCount === 0)) {
      attention.push({
        key: `entries-${program.id}`,
        title: `${program.title.trim()} has no timeline entries`,
        detail: 'Students see "What the program covered" only when it has entries.',
        action: 'Add entries',
        onClick: () => openProgram(program.id),
      });
    }
  }

  const ongoingCount = summary ? summary.programs.filter((p) => getEffectiveProgramStatus(p) === 'ongoing').length : 0;
  const draftChecks = summary ? summary.knowledgeChecks.filter((c) => c.status === 'draft').length : 0;
  const checkCount = summary?.knowledgeChecks.length ?? 0;

  const tabs: { value: ContentTab; label: string }[] = [
    { value: 'programs', label: 'Programs' },
    { value: 'materials', label: 'IEC materials' },
    { value: 'surveys', label: 'Assessments' },
  ];

  return (
    <div className="flex flex-col gap-6 font-figtree text-[#1E293B]">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-4 md:gap-6">
        <div className="flex flex-col gap-1.5 min-w-0">
          <h1 className="m-0 font-bricolage font-extrabold text-[36px] md:text-[44px] leading-[1.05] tracking-[-0.025em] text-[#1E1B4B]">
            Content
          </h1>
          <p className="m-0 text-base text-[#5B6477]">
            Programs, IEC materials, and knowledge checks of the Guidance and Testing Center.
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              setTab('materials');
              request(setUploadRequest);
            }}
            className={`h-12 px-5 rounded-2xl border-[1.5px] border-[#DDE1EE] bg-white text-[#1E1B4B] font-bold text-[15px] hover:border-[#A5B4FC] transition-colors ${focusRing}`}
          >
            Upload material
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('programs');
              request(setNewProgramRequest);
            }}
            className={`h-12 px-[22px] rounded-2xl bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold text-[15px] transition-colors ${focusRing}`}
          >
            New program
          </button>
        </div>
      </div>

      {/* Stats (all from the current data) */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4">
        <StatCard label="Programs" value={summary ? summary.programs.length : '–'} note={summary ? `${ongoingCount} ongoing` : 'Loading...'} />
        <StatCard
          label="IEC materials"
          value={summary ? summary.materialCount : '–'}
          note={summary ? `${summary.categoriesCovered} of ${IEC_CATEGORIES.length} categories covered` : 'Loading...'}
        />
        <StatCard
          label="Knowledge checks"
          value={summary ? checkCount : '–'}
          note={
            !summary
              ? 'Loading...'
              : checkCount === 0
                ? 'None yet'
                : draftChecks === checkCount
                  ? 'All in draft'
                  : `${draftChecks} ${draftChecks === 1 ? 'draft' : 'drafts'}`
          }
        />
        <StatCard
          dark
          label="Needs attention"
          value={summary ? attention.length : '–'}
          note={!summary ? 'Loading...' : attention.length > 0 ? 'See the list below' : 'All clear'}
        />
      </div>

      {/* Needs attention (hidden when empty) */}
      {attention.length > 0 && (
        <section aria-labelledby="attention-heading" className="px-5 py-5 md:px-7 md:py-6 rounded-[32px] bg-white flex flex-col gap-3.5">
          <h2 id="attention-heading" className="m-0 font-bold text-lg text-[#1E1B4B]">
            Needs attention
          </h2>
          <ul className="m-0 p-0 list-none grid grid-cols-1 lg:grid-cols-2 gap-3">
            {(showAllAttention ? attention : attention.slice(0, ATTENTION_PREVIEW)).map((item) => (
              <li key={item.key} className="px-[18px] py-4 rounded-[22px] bg-[#FFFBEB] flex flex-wrap sm:flex-nowrap gap-x-3.5 gap-y-1 items-start">
                <span className="w-2.5 h-2.5 mt-1.5 shrink-0 rounded-full bg-[#F59E0B]" aria-hidden="true" />
                <span className="flex-1 min-w-[calc(100%-24px)] sm:min-w-0 flex flex-col gap-1">
                  <span className="font-bold text-[15px] text-[#1E1B4B] break-words">{item.title}</span>
                  <span className="text-sm leading-normal text-[#5B6477]">{item.detail}</span>
                </span>
                <button
                  type="button"
                  onClick={item.onClick}
                  className={`shrink-0 min-h-[44px] ml-6 sm:ml-0 sm:-my-2.5 px-2 rounded-xl font-bold text-sm text-[#4338CA] hover:underline ${focusRing}`}
                >
                  {item.action}
                </button>
              </li>
            ))}
          </ul>
          {attention.length > ATTENTION_PREVIEW && (
            <button
              type="button"
              onClick={() => setShowAllAttention((v) => !v)}
              aria-expanded={showAllAttention}
              className={`self-start min-h-[44px] px-4 rounded-xl border-[1.5px] border-[#DDE1EE] bg-white font-bold text-sm text-[#1E1B4B] hover:border-[#A5B4FC] ${focusRing}`}
            >
              {showAllAttention ? 'Show fewer' : `Show all ${attention.length}`}
            </button>
          )}
        </section>
      )}

      {/* Tabs */}
      <div role="tablist" aria-label="Content sections" className="self-start max-w-full overflow-x-auto flex gap-1 p-[5px] rounded-full bg-white">
        {tabs.map((t) => (
          <button
            key={t.value}
            type="button"
            role="tab"
            id={`content-tab-${t.value}`}
            aria-selected={tab === t.value}
            aria-controls={`content-panel-${t.value}`}
            onClick={() => setTab(t.value)}
            className={`h-11 px-[18px] rounded-full text-sm whitespace-nowrap transition-colors ${focusRing} ${
              tab === t.value ? 'bg-[#1E1B4B] text-white font-bold' : 'text-[#334155] font-semibold hover:bg-[#EEF0FA]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`content-panel-${tab}`} aria-labelledby={`content-tab-${tab}`}>
        {tab === 'programs' && (
          <ProgramManagement newRequest={newProgramRequest} editRequest={editProgramRequest} onChanged={refreshSummary} />
        )}
        {tab === 'materials' && <MaterialLibrary uploadRequest={uploadRequest} onChanged={refreshSummary} />}
        {tab === 'surveys' && <SurveyBuilder openRequest={openSurveyRequest} onChanged={refreshSummary} />}
      </div>
    </div>
  );
}

export default function AdminDashboard({ onLogout }: AdminDashboardProps) {
  const location = useLocation();
  const { toast } = useToast();

  const navigationItems = [
    { label: 'Content', path: '/admin', icon: 'FolderOpen' },
    { label: 'Analytics', path: '/admin/analytics', icon: 'BarChart3' },
    { label: 'Users', path: '/admin/users', icon: 'Users' },
    { label: 'Activity Log', path: '/admin/activity-log', icon: 'History' },
    { label: 'Archive', path: '/admin/archive', icon: 'Archive' },
    { label: 'About Page', path: '/admin/about', icon: 'Info' },
  ];

  const handleLogoutWithToast = () => {
    toast({
      title: "Signed out",
      description: "You have been signed out of the admin panel.",
      className: "bg-emerald-600 text-white font-bold border-none rounded-3xl shadow-2xl py-6",
    });

    setTimeout(() => {
      onLogout();
    }, 1200);
  };

  return (
    <div className="min-h-screen bg-[#EEF0FA] antialiased selection:bg-indigo-600 selection:text-white">
      <TopNavBar
        role="admin"
        userName="Admin Configuration Root"
        campus="System Wide"
        onLogout={handleLogoutWithToast}
        navigationItems={navigationItems}
        currentPath={location.pathname}
      />

      {/* Beside the fixed sidebar on desktop (264px + 16px inset on each
          side); under the top bar below lg. */}
      <main className="lg:pl-[296px] pt-[72px] lg:pt-0 min-w-0">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-10 pt-4 pb-10 lg:pt-9 lg:pb-12 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500">
          <Routes>
            <Route path="/" element={<ContentManagement />} />
            <Route path="/analytics" element={<AnalyticsDashboard />} />
            <Route path="/reports" element={<Navigate to="/admin/analytics" replace />} />
            <Route path="/users" element={<UserManagement />} />
            <Route path="/activity-log" element={<ActivityLog />} />
            <Route path="/archive" element={<ArchiveScreen />} />
            <Route path="/about" element={<AboutContentManager />} />
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}
