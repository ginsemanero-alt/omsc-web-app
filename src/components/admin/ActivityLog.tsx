import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Archive,
  Calendar,
  FileText,
  Loader2,
  LogIn,
  LogOut,
  Pencil,
  PlusCircle,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserPlus,
  History,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { ActivityEntityType } from '../../lib/activityLog';
import {
  ADMIN_ACTIONS,
  ADMIN_TYPES,
  NOUN,
  RANGES,
  STUDENT_ACTIONS,
  VERB,
  actionConditions,
  dayLabel,
  eventKind,
  fullLabel,
  rangeBounds,
  searchCondition,
  tabConditions,
  timeLabel,
  typeCondition,
  type ConsentRow,
  type EventKind,
  type LogRow,
  type LogTab,
} from '../../lib/activityLogView';

const PAGE_SIZE = 25;
const CONSENT_FETCH_LIMIT = 500;

const focusRing =
  'focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#A5B4FC]';
const fieldClass = `w-full h-11 rounded-2xl bg-[#F5F6FB] border-[1.5px] border-[#DDE1EE] px-4 text-sm font-semibold text-[#1E293B] ${focusRing}`;

const KIND_STYLE: Record<EventKind, { className: string; Icon: typeof PlusCircle }> = {
  created: { className: 'bg-emerald-50 text-emerald-700', Icon: PlusCircle },
  updated: { className: 'bg-indigo-50 text-indigo-700', Icon: Pencil },
  archived: { className: 'bg-amber-50 text-amber-700', Icon: Archive },
  restored: { className: 'bg-teal-50 text-teal-700', Icon: RotateCcw },
  permanently_deleted: { className: 'bg-rose-50 text-rose-700', Icon: Trash2 },
  deleted: { className: 'bg-rose-50 text-rose-700', Icon: Trash2 },
  removed_response: { className: 'bg-rose-50 text-rose-700', Icon: Trash2 },
  about: { className: 'bg-indigo-50 text-indigo-700', Icon: FileText },
  signed_in: { className: 'bg-sky-50 text-sky-700', Icon: LogIn },
  signed_out: { className: 'bg-slate-100 text-slate-600', Icon: LogOut },
  registered: { className: 'bg-emerald-50 text-emerald-700', Icon: UserPlus },
  opened_programs: { className: 'bg-slate-100 text-slate-600', Icon: Calendar },
  consent: { className: 'bg-emerald-50 text-emerald-700', Icon: ShieldCheck },
};

// One line of the feed, from either source (activity_logs or consent_log).
interface FeedItem {
  key: string;
  at: string;
  kind: EventKind;
  actorName: string;
  actorEmail: string;
  entityType?: ActivityEntityType;
  entityId?: string | null;
  entityLabel?: string | null;
  detail?: string | null;
}

type Existence = 'exists' | 'archived';
interface Found {
  state: Existence;
  email?: string | null;
}

const BIGINT_ID = /^\d+$/;
const UUID_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function consentUser(row: ConsentRow) {
  return Array.isArray(row.users) ? row.users[0] : row.users;
}

// Details worth showing under a line. The notes the page already turns into
// words ("Archived", "Restored from Archive"...) are not repeated.
function visibleDetail(row: LogRow, kind: EventKind): string | null {
  if (!row.details) return null;
  if (['archived', 'restored', 'permanently_deleted', 'registered'].includes(kind)) return null;
  return row.details;
}

export default function ActivityLog() {
  const [params, setParams] = useSearchParams();
  const tab: LogTab = params.get('tab') === 'student' ? 'student' : 'admin';
  const action = params.get('action') || 'all';
  const type = params.get('type') || 'all';
  const range = params.get('range') || 'all';
  const from = params.get('from') || '';
  const to = params.get('to') || '';
  const q = params.get('q') || '';

  const [searchInput, setSearchInput] = useState(q);
  const [loaded, setLoaded] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [missingTable, setMissingTable] = useState(false);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [consent, setConsent] = useState<ConsentRow[]>([]);
  const [found, setFound] = useState<Record<string, Found>>({});
  const requestId = useRef(0);

  // Filters live in the URL. Typing and picking replace the history entry;
  // switching tab is a real step (so Back returns to the other tab).
  const setFilter = (patch: Record<string, string>) => {
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        for (const [key, value] of Object.entries(patch)) {
          if (!value || value === 'all') next.delete(key);
          else next.set(key, value);
        }
        if (patch.range && patch.range !== 'custom') {
          next.delete('from');
          next.delete('to');
        }
        return next;
      },
      { replace: true }
    );
    setLoaded(PAGE_SIZE);
  };

  const switchTab = (next: LogTab) => {
    if (next === tab) return;
    setParams(next === 'admin' ? {} : { tab: next });
    setSearchInput('');
    setLoaded(PAGE_SIZE);
  };

  // The search box updates the URL after a short pause.
  useEffect(() => {
    if (searchInput === q) return;
    const timer = setTimeout(() => setFilter({ q: searchInput.trim() }), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);
  // Back / forward changes the URL: keep the box in step.
  useEffect(() => {
    setSearchInput(q);
  }, [q]);

  useEffect(() => {
    const id = ++requestId.current;
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      const bounds = rangeBounds(range, from, to);

      // ---- activity_logs (server-side filters, count and paging)
      const consentOnly = tab === 'student' && action === 'consent';
      let rows: LogRow[] = [];
      let total = 0;
      if (!consentOnly) {
        const conditions = [
          ...tabConditions(tab),
          ...actionConditions(tab, action),
          ...(tab === 'admin' ? typeCondition(type) : []),
          ...searchCondition(q),
        ];
        let query = supabase
          .from('activity_logs')
          .select('*', { count: 'exact' })
          // An OR of one AND-group is how PostgREST combines all the conditions.
          .or(`and(${conditions.join(',')})`);
        if (bounds.from) query = query.gte('created_at', bounds.from);
        if (bounds.to) query = query.lt('created_at', bounds.to);
        const { data, error, count } = await query
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .range(0, loaded - 1);

        if (cancelled || id !== requestId.current) return;
        if (error) {
          setMissingTable(error.code === 'PGRST205');
          setLogs([]);
          setLogsTotal(0);
          setConsent([]);
          setLoading(false);
          return;
        }
        rows = (data || []) as LogRow[];
        total = count ?? rows.length;
      }

      // ---- consent_log (student tab): few rows, merged by time
      let consentRows: ConsentRow[] = [];
      if (tab === 'student' && (action === 'all' || consentOnly)) {
        let cq = supabase.from('consent_log').select('id, consent_version, given_at, users(name, email)');
        if (bounds.from) cq = cq.gte('given_at', bounds.from);
        if (bounds.to) cq = cq.lt('given_at', bounds.to);
        const { data: cdata } = await cq.order('given_at', { ascending: false }).limit(CONSENT_FETCH_LIMIT);
        const needle = q.toLowerCase();
        consentRows = ((cdata || []) as unknown as ConsentRow[]).filter((row) => {
          if (!needle) return true;
          const who = consentUser(row);
          return `${who?.name || ''} ${who?.email || ''}`.toLowerCase().includes(needle);
        });
      }
      if (cancelled || id !== requestId.current) return;

      // ---- do the records an admin row mentions still exist? (for links)
      const lookups: Record<string, Found> = {};
      if (tab === 'admin') {
        const ids: Record<'program' | 'material' | 'survey' | 'user', Set<string>> = {
          program: new Set(),
          material: new Set(),
          survey: new Set(),
          user: new Set(),
        };
        rows.forEach((row) => {
          if (row.entity_id && row.entity_type !== 'about') {
            const ok = row.entity_type === 'survey' ? UUID_ID.test(row.entity_id) : BIGINT_ID.test(row.entity_id);
            if (ok) ids[row.entity_type].add(row.entity_id);
          }
        });
        const tables = { program: 'programs', material: 'materials', survey: 'surveys', user: 'users' } as const;
        await Promise.all(
          (Object.keys(ids) as (keyof typeof ids)[]).map(async (entity) => {
            if (ids[entity].size === 0) return;
            const select = entity === 'user' ? 'id, archived_at, email' : 'id, archived_at';
            const { data } = await supabase.from(tables[entity]).select(select).in('id', [...ids[entity]]);
            ((data || []) as any[]).forEach((record) => {
              lookups[`${entity}:${record.id}`] = { state: record.archived_at ? 'archived' : 'exists', email: record.email };
            });
          })
        );
        if (cancelled || id !== requestId.current) return;
      }

      setMissingTable(false);
      setLogs(rows);
      setLogsTotal(total);
      setConsent(consentRows);
      setFound(lookups);
      setLoading(false);
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [tab, action, type, range, from, to, q, loaded]);

  // ---- merge the two sources into one newest-first feed
  const { items, total, hasMore } = useMemo(() => {
    const consentOnly = tab === 'student' && action === 'consent';
    const oldestLoaded = !consentOnly && logs.length < logsTotal ? Date.parse(logs[logs.length - 1]?.created_at) : null;
    const consentShown = consentOnly
      ? consent.slice(0, loaded)
      : oldestLoaded
        ? consent.filter((row) => Date.parse(row.given_at) >= oldestLoaded)
        : consent;

    const feed: FeedItem[] = [
      ...logs.map((row): FeedItem => {
        const kind = eventKind(row);
        return {
          key: `log-${row.id}`,
          at: row.created_at,
          kind,
          actorName: row.actor_name || row.actor_email,
          actorEmail: row.actor_email,
          entityType: row.entity_type,
          entityId: row.entity_id,
          entityLabel: row.entity_label,
          detail: visibleDetail(row, kind),
        };
      }),
      ...consentShown.map((row): FeedItem => {
        const who = consentUser(row);
        return {
          key: `consent-${row.id}`,
          at: row.given_at,
          kind: 'consent',
          actorName: who?.name || who?.email || 'A student',
          actorEmail: who?.email || '',
          detail: `Version ${row.consent_version}`,
        };
      }),
    ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

    return {
      items: feed,
      total: (consentOnly ? 0 : logsTotal) + consent.length,
      hasMore: (!consentOnly && logs.length < logsTotal) || consentShown.length < consent.length,
    };
  }, [logs, logsTotal, consent, tab, action, loaded]);

  const groups = useMemo(() => {
    const result: { label: string; rows: FeedItem[] }[] = [];
    items.forEach((item) => {
      const label = dayLabel(item.at);
      const last = result[result.length - 1];
      if (last && last.label === label) last.rows.push(item);
      else result.push({ label, rows: [item] });
    });
    return result;
  }, [items]);

  const actionOptions = tab === 'admin' ? ADMIN_ACTIONS : STUDENT_ACTIONS;
  const filtersActive = action !== 'all' || type !== 'all' || range !== 'all' || !!q;

  const linkFor = (item: FeedItem): { href: string; external?: boolean } | null => {
    if (!item.entityType) return null;
    if (item.entityType === 'about') return { href: '/admin/about' };
    const hit = item.entityId ? found[`${item.entityType}:${item.entityId}`] : undefined;
    if (!hit || hit.state !== 'exists') return null;
    if (item.entityType === 'program') return { href: `/admin?tab=programs&open=${item.entityId}` };
    if (item.entityType === 'material') return { href: `/admin?tab=materials&open=${item.entityId}` };
    if (item.entityType === 'survey') return { href: `/admin?tab=surveys&open=${item.entityId}` };
    return { href: `/admin/users?search=${encodeURIComponent(hit.email || item.entityLabel || '')}` };
  };

  const entityText = (item: FeedItem) => {
    if (!item.entityType || item.entityType === 'about') return null;
    const label = item.entityLabel || 'Untitled';
    const link = linkFor(item);
    const hit = item.entityId ? found[`${item.entityType}:${item.entityId}`] : undefined;
    const suffix = hit?.state === 'archived' ? ' (archived)' : !hit && item.entityId ? ' (deleted)' : '';
    return (
      <>
        {link ? (
          <Link to={link.href} className={`font-semibold text-[#4338CA] underline-offset-2 hover:underline rounded ${focusRing}`}>
            “{label}”
          </Link>
        ) : (
          <span className="font-semibold">“{label}”</span>
        )}
        {suffix && <span className="text-[#5B6477]">{suffix}</span>}
      </>
    );
  };

  return (
    <div className="flex flex-col gap-3 font-figtree text-[#1E293B] animate-in fade-in duration-300">
      {/* Header: title on the left, the two tabs on the right */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div className="flex flex-col gap-1.5 min-w-0">
        <h1 className="m-0 font-bricolage font-extrabold text-[36px] md:text-[44px] leading-[1.05] tracking-[-0.025em] text-[#1E1B4B]">
          Activity log
        </h1>
        <p className="m-0 text-base text-[#5B6477]">
          What admins changed and when students signed in. Which materials a student opens is never listed.
        </p>
        </div>
        {!missingTable && (
            <div role="tablist" aria-label="Activity log sections" className="self-start md:self-auto max-w-full overflow-x-auto flex gap-1 p-[5px] rounded-full bg-white shrink-0">
              {(
                [
                  ['admin', 'Admin actions'],
                  ['student', 'Student activity'],
                ] as [LogTab, string][]
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  id={`log-tab-${value}`}
                  aria-selected={tab === value}
                  aria-controls="log-panel"
                  onClick={() => switchTab(value)}
                  className={`h-11 px-[18px] rounded-full text-sm whitespace-nowrap transition-colors ${focusRing} ${
                    tab === value ? 'bg-[#1E1B4B] text-white font-bold' : 'text-[#334155] font-semibold hover:bg-[#EEF0FA]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
      </div>

      {missingTable ? (
        <div className="p-8 rounded-[28px] bg-white text-center">
          <ShieldAlert className="w-10 h-10 text-amber-500 mx-auto mb-3" aria-hidden="true" />
          <p className="font-bold text-base text-[#1E1B4B] mb-1">The activity log is not set up yet</p>
          <p className="text-sm text-[#5B6477] max-w-md mx-auto">
            The <code className="font-mono bg-slate-100 px-1.5 py-0.5 rounded">activity_logs</code> table doesn't exist in the database yet. Run the PHASE 6 migration in{' '}
            <code className="font-mono bg-slate-100 px-1.5 py-0.5 rounded">supabase/migrations.sql</code> to turn it on.
          </p>
        </div>
      ) : (
        <>
          <div role="tabpanel" id="log-panel" aria-labelledby={`log-tab-${tab}`} className="flex flex-col gap-3">
            {/* Filters */}
            <div className="bg-white p-2.5 rounded-[24px] flex flex-col gap-2.5">
              <div className="flex flex-col md:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-[#6B7285] pointer-events-none" aria-hidden="true" />
                  <label htmlFor="log-search" className="sr-only">
                    Search the activity log
                  </label>
                  <input
                    id="log-search"
                    type="search"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder={tab === 'admin' ? 'Search by name, email or record' : 'Search by student name or email'}
                    className={`${fieldClass} pl-11 placeholder:text-[#8A91A6] placeholder:font-medium`}
                  />
                </div>
                <div className="md:w-60">
                  <label htmlFor="log-action" className="sr-only">
                    Action
                  </label>
                  <select id="log-action" value={action} onChange={(e) => setFilter({ action: e.target.value })} className={fieldClass}>
                    {actionOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                {tab === 'admin' && (
                  <div className="md:w-44">
                    <label htmlFor="log-type" className="sr-only">
                      Type
                    </label>
                    <select id="log-type" value={type} onChange={(e) => setFilter({ type: e.target.value })} className={fieldClass}>
                      {ADMIN_TYPES.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="md:w-44">
                  <label htmlFor="log-range" className="sr-only">
                    Date range
                  </label>
                  <select id="log-range" value={range} onChange={(e) => setFilter({ range: e.target.value })} className={fieldClass}>
                    {RANGES.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="m-0 md:self-center md:shrink-0 md:px-1 text-[13px] font-semibold text-[#5B6477] md:min-w-[8.5rem] md:text-right" role="status" aria-live="polite">
                  {loading ? 'Loading…' : total === 0 ? 'No entries' : `Showing ${items.length} of ${total}`}
                </p>
              </div>

              {range === 'custom' && (
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <label htmlFor="log-from" className="block text-[13px] font-semibold text-[#5B6477] mb-1">
                      From
                    </label>
                    <input id="log-from" type="date" value={from} max={to || undefined} onChange={(e) => setFilter({ from: e.target.value })} className={`${fieldClass} w-44`} />
                  </div>
                  <div>
                    <label htmlFor="log-to" className="block text-[13px] font-semibold text-[#5B6477] mb-1">
                      To
                    </label>
                    <input id="log-to" type="date" value={to} min={from || undefined} onChange={(e) => setFilter({ to: e.target.value })} className={`${fieldClass} w-44`} />
                  </div>
                </div>
              )}
            </div>

            {/* Feed */}
            {loading && items.length === 0 ? (
              <div className="h-40 flex flex-col items-center justify-center gap-2 bg-white rounded-[28px]">
                <Loader2 className="animate-spin text-indigo-600" aria-hidden="true" />
                <span className="text-sm text-[#5B6477]">Loading activity…</span>
              </div>
            ) : items.length === 0 ? (
              <div className="p-10 rounded-[28px] bg-white text-center">
                <History className="w-8 h-8 text-slate-300 mx-auto mb-2" aria-hidden="true" />
                <p className="m-0 text-base font-semibold text-[#1E1B4B]">{filtersActive ? 'No entries match your filters' : 'No activity recorded yet'}</p>
                {filtersActive && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchInput('');
                      setParams(tab === 'admin' ? {} : { tab }, { replace: true });
                      setLoaded(PAGE_SIZE);
                    }}
                    className={`mt-3 min-h-[44px] px-4 rounded-xl border-[1.5px] border-[#DDE1EE] bg-white font-bold text-sm text-[#1E1B4B] hover:border-[#A5B4FC] ${focusRing}`}
                  >
                    Clear filters
                  </button>
                )}
              </div>
            ) : (
              <div className={`bg-white rounded-[28px] overflow-hidden ${loading ? 'opacity-60' : ''}`}>
                {groups.map((group) => (
                  <section key={group.label} aria-label={group.label}>
                    <h2 className="m-0 px-4 md:px-5 pt-2 pb-0.5 leading-5 text-[13px] font-bold text-[#5B6477] sticky top-0 bg-white/95 backdrop-blur-sm z-[1]">{group.label}</h2>
                    <ul className="m-0 p-0 list-none">
                      {group.rows.map((item) => {
                        const { className, Icon } = KIND_STYLE[item.kind];
                        const entity = entityText(item);
                        const noun = item.entityType && item.entityType !== 'about' ? NOUN[item.entityType] : '';
                        return (
                          <li key={item.key} className="flex items-start gap-3 px-4 md:px-5 py-1 border-t border-[#F1F2F8] first:border-t-0">
                            <span className={`w-6 h-6 mt-0 rounded-md flex items-center justify-center shrink-0 ${className}`} aria-hidden="true">
                              <Icon className="w-3.5 h-3.5" />
                            </span>
                            <div className="min-w-0 flex-1 text-sm leading-6 text-[#1E1B4B] [overflow-wrap:anywhere] sm:truncate">
                              <span className="font-bold">{item.actorName}</span> {VERB[item.kind]}
                              {noun && <> {noun}</>}
                              {entity && <> {entity}</>}
                              {item.detail && <span className="text-[#5B6477]"> · {item.detail}</span>}
                              {item.actorEmail && item.actorEmail !== item.actorName && (
                                <span className="text-[13px] text-[#5B6477]"> · {item.actorEmail.toLowerCase()}</span>
                              )}
                            </div>
                            <time dateTime={item.at} title={fullLabel(item.at)} className="shrink-0 text-[13px] leading-6 text-[#5B6477] tabular-nums">
                              {timeLabel(item.at)}
                            </time>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}
              </div>
            )}

            {hasMore && !loading && (
              <button
                type="button"
                onClick={() => setLoaded((n) => n + PAGE_SIZE)}
                className={`self-center min-h-[44px] px-6 rounded-2xl border-[1.5px] border-[#DDE1EE] bg-white font-bold text-sm text-[#1E1B4B] hover:border-[#A5B4FC] ${focusRing}`}
              >
                Load more
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
