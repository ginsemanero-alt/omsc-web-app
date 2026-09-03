import { useState, useEffect } from 'react';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';

import {
  GraduationCap,
  Loader2,
  UserPlus,
  ArrowLeft,
  ShieldCheck,
  X,
  Check,
  Mail,
  Lock,
  Fingerprint,
  MapPin,
  BookOpen,
  UserCircle,
  Eye,
  EyeOff,
  User,
  CalendarDays,
  Users,
  Accessibility,
  UsersRound,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  Send,
} from 'lucide-react';

import { useToast } from '../hooks/use-toast';
import { supabase } from '../lib/supabase';

type UserRole = 'student' | 'admin';

interface LoginPageProps {
  onLogin: (role: UserRole, name: string) => void;
  onBackToHome: () => void;
}

type Gender = 'Male' | 'Female' | 'Other' | 'Prefer not to say';
type YesNoPrefer = 'Yes' | 'No' | 'Prefer not to say';

const CAMPUSES = [
  'San Jose Campus',
  'Labangan Campus',
  'Murtha Campus',
];

// Official program offerings per campus. Majors are flattened into their
// own entry (e.g. "... — Major in X") since `profiles.program` is a single
// text field, not a separate program+major pair.
const PROGRAMS_BY_CAMPUS: Record<string, string[]> = {
  'Labangan Campus': [
    'Master in Public Administration (MPA)',
    'Bachelor of Science in Social Work (BSSW)',
    'Bachelor of Science in Development Communication (BSDevCom)',
    'Bachelor of Arts in History (BAHist)',
    'Bachelor of Arts in Communication (BACom)',
    'Bachelor in Human Services (BSM)',
    'Bachelor of Science in Business Administration (BSBA) — Major in Financial Management',
    'Bachelor of Science in Business Administration (BSBA) — Major in Operations Management',
    'Bachelor of Science in Accounting Information System (BSAIS)',
    'Bachelor of Science in Office Administration (BSOA)',
    'Bachelor of Public Administration (BPA)',
    'Bachelor of Science in Hospitality Management (BSHM)',
    'Bachelor of Science in Management Accounting (BSMA)',
    'Bachelor of Science in Accountancy (BSA)',
    'Bachelor of Science in Architecture (BSArchi)',
    'Bachelor of Science in Civil Engineering (BSCE)',
    'Bachelor of Science in Electrical Engineering (BSEE)',
    'Bachelor of Science in Industrial Engineering (BSIE)',
    'Bachelor of Science in Criminology (BSCrim)',
    'Bachelor of Science in Industrial Security Management (BSISM)',
    'Other',
  ],
  'San Jose Campus': [
    'Doctor of Education in Educational Management (EdD)',
    'Master of Arts in Education major in Educational Management (MAEd)',
    'Master of Arts in Teaching (MAT) — Major in English',
    'Master of Arts in Teaching (MAT) — Major in Filipino',
    'Master in Information Technology (MIT)',
    'Bachelor of Elementary Education (BEEd)',
    'Bachelor of Secondary Education (BSEd) — Major in English',
    'Bachelor of Secondary Education (BSEd) — Major in Filipino',
    'Bachelor of Secondary Education (BSEd) — Major in Mathematics',
    'Bachelor of Secondary Education (BSEd) — Major in Science',
    'Teacher Certificate Program',
    'Bachelor of Technology and Livelihood Education (BTLEd) — Major in Home Economics',
    'Bachelor of Technical-Vocational Teacher Education (BTVTEd) — Major in Automotive Technology',
    'Bachelor of Technical-Vocational Teacher Education (BTVTEd) — Major in Electrical Technology',
    'Bachelor of Technical-Vocational Teacher Education (BTVTEd) — Major in Electronics Technology',
    'Bachelor of Technical-Vocational Teacher Education (BTVTEd) — Major in Food Technology and Service Management',
    'Bachelor of Technical-Vocational Teacher Education (BTVTEd) — Major in Welding and Fabrication Technology',
    'Bachelor of Physical Education (BPEd)',
    'Bachelor of Science in Information Technology (BSIT)',
    'Bachelor of Science in Midwifery (BSM)',
    'Diploma in Midwifery',
    'Other',
  ],
  'Murtha Campus': [
    'Master of Science in Agriculture (MSAgri)',
    'Bachelor of Technical-Vocational Teacher Education (BTVTEd) — Major in Animal Production',
    'Bachelor of Technical-Vocational Teacher Education (BTVTEd) — Major in Horticulture',
    'Bachelor of Technical-Vocational Teacher Education (BTVTEd) — Major in Agricultural Crops Production',
    'Bachelor of Science in Agriculture (BSAgri)',
    'Bachelor of Science in Agroforestry (BSAgro)',
    'Other',
  ],
};


export default function LoginPage({
  onLogin,
  onBackToHome,
}: LoginPageProps) {
  const [isRegister, setIsRegister] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [agreed, setAgreed] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [name, setName] = useState('');
  const [studentId, setStudentId] = useState('');

  const [campus, setCampus] = useState('San Jose Campus');
  const [program, setProgram] = useState('');
  const [yearLevel, setYearLevel] = useState('1');

  const [age, setAge] = useState('');
  const [gender, setGender] = useState<Gender>('Prefer not to say');

  const [isIp, setIsIp] =
    useState<YesNoPrefer>('Prefer not to say');

  const [isPwd, setIsPwd] =
    useState<YesNoPrefer>('Prefer not to say');

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [isLoading, setIsLoading] = useState(false);

  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [sendingReset, setSendingReset] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);

  const { toast } = useToast();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    if (params.get('logout') === 'success') {
      toast({
        title: 'LOGOUT SUCCESSFULLY',
        description:
          'You have been securely signed out of your account.',
        className:
          'bg-indigo-600 text-white font-black border-none rounded-2xl shadow-2xl py-6',
      });

      const newUrl = window.location.pathname;
      window.history.replaceState({}, document.title, newUrl);
    }
  }, [toast]);

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

  const resetRegistrationFields = () => {
    setName('');
    setStudentId('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setCampus('San Jose Campus');
    setProgram('');
    setYearLevel('1');
    setAge('');
    setGender('Prefer not to say');
    setIsIp('Prefer not to say');
    setIsPwd('Prefer not to say');
    setAgreed(false);
    setShowPassword(false);
    setShowConfirmPassword(false);
  };

  const validateRegistration = () => {
    const trimmedName = name.trim();
    const trimmedStudentId = studentId.trim();
    const trimmedEmail = email.trim();
    const numericAge = Number(age);

    if (trimmedName.length < 3) {
      toast({
        variant: 'destructive',
        title: 'INVALID NAME',
        description: 'Please enter your complete name.',
      });
      return false;
    }

    if (!trimmedStudentId) {
      toast({
        variant: 'destructive',
        title: 'STUDENT ID REQUIRED',
        description: 'Please enter your official Student ID number.',
      });
      return false;
    }

    if (!trimmedEmail) {
      toast({
        variant: 'destructive',
        title: 'EMAIL REQUIRED',
        description: 'Please enter your institutional email.',
      });
      return false;
    }

    if (!program) {
      toast({
        variant: 'destructive',
        title: 'PROGRAM REQUIRED',
        description: 'Please select your academic program.',
      });
      return false;
    }

    if (!age || Number.isNaN(numericAge)) {
      toast({
        variant: 'destructive',
        title: 'AGE REQUIRED',
        description: 'Please enter your age.',
      });
      return false;
    }

    if (numericAge < 15 || numericAge > 100) {
      toast({
        variant: 'destructive',
        title: 'INVALID AGE',
        description: 'Please enter a valid age.',
      });
      return false;
    }

    if (!isPasswordStrong) {
      toast({
        variant: 'destructive',
        title: 'WEAK PASSWORD',
        description:
          'Password must be at least 8 characters and contain uppercase, lowercase, and a number.',
      });
      return false;
    }

    if (password !== confirmPassword) {
      toast({
        variant: 'destructive',
        title: 'PASSWORD MISMATCH',
        description: 'Passwords do not match.',
      });
      return false;
    }

    if (!agreed) {
      toast({
        variant: 'destructive',
        title: 'ACTION REQUIRED',
        description:
          'Please read and agree to the Guidance Terms & Privacy Policy.',
      });
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isRegister && !validateRegistration()) {
      return;
    }

    setIsLoading(true);

    const endpoint = isRegister ? '/api/register' : '/api/login';

    const payload = isRegister
      ? {
          name: name.trim(),
          studentId: studentId.trim(),
          email: email.trim(),
          password,
          role: 'student' as UserRole,

          campus,
          program,
          yearLevel,

          age: Number(age),
          gender,

          isIp,
          isPwd,

          status: 'active',
        }
      : {
          email: email.trim(),
          password,
        };

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (response.ok) {
        if (isRegister) {
          toast({
            title: 'ACCOUNT CREATED',
            description:
              'Your student account has been successfully created. You can now sign in.',
            className:
              'bg-emerald-600 text-white font-black rounded-2xl shadow-xl',
          });

          resetRegistrationFields();
          setIsRegister(false);
        } else {
          /*
           * Set Supabase Auth session.
           * Backend should return access_token and refresh_token.
           */
          if (data.access_token && data.refresh_token) {
            const { error: sessionError } =
              await supabase.auth.setSession({
                access_token: data.access_token,
                refresh_token: data.refresh_token,
              });

            if (sessionError) {
              console.warn(
                'Could not set Supabase session:',
                sessionError.message
              );
            } else {
              console.log(
                'Supabase Auth session set successfully.'
              );
            }
          } else {
            console.warn(
              'No tokens returned from server. Supabase session not set.'
            );
          }

          /*
           * localStorage keeps only display values. Auth state and
           * role are never read from localStorage — they come from
           * the verified Supabase session via useAuth.
           */
          localStorage.setItem('userName', data.name);

          localStorage.setItem(
            'userCampus',
            data.campus || 'San Jose Campus'
          );

          toast({
            title: 'WELCOME',
            description: `Access Granted! Hello, ${data.name}.`,
            className:
              'bg-indigo-600 text-white font-black rounded-2xl shadow-2xl',
          });

          onLogin(data.role, data.name);
        }
      } else {
        toast({
          variant: 'destructive',
          title: 'REGISTRATION / LOGIN ERROR',
          description:
            data.message ||
            'Unable to complete your request.',
        });
      }
    } catch (error) {
      console.error(error);

      toast({
        variant: 'destructive',
        title: 'SERVER ERROR',
        description:
          'Backend is unreachable. Please try again later.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleMode = () => {
    setIsRegister(!isRegister);
    setAgreed(false);

    if (!isRegister) {
      setPassword('');
      setConfirmPassword('');
    }
  };

  const handleOpenForgotPassword = () => {
    setResetEmail(email.trim());
    setResetEmailSent(false);
    setShowForgotPassword(true);
  };

  const handleSendResetEmail = async (e: React.FormEvent) => {
    e.preventDefault();

    const cleanResetEmail = resetEmail.trim();

    if (!cleanResetEmail) {
      toast({
        variant: 'destructive',
        title: 'EMAIL REQUIRED',
        description: 'Please enter your institutional email.',
      });
      return;
    }

    setSendingReset(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(
        cleanResetEmail,
        { redirectTo: `${window.location.origin}/reset-password` }
      );

      if (error) throw error;

      setResetEmailSent(true);
    } catch (error: any) {
      // Supabase intentionally doesn't reveal whether an email exists for
      // password-reset requests (prevents account enumeration), so most
      // errors here are transient (rate limiting, network). Show the same
      // "check your inbox" success state regardless, matching that
      // behavior, unless it's clearly a client-side problem.
      console.error('Password reset error:', error);
      setResetEmailSent(true);
    } finally {
      setSendingReset(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-slate-50 flex items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
      {/* FORGOT PASSWORD MODAL */}
      {showForgotPassword && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            onClick={() => setShowForgotPassword(false)}
          />

          <Card className="relative z-10 w-full max-w-md bg-white rounded-[2rem] sm:rounded-[3rem] shadow-2xl border-none overflow-hidden">
            <div className="p-6 sm:p-8 md:p-10">
              <div className="flex items-start justify-between gap-4 mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-indigo-50 flex items-center justify-center shrink-0">
                    <KeyRound className="w-6 h-6 text-indigo-600" />
                  </div>

                  <div>
                    <h2 className="text-xl sm:text-2xl font-black uppercase tracking-tight text-slate-900">
                      Reset Password
                    </h2>
                    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mt-1">
                      OMSU Guidance System
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowForgotPassword(false)}
                  className="w-9 h-9 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-colors shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {resetEmailSent ? (
                <div className="text-center py-4">
                  <div className="mx-auto w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mb-4">
                    <CheckCircle2 className="w-7 h-7 text-emerald-600" />
                  </div>

                  <h3 className="text-lg font-black text-slate-900">
                    Check Your Email
                  </h3>

                  <p className="mt-2 text-sm text-slate-500 leading-relaxed">
                    If an account exists for{' '}
                    <strong className="text-slate-700">{resetEmail}</strong>,
                    a password reset link has been sent. Open it from the same
                    device/browser to set a new password.
                  </p>

                  <Button
                    type="button"
                    onClick={() => setShowForgotPassword(false)}
                    className="w-full h-12 mt-6 bg-slate-900 hover:bg-indigo-600 text-white rounded-2xl font-black uppercase text-xs tracking-wider"
                  >
                    Back to Sign In
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleSendResetEmail} className="space-y-5">
                  <p className="text-sm text-slate-500 leading-relaxed">
                    Enter your institutional email and we'll send you a link
                    to reset your password.
                  </p>

                  <FieldWrapper
                    label="Institutional Email"
                    required
                    icon={<Mail className="w-4 h-4" />}
                  >
                    <Input
                      className="input-style pl-11"
                      type="email"
                      placeholder="student@omsu.edu.ph"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      autoComplete="email"
                      required
                    />
                  </FieldWrapper>

                  <Button
                    type="submit"
                    disabled={sendingReset}
                    className="w-full h-12 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black uppercase text-xs tracking-wider"
                  >
                    {sendingReset ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4 mr-2" />
                        Send Reset Link
                      </>
                    )}
                  </Button>
                </form>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* TERMS MODAL */}
      {showTerms && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            onClick={() => setShowTerms(false)}
          />

          <Card className="relative z-10 w-full max-w-lg bg-white rounded-[2rem] sm:rounded-[3rem] shadow-2xl border-none overflow-hidden">
            <div className="p-6 sm:p-8 md:p-10">
              <div className="flex items-start justify-between gap-4 mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-indigo-50 flex items-center justify-center shrink-0">
                    <ShieldCheck className="w-6 h-6 text-indigo-600" />
                  </div>

                  <div>
                    <h2 className="text-xl sm:text-2xl font-black uppercase tracking-tight text-slate-900">
                      Privacy & Terms
                    </h2>
                    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mt-1">
                      OMSU Guidance System
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowTerms(false)}
                  className="w-9 h-9 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-colors shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-5 max-h-[55vh] overflow-y-auto pr-2 custom-scrollbar">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600 mb-1">
                    01. Information Accuracy
                  </p>
                  <p className="text-sm leading-relaxed text-slate-500 font-medium">
                    You certify that the information you provide
                    during registration is true and accurate.
                  </p>
                </div>

                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600 mb-1">
                    02. Purpose of Data Collection
                  </p>
                  <p className="text-sm leading-relaxed text-slate-500 font-medium">
                    Student information may be used for account
                    management, guidance program dissemination,
                    survey administration, and aggregated system
                    analytics.
                  </p>
                </div>

                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600 mb-1">
                    03. Analytics
                  </p>
                  <p className="text-sm leading-relaxed text-slate-500 font-medium">
                    Demographic information such as program, year
                    level, age, gender, PWD status, and IP status
                    may be used to generate aggregated awareness
                    analytics.
                  </p>
                </div>

                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600 mb-1">
                    04. Confidentiality
                  </p>
                  <p className="text-sm leading-relaxed text-slate-500 font-medium">
                    Individual student information and survey
                    responses should be handled confidentially and
                    should not be unnecessarily exposed in public
                    reports.
                  </p>
                </div>

                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600 mb-1">
                    05. Account Security
                  </p>
                  <p className="text-sm leading-relaxed text-slate-500 font-medium">
                    Students are responsible for keeping their
                    account credentials secure.
                  </p>
                </div>
              </div>

              <Button
                type="button"
                onClick={() => {
                  setAgreed(true);
                  setShowTerms(false);
                }}
                className="w-full h-14 mt-8 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black uppercase text-xs tracking-wider"
              >
                <Check className="w-4 h-4 mr-2" />
                I Agree to Terms & Privacy Policy
              </Button>
            </div>
          </Card>
        </div>
      )}

      <Card className="w-full max-w-2xl bg-white border-none shadow-2xl rounded-[2rem] sm:rounded-[3rem] overflow-hidden">
        {/* HEADER */}
        <div className="relative px-6 pt-6 sm:px-8 sm:pt-8">
          <button
            type="button"
            onClick={onBackToHome}
            className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-slate-400 hover:text-indigo-600 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </button>

          <div className="flex flex-col items-center text-center mt-8 sm:mt-6">
            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-indigo-600 rounded-[1.5rem] sm:rounded-[2rem] flex items-center justify-center shadow-xl shadow-indigo-100">
              {isRegister ? (
                <UserPlus className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
              ) : (
                <GraduationCap className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-slate-900 mt-5">
              {isRegister
                ? 'Student Registration'
                : 'Portal Sign In'}
            </h1>

            <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-[0.15em] mt-2 max-w-md">
              {isRegister
                ? 'Create your Higher Education student account'
                : 'Unified access for students & administrators'}
            </p>
          </div>
        </div>

        {/* FORM */}
        <form
          onSubmit={handleSubmit}
          className="px-5 sm:px-8 md:px-10 py-7 sm:py-8"
        >
          {isRegister ? (
            <div className="space-y-7">
              {/* ACCOUNT INFORMATION */}
              <section>
                <SectionHeader
                  number="01"
                  title="Account Information"
                  description="Use your official student information."
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  {/* FULL NAME */}
                  <FieldWrapper
                    label="Full Name"
                    required
                    icon={<UserCircle className="w-4 h-4" />}
                  >
                    <Input
                      className="input-style pl-11"
                      placeholder="Juan Dela Cruz"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      autoComplete="name"
                      required
                    />
                  </FieldWrapper>

                  {/* STUDENT ID */}
                  <FieldWrapper
                    label="Student ID Number"
                    required
                    icon={<Fingerprint className="w-4 h-4" />}
                  >
                    <Input
                      className="input-style pl-11"
                      placeholder="2024-XXXXX"
                      value={studentId}
                      onChange={(e) =>
                        setStudentId(e.target.value)
                      }
                      autoComplete="off"
                      required
                    />
                  </FieldWrapper>

                  {/* EMAIL */}
                  <div className="md:col-span-2">
                    <FieldWrapper
                      label="Institutional Email"
                      required
                      icon={<Mail className="w-4 h-4" />}
                    >
                      <Input
                        className="input-style pl-11"
                        type="email"
                        placeholder="student@omsu.edu.ph"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoComplete="email"
                        required
                      />
                    </FieldWrapper>
                  </div>
                </div>
              </section>

              {/* ACADEMIC INFORMATION */}
              <section>
                <SectionHeader
                  number="02"
                  title="Academic Information"
                  description="This information supports program-level analytics."
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  {/* CAMPUS */}
                  <FieldWrapper
                    label="Campus"
                    required
                    icon={<MapPin className="w-4 h-4" />}
                  >
                    <Select
                      value={campus}
                      onValueChange={(value) => {
                        setCampus(value);
                        // The previously selected program almost certainly
                        // doesn't exist at the newly selected campus.
                        setProgram('');
                      }}
                    >
                      <SelectTrigger className="select-style pl-11">
                        <SelectValue placeholder="Select campus" />
                      </SelectTrigger>

                      <SelectContent className="rounded-2xl">
                        {CAMPUSES.map((item) => (
                          <SelectItem key={item} value={item}>
                            {item}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FieldWrapper>

                  {/* YEAR */}
                  <FieldWrapper
                    label="Year Level"
                    required
                    icon={<GraduationCap className="w-4 h-4" />}
                  >
                    <Select
                      value={yearLevel}
                      onValueChange={setYearLevel}
                    >
                      <SelectTrigger className="select-style pl-11">
                        <SelectValue placeholder="Select year" />
                      </SelectTrigger>

                      <SelectContent className="rounded-2xl">
                        <SelectItem value="1">
                          1st Year
                        </SelectItem>
                        <SelectItem value="2">
                          2nd Year
                        </SelectItem>
                        <SelectItem value="3">
                          3rd Year
                        </SelectItem>
                        <SelectItem value="4">
                          4th Year
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </FieldWrapper>

                  {/* PROGRAM */}
                  <div className="md:col-span-2">
                    <FieldWrapper
                      label="Academic Program"
                      required
                      icon={<BookOpen className="w-4 h-4" />}
                    >
                      <Select
                        value={program}
                        onValueChange={setProgram}
                      >
                        <SelectTrigger className="select-style pl-11">
                          <SelectValue placeholder="Select your academic program" />
                        </SelectTrigger>

                        <SelectContent className="rounded-2xl max-h-72">
                          {(PROGRAMS_BY_CAMPUS[campus] || []).map((item) => (
                            <SelectItem
                              key={item}
                              value={item}
                            >
                              {item}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FieldWrapper>
                  </div>
                </div>
              </section>

              {/* DEMOGRAPHIC INFORMATION */}
              <section>
                <SectionHeader
                  number="03"
                  title="Student Profile"
                  description="Used for aggregated awareness analytics."
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                  {/* AGE */}
                  <FieldWrapper
                    label="Age"
                    required
                    icon={<CalendarDays className="w-4 h-4" />}
                  >
                    <Input
                      className="input-style pl-11"
                      type="number"
                      min="15"
                      max="100"
                      placeholder="e.g. 20"
                      value={age}
                      onChange={(e) => setAge(e.target.value)}
                      required
                    />
                  </FieldWrapper>

                  {/* GENDER */}
                  <FieldWrapper
                    label="Gender"
                    required
                    icon={<Users className="w-4 h-4" />}
                  >
                    <Select
                      value={gender}
                      onValueChange={(value) =>
                        setGender(value as Gender)
                      }
                    >
                      <SelectTrigger className="select-style pl-11">
                        <SelectValue />
                      </SelectTrigger>

                      <SelectContent className="rounded-2xl">
                        <SelectItem value="Male">
                          Male
                        </SelectItem>
                        <SelectItem value="Female">
                          Female
                        </SelectItem>
                        <SelectItem value="Other">
                          Other
                        </SelectItem>
                        <SelectItem value="Prefer not to say">
                          Prefer not to say
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </FieldWrapper>

                  {/* PWD */}
                  <FieldWrapper
                    label="PWD Status"
                    required
                    icon={<Accessibility className="w-4 h-4" />}
                  >
                    <Select
                      value={isPwd}
                      onValueChange={(value) =>
                        setIsPwd(value as YesNoPrefer)
                      }
                    >
                      <SelectTrigger className="select-style pl-11">
                        <SelectValue />
                      </SelectTrigger>

                      <SelectContent className="rounded-2xl">
                        <SelectItem value="Yes">
                          Yes
                        </SelectItem>
                        <SelectItem value="No">
                          No
                        </SelectItem>
                        <SelectItem value="Prefer not to say">
                          Prefer not to say
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </FieldWrapper>

                  {/* IP */}
                  <FieldWrapper
                    label="Indigenous Peoples (IP) Status"
                    required
                    icon={<UsersRound className="w-4 h-4" />}
                  >
                    <Select
                      value={isIp}
                      onValueChange={(value) =>
                        setIsIp(value as YesNoPrefer)
                      }
                    >
                      <SelectTrigger className="select-style pl-11">
                        <SelectValue />
                      </SelectTrigger>

                      <SelectContent className="rounded-2xl">
                        <SelectItem value="Yes">
                          Yes
                        </SelectItem>
                        <SelectItem value="No">
                          No
                        </SelectItem>
                        <SelectItem value="Prefer not to say">
                          Prefer not to say
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </FieldWrapper>
                </div>

                <div className="mt-4 flex gap-3 p-4 bg-indigo-50/70 border border-indigo-100 rounded-2xl">
                  <ShieldCheck className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />

                  <p className="text-[10px] leading-relaxed font-medium text-indigo-700">
                    These demographic details are collected to
                    support aggregated system analytics requested
                    for the study. They should not be unnecessarily
                    displayed with individual survey responses.
                  </p>
                </div>
              </section>

              {/* PASSWORD */}
              <section>
                <SectionHeader
                  number="04"
                  title="Account Security"
                  description="Create a secure password for your account."
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  {/* PASSWORD */}
                  <FieldWrapper
                    label="Password"
                    required
                    icon={<Lock className="w-4 h-4" />}
                  >
                    <div className="relative">
                      <Input
                        className="input-style pl-11 pr-12"
                        type={
                          showPassword ? 'text' : 'password'
                        }
                        placeholder="Create password"
                        value={password}
                        onChange={(e) =>
                          setPassword(e.target.value)
                        }
                        autoComplete="new-password"
                        required
                      />

                      <button
                        type="button"
                        onClick={() =>
                          setShowPassword(!showPassword)
                        }
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-600"
                      >
                        {showPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </FieldWrapper>

                  {/* CONFIRM */}
                  <FieldWrapper
                    label="Confirm Password"
                    required
                    icon={<Lock className="w-4 h-4" />}
                  >
                    <div className="relative">
                      <Input
                        className="input-style pl-11 pr-12"
                        type={
                          showConfirmPassword
                            ? 'text'
                            : 'password'
                        }
                        placeholder="Confirm password"
                        value={confirmPassword}
                        onChange={(e) =>
                          setConfirmPassword(e.target.value)
                        }
                        autoComplete="new-password"
                        required
                      />

                      <button
                        type="button"
                        onClick={() =>
                          setShowConfirmPassword(
                            !showConfirmPassword
                          )
                        }
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-600"
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </FieldWrapper>
                </div>

                {/* PASSWORD CHECKLIST */}
                {password.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4 p-4 bg-slate-50 rounded-2xl">
                    <PasswordCheck
                      valid={passwordChecks.length}
                      text="At least 8 characters"
                    />

                    <PasswordCheck
                      valid={passwordChecks.upper}
                      text="One uppercase letter"
                    />

                    <PasswordCheck
                      valid={passwordChecks.lower}
                      text="One lowercase letter"
                    />

                    <PasswordCheck
                      valid={passwordChecks.number}
                      text="One number"
                    />
                  </div>
                )}
              </section>
            </div>
          ) : (
            /* LOGIN */
            <div className="max-w-md mx-auto space-y-5">
              <FieldWrapper
                label="Institutional Email"
                required
                icon={<Mail className="w-4 h-4" />}
              >
                <Input
                  className="input-style pl-11 h-14 text-base"
                  type="email"
                  placeholder="student@omsu.edu.ph"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </FieldWrapper>

              <FieldWrapper
                label="Password"
                required
                icon={<Lock className="w-4 h-4" />}
              >
                <div className="relative">
                  <Input
                    className="input-style pl-11 pr-12 h-14 text-base"
                    type={
                      showPassword ? 'text' : 'password'
                    }
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) =>
                      setPassword(e.target.value)
                    }
                    autoComplete="current-password"
                    required
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setShowPassword(!showPassword)
                    }
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-600"
                  >
                    {showPassword ? (
                      <EyeOff className="w-5 h-5" />
                    ) : (
                      <Eye className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </FieldWrapper>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleOpenForgotPassword}
                  className="text-[10px] font-black uppercase tracking-wider text-indigo-600 hover:underline"
                >
                  Forgot Password?
                </button>
              </div>
            </div>
          )}

          {/* TERMS (registration only — sign-in doesn't re-collect consent) */}
          {isRegister && (
          <div className="mt-7">
            <div
              className={`flex items-start gap-3 p-4 rounded-2xl border transition-all ${
                agreed
                  ? 'bg-emerald-50 border-emerald-100'
                  : 'bg-slate-50 border-slate-100'
              }`}
            >
              <div className="relative flex items-center shrink-0 mt-0.5">
                <input
                  id="terms"
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) =>
                    setAgreed(e.target.checked)
                  }
                  className="peer h-5 w-5 cursor-pointer appearance-none rounded-md border-2 border-slate-300 bg-white checked:bg-indigo-600 checked:border-indigo-600 transition-all"
                />

                <Check className="absolute w-3.5 h-3.5 text-white opacity-0 peer-checked:opacity-100 pointer-events-none top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
              </div>

              <label
                htmlFor="terms"
                className="text-[10px] sm:text-xs leading-relaxed font-bold text-slate-500 cursor-pointer select-none"
              >
                I agree to the{' '}
                <button
                  type="button"
                  onClick={() => setShowTerms(true)}
                  className="text-indigo-600 hover:underline font-black"
                >
                  Guidance Terms & Privacy Policy
                </button>
                .
              </label>
            </div>
          </div>
          )}

          {/* SUBMIT */}
          <Button
            type="submit"
            disabled={isLoading}
            className="w-full h-14 sm:h-16 mt-4 bg-slate-900 hover:bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] sm:text-xs transition-all shadow-xl shadow-slate-200"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Processing...
              </>
            ) : isRegister ? (
              <>
                <UserPlus className="w-4 h-4 mr-2" />
                Create Student Account
              </>
            ) : (
              <>
                <GraduationCap className="w-4 h-4 mr-2" />
                Login to Portal
              </>
            )}
          </Button>
        </form>

        {/* FOOTER */}
        <div className="px-5 sm:px-8 pb-7 sm:pb-8">
          <div className="border-t border-slate-100 pt-6 text-center">
            <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-400">
              {isRegister
                ? 'Already have a student account?'
                : 'New student?'}
            </p>

            <button
              type="button"
              onClick={handleToggleMode}
              className="mt-2 text-indigo-600 hover:text-indigo-700 font-black uppercase text-[10px] tracking-wider hover:underline"
            >
              {isRegister
                ? 'Login here'
                : 'Register here'}
            </button>
          </div>
        </div>
      </Card>

      {/* SIMPLE LOCAL STYLES */}
      <style>{`
        .input-style {
          width: 100%;
          height: 3rem;
          border-radius: 1rem;
          background: rgb(248 250 252);
          border: 1px solid transparent;
          font-weight: 700;
          color: rgb(51 65 85);
          transition: all 0.2s ease;
        }

        .input-style:focus {
          background: white;
          border-color: rgb(165 180 252);
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.08);
          outline: none;
        }

        .select-style {
          width: 100%;
          height: 3rem;
          border-radius: 1rem;
          background: rgb(248 250 252);
          border: 1px solid transparent;
          font-weight: 700;
          color: rgb(51 65 85);
        }

        .select-style:focus {
          background: white;
          border-color: rgb(165 180 252);
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.08);
        }

        .custom-scrollbar::-webkit-scrollbar {
          width: 5px;
        }

        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }

        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgb(203 213 225);
          border-radius: 999px;
        }
      `}</style>
    </div>
  );
}

/* =========================================================
   HELPER COMPONENTS
========================================================= */

function SectionHeader({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-[10px] font-black shrink-0">
        {number}
      </div>

      <div>
        <h2 className="text-xs sm:text-sm font-black uppercase tracking-wider text-slate-800">
          {title}
        </h2>

        <p className="text-[9px] sm:text-[10px] text-slate-400 font-medium mt-1">
          {description}
        </p>
      </div>
    </div>
  );
}

function FieldWrapper({
  label,
  required,
  icon,
  children,
}: {
  label: string;
  required?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1.5 ml-1 text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-slate-500">
        {icon && (
          <span className="text-indigo-500">
            {icon}
          </span>
        )}

        {label}

        {required && (
          <span className="text-rose-500">*</span>
        )}
      </Label>

      {children}
    </div>
  );
}

function PasswordCheck({
  valid,
  text,
}: {
  valid: boolean;
  text: string;
}) {
  return (
    <div
      className={`flex items-center gap-2 text-[9px] font-bold ${
        valid
          ? 'text-emerald-600'
          : 'text-slate-400'
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