import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Card } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Search, Loader2, History, PlusCircle, Pencil, Trash2, ShieldAlert } from 'lucide-react';
import type { ActivityAction, ActivityEntityType } from '../../lib/activityLog';

interface LogRow {
  id: number;
  actor_email: string;
  actor_name: string | null;
  action: ActivityAction;
  entity_type: ActivityEntityType;
  entity_id: string | null;
  entity_label: string | null;
  details: string | null;
  created_at: string;
}

const ACTION_STYLE: Record<ActivityAction, { label: string; className: string; Icon: typeof PlusCircle }> = {
  create: { label: 'Created', className: 'bg-emerald-50 text-emerald-600', Icon: PlusCircle },
  update: { label: 'Updated', className: 'bg-indigo-50 text-indigo-600', Icon: Pencil },
  delete: { label: 'Deleted', className: 'bg-rose-50 text-rose-600', Icon: Trash2 },
};

const ENTITY_LABEL: Record<ActivityEntityType, string> = {
  program: 'Program',
  material: 'Material',
  survey: 'Survey',
  user: 'User Account',
};

export default function ActivityLog() {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  // Distinguishes "no rows yet" from "the migration hasn't been applied" —
  // the latter needs a different, actionable message instead of a plain
  // empty state, since it means this feature isn't live in the DB yet.
  const [missingTable, setMissingTable] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [entityFilter, setEntityFilter] = useState('all');

  const fetchLogs = async () => {
    setLoading(true);
    // Latest 200 — this is an audit trail, not a paginated report; older
    // entries stay in the DB and are queryable directly if ever needed.
    const { data, error } = await supabase
      .from('activity_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      // PGRST205 = PostgREST's "table not in schema cache" — what it
      // actually returns for a table that doesn't exist yet (Postgres's
      // own 42P01 never surfaces here since PostgREST fails before
      // reaching the DB). The PHASE 6 migration hasn't been run yet.
      setMissingTable(error.code === 'PGRST205');
      setLogs([]);
    } else {
      setMissingTable(false);
      setLogs(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const filteredLogs = logs.filter((log) => {
    const query = searchQuery.toLowerCase();
    const matchesSearch =
      !query ||
      log.actor_name?.toLowerCase().includes(query) ||
      log.actor_email.toLowerCase().includes(query) ||
      log.entity_label?.toLowerCase().includes(query);
    const matchesAction = actionFilter === 'all' || log.action === actionFilter;
    const matchesEntity = entityFilter === 'all' || log.entity_type === entityFilter;
    return matchesSearch && matchesAction && matchesEntity;
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight uppercase mb-1">
          Activity <span className="text-indigo-600">Log</span>
        </h1>
        <p className="text-slate-400 font-bold uppercase text-[9px] tracking-widest">
          Admin actions across Programs, Materials, Surveys, and Users
        </p>
      </div>

      {missingTable ? (
        <Card className="p-8 rounded-[2rem] border-none shadow-sm bg-white text-center">
          <ShieldAlert className="w-10 h-10 text-amber-500 mx-auto mb-3" />
          <p className="font-black uppercase text-sm text-slate-700 mb-1">Activity Log Not Set Up Yet</p>
          <p className="text-slate-400 font-medium text-xs max-w-md mx-auto">
            The <code className="font-mono bg-slate-100 px-1.5 py-0.5 rounded">activity_logs</code> table doesn't exist in the database yet.
            Run the PHASE 6 migration in <code className="font-mono bg-slate-100 px-1.5 py-0.5 rounded">supabase/migrations.sql</code> to enable it.
          </p>
        </Card>
      ) : (
        <>
          {/* SEARCH & FILTER */}
          <div className="flex flex-col md:flex-row gap-4 bg-white p-4 rounded-[2rem] shadow-sm border border-slate-100">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <Input
                placeholder="Search admin or record name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-12 h-12 bg-slate-50 border-none rounded-2xl font-bold"
              />
            </div>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="w-full md:w-44 h-12 bg-slate-50 border-none rounded-2xl font-black uppercase text-[10px]">
                <SelectValue placeholder="All Actions" />
              </SelectTrigger>
              <SelectContent className="rounded-2xl border-none shadow-xl">
                <SelectItem value="all">All Actions</SelectItem>
                <SelectItem value="create">Created</SelectItem>
                <SelectItem value="update">Updated</SelectItem>
                <SelectItem value="delete">Deleted</SelectItem>
              </SelectContent>
            </Select>
            <Select value={entityFilter} onValueChange={setEntityFilter}>
              <SelectTrigger className="w-full md:w-44 h-12 bg-slate-50 border-none rounded-2xl font-black uppercase text-[10px]">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent className="rounded-2xl border-none shadow-xl">
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="program">Programs</SelectItem>
                <SelectItem value="material">Materials</SelectItem>
                <SelectItem value="survey">Surveys</SelectItem>
                <SelectItem value="user">Users</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* LOG LIST */}
          <div className="space-y-3">
            {loading ? (
              <div className="h-40 flex flex-col items-center justify-center gap-2">
                <Loader2 className="animate-spin text-indigo-600" />
                <span className="text-[10px] font-black uppercase text-slate-400">Loading Activity...</span>
              </div>
            ) : filteredLogs.length === 0 ? (
              <Card className="p-10 rounded-[2rem] border-none shadow-sm bg-white text-center">
                <History className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-slate-400 font-black uppercase text-xs">
                  {logs.length === 0 ? 'No activity recorded yet' : 'No entries match your filters'}
                </p>
              </Card>
            ) : (
              filteredLogs.map((log) => {
                const style = ACTION_STYLE[log.action];
                const Icon = style.Icon;
                return (
                  <Card key={log.id} className="p-5 rounded-[1.75rem] border-none shadow-sm bg-white">
                    <div className="flex items-start gap-4">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${style.className}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="font-black text-slate-800 text-sm">{log.actor_name || log.actor_email}</span>
                          <span className="text-slate-400 font-medium text-sm">
                            {style.label.toLowerCase()} {ENTITY_LABEL[log.entity_type].toLowerCase()}
                          </span>
                          {log.entity_label && (
                            <span className="font-bold text-slate-700 text-sm truncate">"{log.entity_label}"</span>
                          )}
                        </div>
                        {log.details && (
                          <p className="text-slate-400 font-medium text-xs mt-1">{log.details}</p>
                        )}
                        <p className="text-slate-300 font-bold uppercase text-[9px] tracking-wider mt-1.5">
                          {new Date(log.created_at).toLocaleString('en-US', {
                            month: 'short', day: 'numeric', year: 'numeric',
                            hour: 'numeric', minute: '2-digit',
                          })}
                          {' · '}{log.actor_email}
                        </p>
                      </div>
                    </div>
                  </Card>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}
