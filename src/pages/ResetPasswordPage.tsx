import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  KeyRound,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { useToast } from '../hooks/use-toast';
import { supabase } from '../lib/supabase';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const { toast } = useToast();

  // The recovery link Supabase emails puts a token in the URL, which
  // detectSessionInUrl (already on in lib/supabase.ts) exchanges for a
  // temporary session automatically. We just need to know once that's
  // actually happened before letting the user submit a new password.
  const [checkingLink, setCheckingLink] = useState(true);
  const [validLink, setValidLink] = useState(false);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'PASSWORD_RECOVERY' && session) {
          if (isMounted) {
            setValidLink(true);
            setCheckingLink(false);
          }
        }
      }
    );

    // If the link was already processed before this listener attached
    // (e.g. fast redirect), fall back to checking for an existing session.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!isMounted) return;
      if (session) {
        setValidLink(true);
      }
      setCheckingLink(false);
    });

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const passwordChecks = {
    length: password.length >= 8,
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    number: /\d/.test(password),
  };

  const isPasswordStrong =
    passwordChecks.length &&
    passwordChecks.upper &&
    passwordChecks.lower &&
    passwordChecks.number;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isPasswordStrong) {
      toast({
        variant: 'destructive',
        title: 'WEAK PASSWORD',
        description:
          'Password must be at least 8 characters and contain uppercase, lowercase, and a number.',
      });
      return;
    }

    if (password !== confirmPassword) {
      toast({
        variant: 'destructive',
        title: 'PASSWORD MISMATCH',
        description: 'Passwords do not match.',
      });
      return;
    }

    setSubmitting(true);

    try {
      const { error } = await supabase.auth.updateUser({ password });

      if (error) throw error;

      setDone(true);

      // Sign out the temporary recovery session so they land on a clean
      // login screen and use their new password like normal.
      await supabase.auth.signOut();

      setTimeout(() => {
        navigate('/login');
      }, 2500);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'RESET FAILED',
        description:
          error?.message || 'Unable to reset your password. Please try again.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-slate-50 flex items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
      <Card className="w-full max-w-md bg-white border-none shadow-2xl rounded-[2rem] sm:rounded-[3rem] overflow-hidden">
        <div className="p-6 sm:p-8 md:p-10">
          <div className="flex flex-col items-center text-center mb-8">
            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-indigo-600 rounded-[1.5rem] sm:rounded-[2rem] flex items-center justify-center shadow-xl shadow-indigo-100">
              <KeyRound className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
            </div>

            <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-slate-900 mt-5">
              Reset Password
            </h1>

            <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-[0.15em] mt-2">
              OMSC Guidance System
            </p>
          </div>

          {checkingLink ? (
            <div className="flex flex-col items-center py-8 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
              <p className="text-xs font-black uppercase tracking-widest text-slate-400">
                Verifying Link...
              </p>
            </div>
          ) : done ? (
            <div className="text-center py-4">
              <div className="mx-auto w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mb-4">
                <CheckCircle2 className="w-7 h-7 text-emerald-600" />
              </div>
              <h3 className="text-lg font-black text-slate-900">
                Password Updated
              </h3>
              <p className="mt-2 text-sm text-slate-500 leading-relaxed">
                Redirecting you to the login page...
              </p>
            </div>
          ) : !validLink ? (
            <div className="text-center py-4">
              <div className="mx-auto w-14 h-14 rounded-2xl bg-rose-50 flex items-center justify-center mb-4">
                <AlertCircle className="w-7 h-7 text-rose-500" />
              </div>
              <h3 className="text-lg font-black text-slate-900">
                Invalid or Expired Link
              </h3>
              <p className="mt-2 text-sm text-slate-500 leading-relaxed">
                This password reset link is no longer valid. Request a new
                one from the login page.
              </p>
              <Button
                type="button"
                onClick={() => navigate('/login')}
                className="w-full h-12 mt-6 bg-slate-900 hover:bg-indigo-600 text-white rounded-2xl font-black uppercase text-xs tracking-wider"
              >
                Back to Sign In
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 ml-1 text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-slate-500">
                  <Lock className="w-4 h-4 text-indigo-500" />
                  New Password
                </Label>
                <div className="relative">
                  <Input
                    className="input-style pl-4 pr-12"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Create new password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-600"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 ml-1 text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-slate-500">
                  <Lock className="w-4 h-4 text-indigo-500" />
                  Confirm New Password
                </Label>
                <div className="relative">
                  <Input
                    className="input-style pl-4 pr-12"
                    type={showConfirmPassword ? 'text' : 'password'}
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-600"
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {password.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-4 bg-slate-50 rounded-2xl">
                  <PasswordCheck valid={passwordChecks.length} text="At least 8 characters" />
                  <PasswordCheck valid={passwordChecks.upper} text="One uppercase letter" />
                  <PasswordCheck valid={passwordChecks.lower} text="One lowercase letter" />
                  <PasswordCheck valid={passwordChecks.number} text="One number" />
                </div>
              )}

              <Button
                type="submit"
                disabled={submitting}
                className="w-full h-14 bg-slate-900 hover:bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-slate-200"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Updating...
                  </>
                ) : (
                  'Update Password'
                )}
              </Button>
            </form>
          )}
        </div>
      </Card>
    </div>
  );
}

function PasswordCheck({ valid, text }: { valid: boolean; text: string }) {
  return (
    <div
      className={`flex items-center gap-2 text-[9px] font-bold ${
        valid ? 'text-emerald-600' : 'text-slate-400'
      }`}
    >
      {valid ? (
        <CheckCircle2 className="w-3.5 h-3.5" />
      ) : (
        <AlertCircle className="w-3.5 h-3.5" />
      )}
      {text}
    </div>
  );
}
