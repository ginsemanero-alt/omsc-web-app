import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Search, Trash2, Loader2, Save, X, Shield, Users, MapPin, Download, AlertCircle, Trash, UserPlus, Eye, EyeOff, RefreshCw } from 'lucide-react';
import { useToast } from '../../hooks/use-toast';

export default function UserManagement() {
  const { toast } = useToast();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  
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
      setUsers(data || []);
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
      const updateData: any = { 
        status: editStatus,
        campus_id: editCampus // Laging kasama ang campus_id sa update
      };

      const { error } = await supabase
        .from('users')
        .update(updateData)
        .eq('id', pendingAction.id);

      if (error) throw error;
      
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
      const { error } = await supabase.from('users').delete().eq('id', pendingAction.id);
      if (error) throw error;
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

  const filteredUsers = users.filter((user) => {
    const query = searchQuery.toLowerCase();
    const matchesSearch = user.name?.toLowerCase().includes(query) || user.email?.toLowerCase().includes(query);
    const matchesRole = roleFilter === 'all' || user.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  return (
    <div className="space-y-8 p-2 animate-in fade-in duration-500 relative">
      
      {/* --- CUSTOM MODAL (YES/NO) --- */}
      {modalType && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200">
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

            <div className="flex gap-3">
              <Button variant="ghost" className="flex-1 rounded-xl font-black uppercase text-[10px] h-12" onClick={closeModals}>
                No, Cancel
              </Button>
              <Button 
                className={`flex-1 text-white rounded-xl font-black uppercase text-[10px] h-12 shadow-lg 
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
        <Button
          onClick={() => setShowAddStaff(true)}
          className="h-12 rounded-2xl px-6 bg-slate-900 hover:bg-indigo-600 text-white font-black uppercase text-[10px] tracking-widest"
        >
          <UserPlus className="w-4 h-4 mr-2" />
          Add Staff Account
        </Button>
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
                    placeholder="staff@omsc.edu.ph"
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
                      <SelectItem value="san-jose">San Jose</SelectItem>
                      <SelectItem value="sablayan">Sablayan</SelectItem>
                      <SelectItem value="mamburao">Mamburao</SelectItem>
                      <SelectItem value="labangan">Labangan</SelectItem>
                      <SelectItem value="lubang">Lubang</SelectItem>
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
      <div className="flex flex-col md:flex-row gap-4 bg-white p-4 rounded-[2rem] shadow-sm border border-slate-100">
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <Input 
            placeholder="Search name or email..." 
            value={searchQuery} 
            onChange={(e) => setSearchQuery(e.target.value)} 
            className="pl-12 h-12 bg-slate-50 border-none rounded-2xl font-bold" 
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-full md:w-48 h-12 bg-slate-50 border-none rounded-2xl font-black uppercase text-[10px]">
            <SelectValue placeholder="All Roles" />
          </SelectTrigger>
          <SelectContent className="rounded-2xl border-none shadow-xl">
            <SelectItem value="all">All Roles</SelectItem>
            <SelectItem value="admin">Admins</SelectItem>
            <SelectItem value="student">Students</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* USER LIST */}
      <div className="grid grid-cols-1 gap-4">
        {loading ? (
           <div className="h-40 flex flex-col items-center justify-center gap-2">
             <Loader2 className="animate-spin text-indigo-600" />
             <span className="text-[10px] font-black uppercase text-slate-400">Loading Database...</span>
           </div>
        ) : filteredUsers.map((user) => (
          <Card key={user.id} className="p-6 rounded-[2.5rem] border-none shadow-sm bg-white overflow-hidden">
            <div className="flex flex-col lg:flex-row items-center justify-between gap-6">
              
              <div className="flex items-center gap-4 w-full lg:w-auto">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center
                  ${user.role === 'admin' ? 'bg-rose-50 text-rose-600' : 'bg-indigo-50 text-indigo-600'}`}>
                  {user.role === 'admin' ? <Shield className="w-7 h-7" /> : <Users className="w-7 h-7" />}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-black text-slate-800 uppercase tracking-tight leading-none">{user.name}</h3>
                    <span className={`text-[8px] font-black px-2 py-0.5 rounded-full uppercase 
                      ${user.status === 'active' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-500'}`}>
                      {user.status || 'active'}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <p className="text-[9px] font-black text-indigo-600 uppercase tracking-tighter bg-indigo-50 px-2 rounded-md">{user.role}</p>
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-tighter bg-slate-100 px-2 rounded-md flex items-center gap-1">
                      <MapPin size={10} /> {user.campus_id || 'Unassigned'}
                    </p>
                  </div>
                </div>
              </div>

              {/* ACTION SECTION */}
              <div className="w-full lg:w-auto flex flex-wrap gap-3 justify-end items-center">
                {editingId === user.id ? (
                  <>
                    {/* Status Select */}
                    <div className="flex flex-col gap-1">
                      <label className="text-[8px] font-black uppercase text-slate-400 ml-2">Status</label>
                      <Select defaultValue={user.status || 'active'} onValueChange={setEditStatus}>
                        <SelectTrigger className="w-32 h-10 border-none bg-slate-50 rounded-xl font-black text-[10px]"><SelectValue /></SelectTrigger>
                        <SelectContent className="rounded-xl border-none">
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="inactive">Inactive</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Campus Select - Always visible during edit to allow changes */}
                    <div className="flex flex-col gap-1">
                      <label className="text-[8px] font-black uppercase text-slate-400 ml-2">Campus</label>
                      <Select defaultValue={user.campus_id || ''} onValueChange={setEditCampus}>
                        <SelectTrigger className="w-40 h-10 border-none bg-slate-50 rounded-xl font-black text-[10px]">
                          <SelectValue placeholder="Assign Campus" />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl border-none">
                          <SelectItem value="san-jose">San Jose</SelectItem>
                          <SelectItem value="sablayan">Sablayan</SelectItem>
                          <SelectItem value="mamburao">Mamburao</SelectItem>
                          <SelectItem value="labangan">Labangan</SelectItem>
                          <SelectItem value="lubang">Lubang</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex gap-2 self-end pb-1">
                      <Button 
                        size="sm" 
                        className="h-10 w-10 bg-indigo-600 rounded-xl hover:bg-indigo-700 shadow-lg" 
                        onClick={() => handleSaveAttempt(user.id, user.role)}
                      >
                        <Save className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-10 w-10 rounded-xl border border-slate-100" onClick={() => setEditingId(null)}>
                        <X className="w-4 h-4 text-slate-400" />
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <Button 
                      variant="outline" 
                      onClick={() => { 
                        setEditingId(user.id); 
                        setEditStatus(user.status || 'active'); 
                        setEditCampus(user.campus_id || ''); 
                      }} 
                      className="rounded-2xl font-black uppercase text-[10px] h-10 border-slate-100 px-6 hover:bg-indigo-50 transition-all"
                    >
                      Manage Access
                    </Button>
                    <Button 
                      variant="destructive" 
                      size="sm" 
                      onClick={() => handleDeleteAttempt(user.id, user.role)} 
                      className="rounded-2xl h-10 bg-rose-50 text-rose-500 hover:bg-rose-600 hover:text-white border-none w-10 p-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}