import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { logActivity } from '../../lib/activityLog';
import { useAuth } from '../../hooks/useAuth';
import { usePagination } from '../../hooks/usePagination';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { PaginationControls } from '../../components/ui/pagination-controls';
import { Search, Trash2, Loader2, Save, X, Shield, Users, MapPin, Download, AlertCircle, Trash, UserPlus, Eye, EyeOff, RefreshCw, Pencil } from 'lucide-react';
import { useToast } from '../../hooks/use-toast';

const USERS_PAGE_SIZE = 15;

export default function UserManagement() {
  const { toast } = useToast();
  const { user: authUser, userName: authUserName } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  // A click-through from Analytics (PWD/IP tiles, Campus Distribution,
  // Students by Course) lands here with the matching filter pre-applied
  // via the URL — e.g. /admin/users?campus=San+Jose+Campus. Read once on
  // mount as the initial filter value; the URL isn't kept in sync with
  // further changes here, so it stays a one-time deep-link, not a
  // two-way-bound filter state.
  const [searchParams] = useSearchParams();
  const [inclusionFilter, setInclusionFilter] = useState(() => searchParams.get('inclusion') || 'all');
  const [campusFilter, setCampusFilter] = useState(() => searchParams.get('campus') || 'all');
  const [programFilter, setProgramFilter] = useState(() => searchParams.get('program') || 'all');
  
  // Edit States
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState('');
  const [editCampus, setEditCampus] = useState('');

  // Modal States
  const [modalType, setModalType] = useState<'update' | 'delete' | null>(null);
  const [pendingAction, setPendingAction] = useState<{id: string, role: string} | null>(null);

  // Add Staff Account States
  const [showAddStaff, setShowAddStaff] = useState(false);
  const [staffName, setStaffName] = useState('');
  const [staffEmail, setStaffEmail] = useState('');
  const [staffPassword, setStaffPassword] = useState('');
  const [staffCampus, setStaffCampus] = useState('');
  const [showStaffPassword, setShowStaffPassword] = useState(false);
  const [creatingStaff, setCreatingStaff] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;

      // PWD/IP status, program, year level, age, and gender all live in
      // `profiles` (student-only demographics), not `users` — bridge the
      // two via student_id. This is the one place in the app that shows
      // PWD/IP tied to a specific student: it's an account-management
      // view where the admin already sees the student's name, unlike
      // Analytics, which the registration privacy notice promises will
      // only ever show PWD/IP in aggregate. Program/campus filters were
      // previously built as a click-through in Analytics and moved here
      // for the same reason — this is the account-directory view, not
      // the aggregate-reporting one.
      const studentIds = (data || [])
        .map((u) => u.student_id)
        .filter(Boolean);

      type ProfileBridge = { is_pwd: boolean; is_ip: boolean; program: string | null; year_level: string | number | null; age: number | null; gender: string | null };
      let profilesByStudentId: Record<string, ProfileBridge> = {};

      if (studentIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('student_id, is_pwd, is_ip, program, year_level, age, gender')
          .in('student_id', studentIds);

        if (profilesError) {
          console.warn('Unable to load student demographics:', profilesError);
        } else {
          profilesByStudentId = (profiles || []).reduce((acc, p) => {
            if (p.student_id) {
              acc[p.student_id] = {
                is_pwd: !!p.is_pwd,
                is_ip: !!p.is_ip,
                program: p.program ?? null,
                year_level: p.year_level ?? null,
                age: p.age ?? null,
                gender: p.gender ?? null,
              };
            }
            return acc;
          }, {} as Record<string, ProfileBridge>);
        }
      }

      const merged = (data || []).map((user) => ({
        ...user,
        is_pwd: profilesByStudentId[user.student_id]?.is_pwd ?? false,
        is_ip: profilesByStudentId[user.student_id]?.is_ip ?? false,
        program: profilesByStudentId[user.student_id]?.program ?? null,
        year_level: profilesByStudentId[user.student_id]?.year_level ?? null,
        age: profilesByStudentId[user.student_id]?.age ?? null,
        gender: profilesByStudentId[user.student_id]?.gender ?? null,
      }));

      setUsers(merged);
    } catch (err: any) {
      toast({ variant: "destructive", title: "DATABASE ERROR", description: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  // --- ACTIONS ---
  const handleSaveAttempt = (id: string, role: string) => {
    setPendingAction({ id, role });
    setModalType('update');
  };

  const handleDeleteAttempt = (id: string, role: string) => {
    setPendingAction({ id, role });
    setModalType('delete');
  };

  const executeUserUpdate = async () => {
    if (!pendingAction) return;
    try {
      // `campus` is the field the rest of the app actually reads (registration,
      // TopNavBar, Analytics) — a now-removed `campus_id` field was being
      // written here instead, so editing a user's campus silently had no
      // visible effect anywhere.
      const { error } = await supabase
        .from('users')
        .update({ status: editStatus, campus: editCampus })
        .eq('id', pendingAction.id);

      if (error) throw error;

      // Analytics reads student demographics from `profiles.campus`, not
      // `users.campus`, so a student's campus edit needs to reach both rows
      // to actually show up there. Admins have no profiles row.
      const targetUser = users.find((u) => String(u.id) === String(pendingAction.id));
      if (targetUser?.student_id) {
        const { error: profileError } = await supabase
          .from('profiles')
          .update({ campus: editCampus })
          .eq('student_id', targetUser.student_id);

        if (profileError) {
          console.warn('Profile campus sync failed:', profileError);
        }
      }
      logActivity({ actorEmail: authUser?.email, actorName: authUserName, action: 'update', entityType: 'user', entityId: pendingAction.id, entityLabel: targetUser?.name || targetUser?.email, details: `status: ${editStatus}, campus: ${editCampus}` });

      toast({
        title: "SUCCESS",
        description: "User records updated.",
        className: "bg-indigo-600 text-white font-black rounded-2xl"
      });
      closeModals();
      fetchUsers();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    }
  };

  const executeDelete = async () => {
    if (!pendingAction) return;
    try {
      const targetUser = users.find((u) => String(u.id) === String(pendingAction.id));

      // Deleting straight from `users` via this browser client used to
      // leave the account's `profiles` row and Auth identity behind (the
      // browser has no service-role key to touch either) — a "deleted"
      // student kept showing up in demographics charts and could still
      // log in. /api/admin/delete-user cleans up all three.
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("No active session — please log in again.");

      const response = await fetch('/api/admin/delete-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ userId: pendingAction.id }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.message || 'Failed to delete user.');

      toast({
        title: "DELETED",
        description: "User removed successfully.",
        className: "bg-slate-900 text-white font-black rounded-2xl"
      });
      closeModals();
      fetchUsers();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    }
  };

  const closeModals = () => {
    setModalType(null);
    setPendingAction(null);
    setEditingId(null);
  };

  const generateStaffPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
    let generated = '';
    for (let i = 0; i < 12; i++) {
      generated += chars[Math.floor(Math.random() * chars.length)];
    }
    setStaffPassword(generated);
    setShowStaffPassword(true);
  };

  const resetStaffForm = () => {
    setStaffName('');
    setStaffEmail('');
    setStaffPassword('');
    setStaffCampus('');
    setShowStaffPassword(false);
  };

  const handleCreateStaff = async () => {
    if (!staffName.trim() || !staffEmail.trim() || staffPassword.length < 8) {
      toast({
        variant: "destructive",
        title: "INCOMPLETE FORM",
        description: "Name, email, and a password of at least 8 characters are required."
      });
      return;
    }

    setCreatingStaff(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();

      const response = await fetch('/api/admin/create-staff', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token || ''}`,
        },
        body: JSON.stringify({
          name: staffName.trim(),
          email: staffEmail.trim(),
          password: staffPassword,
          campus: staffCampus || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to create staff account");
      }
      logActivity({ actorEmail: authUser?.email, actorName: authUserName, action: 'create', entityType: 'user', entityId: data.userId, entityLabel: staffName.trim(), details: `admin account (${staffEmail.trim()})` });

      toast({
        title: "STAFF ACCOUNT CREATED",
        description: `${staffName.trim()} can now sign in as an admin.`,
        className: "bg-indigo-600 text-white font-black rounded-2xl"
      });

      setShowAddStaff(false);
      resetStaffForm();
      fetchUsers();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    } finally {
      setCreatingStaff(false);
    }
  };

  // Dynamic, derived from whatever campuses/programs actually appear in
  // the data — matches the pattern Analytics uses for its own filters,
  // instead of a hardcoded list that could drift out of sync.
  const campusOptions = useMemo(() => {
    return Array.from(new Set(users.map((u) => u.campus).filter(Boolean))).sort();
  }, [users]);

  // Scoped to the selected campus — San Jose's course list has no reason
  // to show a Labangan-only program. "All Campuses" falls back to every
  // course across all three.
  const programOptions = useMemo(() => {
    const scoped = campusFilter === 'all' ? users : users.filter((u) => u.campus === campusFilter);
    return Array.from(new Set(scoped.map((u) => u.program).filter(Boolean))).sort();
  }, [users, campusFilter]);

  // Changing campus resets the course filter — a previously-selected
  // course almost certainly doesn't belong to the newly-picked campus,
  // and silently keeping an invisible/mismatched filter active would be
  // more confusing than just clearing it.
  const handleCampusFilterChange = (value: string) => {
    setCampusFilter(value);
    setProgramFilter('all');
  };

  const filteredUsers = users.filter((user) => {
    const query = searchQuery.toLowerCase();
    const matchesSearch = user.name?.toLowerCase().includes(query) || user.email?.toLowerCase().includes(query);
    const matchesRole = roleFilter === 'all' || user.role === roleFilter;
    const matchesInclusion =
      inclusionFilter === 'all' ||
      (inclusionFilter === 'pwd' && user.is_pwd) ||
      (inclusionFilter === 'ip' && user.is_ip);
    const matchesCampus = campusFilter === 'all' || user.campus === campusFilter;
    const matchesProgram = programFilter === 'all' || user.program === programFilter;
    return matchesSearch && matchesRole && matchesInclusion && matchesCampus && matchesProgram;
  });

  const {
    page: usersPage,
    setPage: setUsersPage,
    totalPages: usersTotalPages,
    pageItems: pagedUsers,
  } = usePagination(filteredUsers, USERS_PAGE_SIZE);

  // Any change to search/filters should land back on page 1 — otherwise
  // a narrower result set can leave the admin stranded on a page number
  // that no longer makes sense for what's now showing.
  useEffect(() => {
    setUsersPage(1);
  }, [searchQuery, roleFilter, inclusionFilter, campusFilter, programFilter]);

  // Exports whatever the admin is currently looking at (respects the
  // search box and Role/PWD-IP filters above), not always the full table —
  // matches how Reports Center's exports work. `password` is deliberately
  // never included, even hashed.
  const handleExportUsers = () => {
    if (filteredUsers.length === 0) {
      toast({ variant: "destructive", title: "Nothing to Export", description: "No users match the current search and filters." });
      return;
    }

    const rows = filteredUsers.map((user) => ({
      Name: user.name || '',
      Email: user.email || '',
      Role: user.role || '',
      'Student ID': user.student_id || '',
      Campus: user.campus || '',
      Program: user.program || '',
      'Year Level': user.year_level || '',
      Status: user.status || '',
      Age: user.age ?? '',
      Gender: user.gender || '',
      PWD: user.is_pwd ? 'Yes' : 'No',
      'Indigenous Person': user.is_ip ? 'Yes' : 'No',
      'Date Registered': user.created_at ? new Date(user.created_at).toLocaleDateString() : '',
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet['!cols'] = Object.keys(rows[0]).map(() => ({ wch: 18 }));

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Users');

    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([buffer], { type: 'application/octet-stream' });
    saveAs(blob, `OMSU_Users_${new Date().toISOString().slice(0, 10)}.xlsx`);

    toast({
      title: "Export Ready",
      description: `${filteredUsers.length} user(s) exported to Excel.`,
      className: "bg-indigo-600 text-white font-black rounded-2xl"
    });
  };

  return (
    <div className="space-y-8 p-2 animate-in fade-in duration-500 relative">
      
      {/* --- CUSTOM MODAL (YES/NO) --- */}
      {/* z-[110]: can be triggered from inside the Manage Access modal
          (z-[100]) and must stack above it, regardless of render order. */}
      {modalType && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200">
          <Card className="w-full max-w-sm p-8 rounded-[2.5rem] border-none shadow-2xl bg-white text-center">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 
              ${modalType === 'delete' ? 'bg-rose-50 text-rose-500' : 'bg-indigo-50 text-indigo-600'}`}>
              {modalType === 'delete' ? <Trash size={32} /> : <AlertCircle size={32} />}
            </div>
            
            <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight mb-2">
              {modalType === 'delete' ? 'Confirm Delete?' : 'Confirm Update?'}
            </h2>
            
            <p className="text-slate-500 text-sm font-medium mb-8 leading-relaxed">
              {modalType === 'delete' 
                ? "Sigurado ka bang gusto mong burahin ang user na ito?" 
                : "I-apply na ba ang mga pagbabagong ginawa mo?"}
            </p>

            <div className="flex flex-wrap gap-3">
              <Button variant="ghost" className="flex-1 min-w-[90px] rounded-xl font-black uppercase text-[10px] h-12" onClick={closeModals}>
                No, Cancel
              </Button>
              <Button
                className={`flex-1 min-w-[90px] text-white rounded-xl font-black uppercase text-[10px] h-12 shadow-lg
                  ${modalType === 'delete' ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-100' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-100'}`}
                onClick={() => modalType === 'delete' ? executeDelete() : executeUserUpdate()}
              >
                Yes, {modalType === 'delete' ? 'Delete' : 'Save Changes'}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight uppercase mb-2">
            User <span className="text-indigo-600">Management</span>
          </h1>
          <p className="text-slate-500 font-medium tracking-tight uppercase text-xs">Assign roles and campuses to staff</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button
            onClick={handleExportUsers}
            variant="outline"
            className="h-12 rounded-2xl px-6 border-slate-200 text-slate-700 hover:bg-slate-50 font-black uppercase text-[10px] tracking-widest"
          >
            <Download className="w-4 h-4 mr-2" />
            Export Users
          </Button>
          <Button
            onClick={() => setShowAddStaff(true)}
            className="h-12 rounded-2xl px-6 bg-slate-900 hover:bg-indigo-600 text-white font-black uppercase text-[10px] tracking-widest"
          >
            <UserPlus className="w-4 h-4 mr-2" />
            Add Staff Account
          </Button>
        </div>
      </div>

      {/* ADD STAFF MODAL */}
      {showAddStaff && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200">
          <Card className="w-full max-w-md rounded-[2.5rem] border-none shadow-2xl bg-white overflow-hidden">
            <div className="p-6 sm:p-8">
              <div className="flex items-start justify-between gap-4 mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-indigo-50 flex items-center justify-center shrink-0">
                    <UserPlus className="w-6 h-6 text-indigo-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black uppercase tracking-tight text-slate-900">Add Staff Account</h2>
                    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mt-1">Admin access only</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { setShowAddStaff(false); resetStaffForm(); }}
                  className="w-9 h-9 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-colors shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-[9px] font-black uppercase tracking-wider text-slate-500 ml-1">Full Name</Label>
                  <Input
                    value={staffName}
                    onChange={(e) => setStaffName(e.target.value)}
                    placeholder="Juan Dela Cruz"
                    className="h-12 bg-slate-50 border-none rounded-2xl font-bold"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[9px] font-black uppercase tracking-wider text-slate-500 ml-1">Email</Label>
                  <Input
                    type="email"
                    value={staffEmail}
                    onChange={(e) => setStaffEmail(e.target.value)}
                    placeholder="staff@omsu.edu.ph"
                    autoComplete="off"
                    className="h-12 bg-slate-50 border-none rounded-2xl font-bold"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[9px] font-black uppercase tracking-wider text-slate-500 ml-1">Campus</Label>
                  <Select value={staffCampus} onValueChange={setStaffCampus}>
                    <SelectTrigger className="h-12 bg-slate-50 border-none rounded-2xl font-bold">
                      <SelectValue placeholder="Assign Campus" />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl border-none">
                      <SelectItem value="San Jose Campus">San Jose Campus</SelectItem>
                      <SelectItem value="Labangan Campus">Labangan Campus</SelectItem>
                      <SelectItem value="Murtha Campus">Murtha Campus</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[9px] font-black uppercase tracking-wider text-slate-500 ml-1">Password</Label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        type={showStaffPassword ? 'text' : 'password'}
                        value={staffPassword}
                        onChange={(e) => setStaffPassword(e.target.value)}
                        placeholder="At least 8 characters"
                        autoComplete="new-password"
                        className="h-12 bg-slate-50 border-none rounded-2xl font-bold pr-11"
                      />
                      <button
                        type="button"
                        onClick={() => setShowStaffPassword(!showStaffPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-600"
                      >
                        {showStaffPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={generateStaffPassword}
                      className="h-12 w-12 rounded-2xl border-slate-100 shrink-0 p-0"
                      title="Generate password"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </Button>
                  </div>
                  <p className="text-[9px] text-slate-400 font-medium ml-1">
                    Share this password with the staff member securely — it won't be shown again.
                  </p>
                </div>

                <Button
                  onClick={handleCreateStaff}
                  disabled={creatingStaff}
                  className="w-full h-12 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black uppercase text-xs tracking-wider mt-2"
                >
                  {creatingStaff ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Create Admin Account'
                  )}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* SEARCH & FILTER */}
      <div className="flex flex-col gap-4 bg-white p-4 rounded-[2rem] shadow-sm border border-slate-100">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <Input
            placeholder="Search name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-12 h-12 bg-slate-50 border-none rounded-2xl font-bold"
          />
        </div>
        <div className="flex flex-wrap gap-3">
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="flex-1 min-w-[160px] h-12 bg-slate-50 border-none rounded-2xl font-black uppercase text-[10px]">
              <SelectValue placeholder="All Roles" />
            </SelectTrigger>
            <SelectContent className="rounded-2xl border-none shadow-xl">
              <SelectItem value="all">All Roles</SelectItem>
              <SelectItem value="admin">Admins</SelectItem>
              <SelectItem value="student">Students</SelectItem>
            </SelectContent>
          </Select>
          <Select value={inclusionFilter} onValueChange={setInclusionFilter}>
            <SelectTrigger className="flex-1 min-w-[160px] h-12 bg-slate-50 border-none rounded-2xl font-black uppercase text-[10px]">
              <SelectValue placeholder="All Students" />
            </SelectTrigger>
            <SelectContent className="rounded-2xl border-none shadow-xl">
              <SelectItem value="all">PWD / IP: All</SelectItem>
              <SelectItem value="pwd">PWD Only</SelectItem>
              <SelectItem value="ip">IP Only</SelectItem>
            </SelectContent>
          </Select>
          <Select value={campusFilter} onValueChange={handleCampusFilterChange}>
            <SelectTrigger className="flex-1 min-w-[160px] h-12 bg-slate-50 border-none rounded-2xl font-black uppercase text-[10px]">
              <SelectValue placeholder="All Campuses" />
            </SelectTrigger>
            <SelectContent className="rounded-2xl border-none shadow-xl">
              <SelectItem value="all">All Campuses</SelectItem>
              {campusOptions.map((campus) => (
                <SelectItem key={campus} value={campus}>{campus}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={programFilter} onValueChange={setProgramFilter}>
            <SelectTrigger className="flex-1 min-w-[160px] h-12 bg-slate-50 border-none rounded-2xl font-black uppercase text-[10px]">
              <SelectValue placeholder="All Courses" />
            </SelectTrigger>
            <SelectContent className="rounded-2xl border-none shadow-xl max-h-72">
              <SelectItem value="all">All Courses</SelectItem>
              {programOptions.map((program) => (
                <SelectItem key={program} value={program}>{program}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* USER LIST — full tabular detail, one row per account */}
      <Card className="rounded-[2rem] border-none shadow-sm bg-white overflow-hidden">
        {loading ? (
          <div className="h-40 flex flex-col items-center justify-center gap-2">
            <Loader2 className="animate-spin text-indigo-600" />
            <span className="text-[10px] font-black uppercase text-slate-400">Loading Database...</span>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="h-40 flex flex-col items-center justify-center gap-2">
            <Users className="w-8 h-8 text-slate-300" />
            <span className="text-[10px] font-black uppercase text-slate-400">No users match your filters</span>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[1150px]">
                <thead>
                  <tr className="text-[9px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 bg-slate-50/60">
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Student ID</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Campus</th>
                    <th className="px-4 py-3">Course / Program</th>
                    <th className="px-4 py-3">Year</th>
                    <th className="px-4 py-3">Age</th>
                    <th className="px-4 py-3">Gender</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">PWD</th>
                    <th className="px-4 py-3">IP</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedUsers.map((user) => (
                    <tr key={user.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/40 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0
                            ${user.role === 'admin' ? 'bg-rose-50 text-rose-600' : 'bg-indigo-50 text-indigo-600'}`}>
                            {user.role === 'admin' ? <Shield className="w-4 h-4" /> : <Users className="w-4 h-4" />}
                          </div>
                          <span className="font-black text-slate-800 text-xs uppercase whitespace-nowrap">{user.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 font-medium whitespace-nowrap">{user.student_id || '—'}</td>
                      <td className="px-4 py-3 text-xs text-slate-500 font-medium whitespace-nowrap">{user.email}</td>
                      <td className="px-4 py-3">
                        <span className="text-[9px] font-black text-indigo-600 uppercase tracking-tighter bg-indigo-50 px-2 py-0.5 rounded-md">{user.role}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 font-medium whitespace-nowrap flex items-center gap-1">
                        <MapPin size={10} className="shrink-0" /> {user.campus || 'Unassigned'}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 font-medium max-w-[240px] truncate" title={user.program || ''}>
                        {user.program || '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 font-medium">{user.year_level || '—'}</td>
                      <td className="px-4 py-3 text-xs text-slate-500 font-medium">{user.age ?? '—'}</td>
                      <td className="px-4 py-3 text-xs text-slate-500 font-medium whitespace-nowrap">{user.gender || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase whitespace-nowrap
                          ${user.status === 'active' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-500'}`}>
                          {user.status || 'active'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {user.is_pwd ? (
                          <span className="text-[9px] font-black text-blue-600 uppercase bg-blue-50 px-2 py-0.5 rounded-md">Yes</span>
                        ) : (
                          <span className="text-slate-300 text-xs">&mdash;</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {user.is_ip ? (
                          <span className="text-[9px] font-black text-emerald-600 uppercase bg-emerald-50 px-2 py-0.5 rounded-md">Yes</span>
                        ) : (
                          <span className="text-slate-300 text-xs">&mdash;</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 rounded-lg hover:bg-indigo-50"
                            onClick={() => {
                              setEditingId(user.id);
                              setEditStatus(user.status || 'active');
                              setEditCampus(user.campus || '');
                            }}
                            aria-label={`Manage ${user.name}`}
                          >
                            <Pencil className="w-3.5 h-3.5 text-slate-500" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 rounded-lg hover:bg-rose-50"
                            onClick={() => handleDeleteAttempt(user.id, user.role)}
                            aria-label={`Delete ${user.name}`}
                          >
                            <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-4 border-t border-slate-100">
              <PaginationControls
                page={usersPage}
                totalPages={usersTotalPages}
                totalItems={filteredUsers.length}
                pageSize={USERS_PAGE_SIZE}
                onPageChange={setUsersPage}
              />
            </div>
          </>
        )}
      </Card>

      {/* MANAGE ACCESS MODAL — Status + Campus, replacing the old inline
          in-card edit row now that each user is a table row instead of a
          card. */}
      {editingId && (() => {
        const targetUser = users.find((u) => String(u.id) === String(editingId));
        return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200">
            <Card className="w-full max-w-sm rounded-[2.5rem] border-none shadow-2xl bg-white overflow-hidden p-6 sm:p-8">
              <div className="flex items-start justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-lg font-black uppercase tracking-tight text-slate-900">Manage Access</h2>
                  <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mt-1 truncate max-w-[220px]">{targetUser?.name}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingId(null)}
                  className="w-9 h-9 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-colors shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-[9px] font-black uppercase tracking-wider text-slate-500 ml-1">Status</Label>
                  <Select value={editStatus} onValueChange={setEditStatus}>
                    <SelectTrigger className="h-12 bg-slate-50 border-none rounded-2xl font-bold"><SelectValue /></SelectTrigger>
                    <SelectContent className="rounded-2xl border-none">
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[9px] font-black uppercase tracking-wider text-slate-500 ml-1">Campus</Label>
                  <Select value={editCampus} onValueChange={setEditCampus}>
                    <SelectTrigger className="h-12 bg-slate-50 border-none rounded-2xl font-bold">
                      <SelectValue placeholder="Assign Campus" />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl border-none">
                      <SelectItem value="San Jose Campus">San Jose Campus</SelectItem>
                      <SelectItem value="Labangan Campus">Labangan Campus</SelectItem>
                      <SelectItem value="Murtha Campus">Murtha Campus</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <Button variant="ghost" className="h-12 rounded-2xl font-black uppercase text-[10px] bg-slate-50" onClick={() => setEditingId(null)}>
                    Cancel
                  </Button>
                  <Button
                    className="h-12 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase text-[10px]"
                    onClick={() => targetUser && handleSaveAttempt(targetUser.id, targetUser.role)}
                  >
                    <Save className="w-4 h-4 mr-2" /> Save
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        );
      })()}
    </div>
  );
}