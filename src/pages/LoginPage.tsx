import { useState, useEffect, useRef, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';

import {
  ArrowLeft,
  Home,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  Eye,
  EyeOff,
  Fingerprint,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  Send,
  ShieldCheck,
  SquareCheckBig,
  User,
  X,
} from 'lucide-react';

import { useToast } from '../hooks/use-toast';
import { supabase } from '../lib/supabase';
import { logActivity } from '../lib/activityLog';
import { PROGRAMS_BY_CAMPUS } from '../lib/programs';
import { motionDelay, prefersReducedMotion, replayAnimation } from '../lib/motion';

// How long the sign in <-> register switch plays before the view changes.
const VIEW_SWITCH_MS = 200;

type UserRole = 'student' | 'admin';

interface LoginPageProps {
  onLogin: (role: UserRole, name: string) => void;
  onBackToHome: () => void;
}

type Gender = 'Male' | 'Female' | 'Other';
type YesNo = 'Yes' | 'No';
type RegisterStep = 1 | 2 | 3;

const CAMPUSES = [
  'San Jose Campus',
  'Labangan Campus',
  'Murtha Campus',
];

const YEAR_LEVELS = [
  { value: '1', label: '1st' },
  { value: '2', label: '2nd' },
  { value: '3', label: '3rd' },
  { value: '4', label: '4th' },
];

const SYSTEM_TITLE =
  'Web-Based Guidance Program Dissemination and Awareness Assessment System for the Higher Education Students of Occidental Mindoro State University';

// The three registration steps: what the student fills in on each.
const REGISTER_STEPS: Record<RegisterStep, { title: string; description: string }> = {
  1: {
    title: 'Account details',
    description: 'Use the name, student ID, and institutional email on your school records.',
  },
  2: {
    title: 'Academic and profile',
    description: 'These help the Guidance Center see which students its programs are reaching.',
  },
  3: {
    title: 'Password and consent',
    description: 'Choose a password, then review how your information is used.',
  },
};

// Shared input styling (mockup: 52px tall, 16px radius, 1.5px #DDE1EE
// border on #F5F6FB, #A5B4FC focus ring). 16px text on phones so iOS
// doesn't zoom into the field.
const inputBase =
  'w-full border-[1.5px] border-[#DDE1EE] bg-[#F5F6FB] font-figtree text-base lg:text-[15px] text-[#1E293B] placeholder:text-[#8A91A6] outline-none focus:outline-[3px] focus:outline-offset-2 focus:outline-[#A5B4FC] transition-colors';
const inputClass = `${inputBase} h-[52px] rounded-2xl`;

const focusRing =
  'focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#A5B4FC]';

export default function LoginPage({
  onLogin,
  onBackToHome,
}: LoginPageProps) {
  // A "Get Started" link elsewhere (the public homepage) can deep-link
  // straight into the registration form via /login?mode=register, instead
  // of landing on Login and making the student find "Register Here"
  // themselves.
  const [searchParams] = useSearchParams();
  const [isRegister, setIsRegister] = useState(() => searchParams.get('mode') === 'register');
  const [registerStep, setRegisterStep] = useState<RegisterStep>(1);
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
  const [gender, setGender] = useState<Gender | ''>('');

  const [isIp, setIsIp] =
    useState<YesNo | ''>('');

  const [isPwd, setIsPwd] =
    useState<YesNo | ''>('');

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [isLoading, setIsLoading] = useState(false);

  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [sendingReset, setSendingReset] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);

  const { toast } = useToast();

  /* ---------------- Motion only (no effect on the form logic) ---------------- */

  // Sign in <-> register switch: the current view fades out (and on sign
  // in, the tab pill slides over) before handleToggleMode runs. Extra
  // clicks during that time are ignored. ?mode=register opens register
  // straight away, with the normal page entrance and no exit.
  const [switchingOut, setSwitchingOut] = useState(false);
  const [viewEntrance, setViewEntrance] = useState<'page' | 'switch'>('page');
  const switchingRef = useRef(false);
  const switchTimerRef = useRef<number | null>(null);
  const focusHeadingAfterSwitchRef = useRef(false);

  // Failed sign-in shakes the submit button (never with reduced motion —
  // the shake class only animates without it).
  const [signInShakes, setSignInShakes] = useState(0);
  const signInButtonRef = useRef<HTMLButtonElement>(null);

  // Direction of the last registration step change, for the slide-in.
  // Kept until the step changes again so re-renders don't flip it.
  const stepMotionRef = useRef<{ step: RegisterStep; direction: 'next' | 'prev' | null }>({
    step: registerStep,
    direction: null,
  });
  if (stepMotionRef.current.step !== registerStep) {
    stepMotionRef.current = {
      step: registerStep,
      direction: registerStep > stepMotionRef.current.step ? 'next' : 'prev',
    };
  }
  const stepDirection = stepMotionRef.current.direction;

  useEffect(() => {
    if (signInShakes > 0) replayAnimation(signInButtonRef.current, 'motion-shake');
  }, [signInShakes]);

  // After a switch, keyboard and screen-reader users land on the new
  // view's heading (whichever one is visible at this screen size).
  useEffect(() => {
    if (!focusHeadingAfterSwitchRef.current) return;
    focusHeadingAfterSwitchRef.current = false;
    const heading = Array.from(document.querySelectorAll<HTMLElement>('[data-view-heading]')).find(
      (element) => element.getClientRects().length > 0
    );
    heading?.focus({ preventScroll: true });
  }, [isRegister]);

  useEffect(
    () => () => {
      if (switchTimerRef.current !== null) window.clearTimeout(switchTimerRef.current);
    },
    []
  );

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

  // Each registration step starts at the top of the page.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [registerStep, isRegister]);

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
    setGender('');
    setIsIp('');
    setIsPwd('');
    setAgreed(false);
    setShowPassword(false);
    setShowConfirmPassword(false);
    setRegisterStep(1);
  };

  const fail = (title: string, description: string) => {
    toast({ variant: 'destructive', title, description });
    return false;
  };

  // Validation for one registration step — Continue only moves on when
  // the current step is complete. Same rules and messages as before the
  // form was split into steps.
  const validateStep = (step: RegisterStep) => {
    if (step === 1) {
      if (name.trim().length < 3) return fail('INVALID NAME', 'Please enter your complete name.');
      if (!studentId.trim()) return fail('STUDENT ID REQUIRED', 'Please enter your official Student ID number.');
      if (!email.trim()) return fail('EMAIL REQUIRED', 'Please enter your institutional email.');
      return true;
    }

    if (step === 2) {
      const numericAge = Number(age);
      if (!program) return fail('PROGRAM REQUIRED', 'Please select your academic program.');
      if (!age || Number.isNaN(numericAge)) return fail('AGE REQUIRED', 'Please enter your age.');
      if (numericAge < 15 || numericAge > 100) return fail('INVALID AGE', 'Please enter a valid age.');
      // No default and no "Prefer not to say": these feed the gender, PWD,
      // and IP analytics, and a preselected answer was being submitted
      // untouched by most students.
      if (!gender) return fail('GENDER REQUIRED', 'Please select your gender.');
      if (!isPwd) return fail('PWD STATUS REQUIRED', 'Please indicate whether you are a person with disability (PWD).');
      if (!isIp) return fail('IP STATUS REQUIRED', 'Please indicate whether you belong to an Indigenous Peoples (IP) group.');
      return true;
    }

    if (!isPasswordStrong) {
      return fail('WEAK PASSWORD', 'Password must be at least 8 characters and contain uppercase, lowercase, and a number.');
    }
    if (password !== confirmPassword) return fail('PASSWORD MISMATCH', 'Passwords do not match.');
    if (!agreed) return fail('ACTION REQUIRED', 'Please read and agree to the Guidance Terms & Privacy Policy.');
    return true;
  };

  const validateRegistration = () => validateStep(1) && validateStep(2) && validateStep(3);

  const goToNextStep = () => {
    if (registerStep < 3 && validateStep(registerStep)) {
      setRegisterStep((registerStep + 1) as RegisterStep);
    }
  };

  const goToPreviousStep = () => {
    if (registerStep > 1) setRegisterStep((registerStep - 1) as RegisterStep);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Enter on steps 1-2 moves to the next step instead of submitting.
    if (isRegister && registerStep < 3) {
      goToNextStep();
      return;
    }

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

              // Admin logins already show up in the Activity Log via
              // every admin action's actorEmail — this is specifically
              // for tracking student sign-ins, which nothing else logs.
              if (data.role === 'student') {
                logActivity({
                  actorEmail: data.email,
                  actorName: data.name,
                  action: 'login',
                  entityType: 'user',
                  entityId: data.id,
                  entityLabel: data.name,
                });
              }
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
            // Green for a successful student sign-in, matching every other
            // success state in the app (ACCOUNT CREATED above, and the
            // admin logout toast) — admin sign-in keeps the indigo brand
            // color it always had.
            className:
              data.role === 'student'
                ? 'bg-emerald-600 text-white font-black rounded-2xl shadow-2xl'
                : 'bg-indigo-600 text-white font-black rounded-2xl shadow-2xl',
          });

          onLogin(data.role, data.name);
        }
      } else {
        if (!isRegister) setSignInShakes((count) => count + 1);
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

      if (!isRegister) setSignInShakes((count) => count + 1);
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
    setRegisterStep(1);

    if (!isRegister) {
      setPassword('');
      setConfirmPassword('');
    }
  };

  // Every sign in <-> register link goes through here: play the switch,
  // then run the unchanged handleToggleMode. With reduced motion it runs
  // right away.
  const switchMode = () => {
    if (switchingRef.current) return;
    switchingRef.current = true;

    const finish = () => {
      switchTimerRef.current = null;
      focusHeadingAfterSwitchRef.current = true;
      // A new view starts with the view fade only, not a step slide.
      stepMotionRef.current = { step: 1, direction: null };
      handleToggleMode();
      setSwitchingOut(false);
      setViewEntrance('switch');
      switchingRef.current = false;
    };

    if (prefersReducedMotion()) {
      finish();
      return;
    }

    setSwitchingOut(true);
    switchTimerRef.current = window.setTimeout(finish, VIEW_SWITCH_MS);
  };

  // Root class for whichever view is showing: exit, switch-in, or none
  // (the first page load animates its panel and form card instead).
  const viewMotionClass = switchingOut ? 'motion-view-exit' : viewEntrance === 'switch' ? 'motion-view-enter' : '';
  const pageEntrance = viewEntrance === 'page';
  const panelEntranceClass = pageEntrance ? 'motion-fade-in' : '';
  const cardEntranceClass = pageEntrance ? 'motion-fade-up' : '';
  const cardEntranceStyle = pageEntrance ? motionDelay(100) : undefined;

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

  /* =========================================================
     PIECES
  ========================================================= */

  // Explicit way back to the public homepage (the logo also links there,
  // but that isn't obvious).
  const homeButton = (compact = false) => (
    <button
      type="button"
      onClick={onBackToHome}
      aria-label="Back to homepage"
      className={`shrink-0 flex items-center justify-center gap-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white font-semibold transition-colors ${focusRing} ${
        compact ? 'w-11 h-11 rounded-[14px]' : 'h-10 px-4 text-[13px]'
      }`}
    >
      {compact ? <Home className="w-5 h-5" aria-hidden="true" /> : (
        <>
          <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Home
        </>
      )}
    </button>
  );

  const brand = (size: 'lg' | 'md' | 'sm') => (
    <div className="flex items-center justify-between gap-3">
      {brandMark(size)}
      {homeButton(size === 'sm')}
    </div>
  );

  const brandMark = (size: 'lg' | 'md' | 'sm') => (
    <button
      type="button"
      onClick={onBackToHome}
      className={`flex items-center text-left rounded-2xl min-w-0 ${focusRing} ${
        size === 'sm' ? 'gap-3' : 'gap-3.5'
      }`}
      aria-label="Guidance and Testing Center home"
    >
      <img
        src="/guidance-logo.jpg"
        alt="OMSU Guidance and Testing Center logo"
        className={`rounded-full object-cover bg-white shrink-0 ${
          size === 'lg' ? 'w-14 h-14' : size === 'md' ? 'w-[52px] h-[52px]' : 'w-11 h-11'
        }`}
      />
      <span className="flex flex-col gap-0.5">
        <span className={`font-bold ${size === 'lg' ? 'text-base' : size === 'md' ? 'text-[15px]' : 'text-sm'}`}>
          Guidance and Testing Center
        </span>
        <span className={`text-[#C7C9F2] ${size === 'lg' ? 'text-sm' : size === 'md' ? 'text-[13px]' : 'text-xs'}`}>
          Occidental Mindoro State University
        </span>
      </span>
    </button>
  );

  const passwordField = (
    id: string,
    label: string,
    value: string,
    onChange: (value: string) => void,
    visible: boolean,
    onToggle: () => void,
    placeholder: string,
    autoComplete: string,
    extra?: ReactNode
  ) => (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between items-baseline gap-3">
        <label htmlFor={id} className="font-semibold text-sm text-[#1E293B]">{label}</label>
        {extra}
      </div>
      <div className="relative">
        <Lock className="absolute left-4 top-[17px] w-[18px] h-[18px] text-[#6B7285] pointer-events-none" aria-hidden="true" />
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required
          className={`${inputClass} pl-[46px] pr-[52px]`}
        />
        <button
          type="button"
          onClick={onToggle}
          aria-label={visible ? 'Hide password' : 'Show password'}
          className={`absolute right-1 lg:right-1.5 top-1 w-11 h-11 rounded-xl flex items-center justify-center text-[#6B7285] hover:bg-slate-100 transition-colors ${focusRing}`}
        >
          {visible ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
        </button>
      </div>
    </div>
  );

  /* =========================================================
     SIGN IN
  ========================================================= */

  const signIn = (
    <div className={`min-h-screen w-full font-figtree text-[#1E293B] bg-[#1E1B4B] lg:bg-[#EEF0FA] flex flex-col lg:flex-row lg:p-6 lg:gap-6 ${viewMotionClass}`}>
      {/* DESKTOP PANEL */}
      <aside className={`hidden lg:flex lg:w-[46%] xl:w-[600px] shrink-0 flex-col justify-between rounded-[56px] bg-[#1E1B4B] text-white px-10 xl:px-[52px] py-12 ${panelEntranceClass}`}>
        {brand('lg')}

        <div className="flex flex-col gap-[22px]">
          <span className="self-start px-3.5 py-[7px] rounded-full bg-[#FBBF24] text-[#1E1B4B] font-extrabold text-[13px]">
            Student portal
          </span>
          <h1 className="m-0 font-bricolage font-extrabold text-[44px] xl:text-[54px] leading-[1.02] tracking-[-1.5px]">
            Every guidance program, open to every student.
          </h1>
          <p className="m-0 text-lg leading-[1.55] text-[#C7C9F2] max-w-[460px]">
            Browse the Center's programs, read their materials, and see how much you have learned.
          </p>
          <div className="flex flex-col gap-3.5 mt-1.5">
            {[
              { icon: CalendarDays, text: 'Revisit programs even if you missed the event' },
              { icon: BookOpen, text: 'Infographics, videos, and guides from the Center' },
              { icon: SquareCheckBig, text: 'Short pre- and post-tests that show your progress' },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3.5">
                <span className="w-10 h-10 rounded-[14px] bg-white/10 flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5 text-[#FBBF24]" aria-hidden="true" />
                </span>
                <span className="text-base leading-[1.4]">{text}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3.5">
          <div className="flex gap-2">
            {['San Jose', 'Labangan', 'Murtha'].map((campusName) => (
              <span key={campusName} className="px-3.5 py-[7px] rounded-full bg-white/10 text-[13px] font-semibold">
                {campusName}
              </span>
            ))}
          </div>
          <p className="m-0 text-[13px] leading-[1.5] text-[#A5A8E0] max-w-[470px]">{SYSTEM_TITLE}</p>
        </div>
      </aside>

      {/* MOBILE HEADER */}
      <header className={`lg:hidden px-6 pt-7 pb-[34px] text-white flex flex-col gap-[18px] ${panelEntranceClass}`}>
        {brand('sm')}
        <span className="self-start px-3 py-1.5 rounded-full bg-[#FBBF24] text-[#1E1B4B] font-extrabold text-xs">
          Student portal
        </span>
        <h1
          data-view-heading
          tabIndex={-1}
          className="m-0 font-bricolage font-extrabold text-[34px] leading-[1.04] tracking-[-1px] focus:outline-none"
        >
          Every guidance program, open to every student.
        </h1>
      </header>

      {/* FORM */}
      <main
        style={cardEntranceStyle}
        className={`flex-grow flex flex-col bg-white rounded-t-[40px] px-6 pt-[26px] pb-7 lg:bg-transparent lg:rounded-none lg:p-0 lg:items-center lg:justify-center ${cardEntranceClass}`}
      >
        <form
          onSubmit={handleSubmit}
          className="w-full max-w-md mx-auto flex flex-grow lg:flex-grow-0 flex-col gap-[22px] lg:gap-[26px] lg:w-[460px] lg:max-w-none lg:rounded-[40px] lg:bg-white lg:px-11 lg:pt-11 lg:pb-10 lg:shadow-[0_24px_60px_-24px_rgba(30,27,75,0.25)]"
        >
          {/* The white pill is one element that slides to "Create account"
              while the switch plays, instead of jumping. */}
          <div className="relative grid grid-cols-2 gap-1 p-[5px] rounded-full bg-[#F1F2F9]">
            <span
              aria-hidden="true"
              className={`absolute top-[5px] bottom-[5px] left-[5px] w-[calc(50%_-_7px)] rounded-full bg-white shadow-[0_2px_8px_rgba(30,27,75,0.12)] motion-slide-indicator ${
                switchingOut ? 'translate-x-[calc(100%_+_4px)]' : 'translate-x-0'
              }`}
            />
            <button
              type="button"
              aria-pressed="true"
              className={`relative h-11 rounded-full text-[15px] transition-colors duration-150 ease-out ${focusRing} ${
                switchingOut ? 'text-[#5B6477] font-semibold' : 'text-[#1E1B4B] font-bold'
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              aria-pressed="false"
              onClick={switchMode}
              className={`relative h-11 rounded-full text-[15px] hover:text-[#1E1B4B] transition-colors duration-150 ease-out ${focusRing} ${
                switchingOut ? 'text-[#1E1B4B] font-bold' : 'text-[#5B6477] font-semibold'
              }`}
            >
              Create account
            </button>
          </div>

          <div className="hidden lg:flex flex-col gap-2">
            <h2
              data-view-heading
              tabIndex={-1}
              className="m-0 font-bricolage font-extrabold text-4xl tracking-[-0.8px] text-[#1E1B4B] focus:outline-none"
            >
              Welcome back
            </h2>
            <p className="m-0 text-[15px] leading-[1.5] text-[#5B6477]">
              Sign in with your institutional email. Guidance staff use this sign-in too.
            </p>
          </div>

          <div className="flex flex-col gap-4 lg:gap-[18px]">
            <div className="flex flex-col gap-2">
              <label htmlFor="email" className="font-semibold text-sm">Institutional email</label>
              <div className="relative">
                <Mail className="absolute left-4 top-[17px] w-[18px] h-[18px] text-[#6B7285] pointer-events-none" aria-hidden="true" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="student@omsu.edu.ph"
                  autoComplete="email"
                  required
                  className={`${inputClass} pl-[46px] pr-4`}
                />
              </div>
            </div>

            {passwordField(
              'password',
              'Password',
              password,
              setPassword,
              showPassword,
              () => setShowPassword(!showPassword),
              'Enter your password',
              'current-password',
              <button
                type="button"
                onClick={handleOpenForgotPassword}
                className={`text-sm font-bold text-[#4338CA] hover:text-[#312E81] hover:underline rounded ${focusRing}`}
              >
                Forgot password?
              </button>
            )}
          </div>

          <button
            ref={signInButtonRef}
            type="submit"
            disabled={isLoading}
            className={`h-14 rounded-[18px] bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold text-base flex items-center justify-center gap-2 transition-colors motion-press disabled:opacity-70 ${focusRing}`}
          >
            {isLoading && <Loader2 className="w-5 h-5 animate-spin" />}
            {isLoading ? 'Signing in...' : 'Sign in'}
          </button>

          <p className="m-0 text-center text-[15px] text-[#5B6477]">
            New student?{' '}
            <button
              type="button"
              onClick={switchMode}
              className={`font-bold text-[#4338CA] hover:text-[#312E81] hover:underline rounded ${focusRing}`}
            >
              Create your account
            </button>
          </p>

          <p className="lg:hidden mt-auto mb-0 text-center text-xs leading-[1.5] text-[#6B7285]">
            Web-Based Guidance Program Dissemination and Awareness Assessment System
          </p>
        </form>
      </main>
    </div>
  );

  /* =========================================================
     REGISTER
  ========================================================= */

  const stepInfo = REGISTER_STEPS[registerStep];

  const choiceButton = (selected: boolean, label: string, onClick: () => void, key?: string) => (
    <button
      key={key ?? label}
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`h-12 rounded-[14px] border-[1.5px] text-sm lg:text-[15px] motion-chip ${focusRing} ${
        selected
          ? 'border-[#4F46E5] bg-[#4F46E5] text-white font-bold'
          : 'border-[#DDE1EE] bg-white text-[#1E293B] font-semibold hover:border-[#A5B4FC]'
      }`}
    >
      {label}
    </button>
  );

  const choiceGroup = (legend: string, columns: string, children: ReactNode, className = '') => (
    <fieldset className={`m-0 p-0 border-0 flex flex-col gap-2 min-w-0 ${className}`}>
      <legend className="p-0 mb-2 font-semibold text-sm">{legend}</legend>
      <div className={`grid ${columns} gap-2`}>{children}</div>
    </fieldset>
  );

  const infoNote = (children: ReactNode) => (
    <div className="flex gap-3 lg:gap-3.5 items-start p-4 lg:px-5 lg:py-[18px] rounded-[20px] lg:rounded-[22px] bg-[#EEF0FA]">
      <ShieldCheck className="w-5 h-5 lg:w-[22px] lg:h-[22px] text-[#4338CA] shrink-0 mt-px" aria-hidden="true" />
      <p className="m-0 text-[13px] lg:text-sm leading-[1.55] text-[#334155]">{children}</p>
    </div>
  );

  const stepOneFields = (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-[22px] lg:gap-x-6">
      <div className="flex flex-col gap-2">
        <label htmlFor="reg-name" className="font-semibold text-sm">Full name</label>
        <div className="relative">
          <User className="absolute left-4 top-[17px] w-[18px] h-[18px] text-[#6B7285] pointer-events-none" aria-hidden="true" />
          <input
            id="reg-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Juan Dela Cruz"
            autoComplete="name"
            className={`${inputClass} pl-[46px] pr-4`}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="reg-student-id" className="font-semibold text-sm">Student ID number</label>
        <div className="relative">
          <Fingerprint className="absolute left-4 top-[17px] w-[18px] h-[18px] text-[#6B7285] pointer-events-none" aria-hidden="true" />
          <input
            id="reg-student-id"
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            placeholder="2024-XXXXX"
            autoComplete="off"
            className={`${inputClass} pl-[46px] pr-4`}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2 lg:col-span-2">
        <label htmlFor="reg-email" className="font-semibold text-sm">Institutional email</label>
        <div className="relative">
          <Mail className="absolute left-4 top-[17px] w-[18px] h-[18px] text-[#6B7285] pointer-events-none" aria-hidden="true" />
          <input
            id="reg-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="student@omsu.edu.ph"
            autoComplete="email"
            className={`${inputClass} pl-[46px] pr-4`}
          />
        </div>
        <p className="m-0 text-[13px] text-[#5B6477]">You'll use this email to sign in.</p>
      </div>
    </div>
  );

  const stepTwoFields = (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-[22px] lg:gap-x-6">
        {choiceGroup(
          'Campus',
          'grid-cols-3',
          CAMPUSES.map((item) =>
            choiceButton(campus === item, item.replace(' Campus', ''), () => {
              if (campus === item) return;
              setCampus(item);
              // The previously selected program almost certainly
              // doesn't exist at the newly selected campus.
              setProgram('');
            }, item)
          ),
          'lg:col-span-2'
        )}

        <div className="flex flex-col gap-2 lg:col-span-2">
          <label htmlFor="reg-program" className="font-semibold text-sm">Academic program</label>
          <div className="relative">
            <select
              id="reg-program"
              value={program}
              onChange={(e) => setProgram(e.target.value)}
              className={`${inputClass} appearance-none pl-3.5 lg:pl-4 pr-12 ${program ? '' : 'text-[#8A91A6]'}`}
            >
              <option value="" disabled>Select your academic program</option>
              {(PROGRAMS_BY_CAMPUS[campus] || []).map((item) => (
                <option key={item} value={item} className="text-[#1E293B]">{item}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-4 lg:right-[18px] top-[17px] w-[18px] h-[18px] text-[#6B7285] pointer-events-none" aria-hidden="true" />
          </div>
        </div>

        {choiceGroup(
          'Year level',
          'grid-cols-4',
          YEAR_LEVELS.map((level) =>
            choiceButton(yearLevel === level.value, level.label, () => setYearLevel(level.value), level.value)
          )
        )}

        <div className="flex flex-col gap-2">
          <label htmlFor="reg-age" className="font-semibold text-sm">Age</label>
          <input
            id="reg-age"
            type="number"
            min={15}
            max={100}
            value={age}
            onChange={(e) => setAge(e.target.value)}
            placeholder="e.g. 20"
            className={`${inputBase} h-12 rounded-[14px] px-3.5 lg:px-4`}
          />
        </div>

        {choiceGroup(
          'Gender',
          'grid-cols-3',
          (['Male', 'Female', 'Other'] as Gender[]).map((option) =>
            choiceButton(gender === option, option, () => setGender(option))
          ),
          'lg:col-span-2'
        )}

        {choiceGroup(
          'Person with disability (PWD)',
          'grid-cols-2',
          (['Yes', 'No'] as YesNo[]).map((option) =>
            choiceButton(isPwd === option, option, () => setIsPwd(option), `pwd-${option}`)
          )
        )}

        {choiceGroup(
          'Member of an Indigenous Peoples group (IP)',
          'grid-cols-2',
          (['Yes', 'No'] as YesNo[]).map((option) =>
            choiceButton(isIp === option, option, () => setIsIp(option), `ip-${option}`)
          )
        )}
      </div>

      {infoNote(
        <>
          <strong className="text-[#1E1B4B]">Why we ask.</strong> These details appear only in combined
          statistics and are never shown next to your name. They are handled under the Data Privacy Act of
          2012 (RA 10173).
        </>
      )}
    </>
  );

  const stepThreeFields = (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-[22px] lg:gap-x-6">
        {passwordField(
          'reg-password',
          'Password',
          password,
          setPassword,
          showPassword,
          () => setShowPassword(!showPassword),
          'Create a password',
          'new-password'
        )}
        {passwordField(
          'reg-confirm-password',
          'Confirm password',
          confirmPassword,
          setConfirmPassword,
          showConfirmPassword,
          () => setShowConfirmPassword(!showConfirmPassword),
          'Type it again',
          'new-password'
        )}
      </div>

      <ul className="m-0 p-4 lg:px-5 list-none grid grid-cols-1 sm:grid-cols-2 gap-2.5 rounded-[20px] border-[1.5px] border-[#DDE1EE]" aria-label="Password requirements">
        {[
          { valid: passwordChecks.length, text: 'At least 8 characters' },
          { valid: passwordChecks.upper, text: 'One uppercase letter' },
          { valid: passwordChecks.lower, text: 'One lowercase letter' },
          { valid: passwordChecks.number, text: 'One number' },
        ].map(({ valid, text }) => (
          <li key={text} className={`flex items-center gap-2 text-sm font-semibold transition-colors duration-150 ease-out ${valid ? 'text-emerald-600' : 'text-[#5B6477]'}`}>
            {/* The check mounts when the rule is met, so it pops in. */}
            {valid ? <CheckCircle2 className="w-[18px] h-[18px] shrink-0 motion-pop" /> : <Circle className="w-[18px] h-[18px] shrink-0 text-[#C0C5D6]" />}
            {text}
          </li>
        ))}
        {confirmPassword.length > 0 && (
          // Keyed by match state so the message (the one inline error on
          // this form) fades in fresh each time it changes.
          <li
            key={password === confirmPassword ? 'match' : 'mismatch'}
            className={`flex items-center gap-2 text-sm font-semibold sm:col-span-2 motion-fade-in ${password === confirmPassword ? 'text-emerald-600' : 'text-rose-600'}`}
          >
            {password === confirmPassword ? <CheckCircle2 className="w-[18px] h-[18px] shrink-0 motion-pop" /> : <X className="w-[18px] h-[18px] shrink-0" />}
            {password === confirmPassword ? 'Passwords match' : 'Passwords do not match'}
          </li>
        )}
      </ul>

      <label
        htmlFor="reg-terms"
        className={`flex gap-3.5 items-start p-4 lg:px-5 lg:py-[18px] rounded-[20px] lg:rounded-[22px] cursor-pointer border-[1.5px] transition-colors ${
          agreed ? 'bg-emerald-50 border-emerald-300' : 'bg-[#EEF0FA] border-transparent'
        }`}
      >
        <span className="relative flex items-center shrink-0 mt-0.5">
          <input
            id="reg-terms"
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className={`peer h-[22px] w-[22px] appearance-none rounded-md border-2 border-[#A5ADC6] bg-white checked:bg-[#4F46E5] checked:border-[#4F46E5] cursor-pointer transition-colors ${focusRing}`}
          />
          <Check className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white opacity-0 peer-checked:opacity-100 pointer-events-none" strokeWidth={3} />
        </span>
        <span className="text-sm leading-[1.55] text-[#334155]">
          I agree to the{' '}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              setShowTerms(true);
            }}
            className={`font-bold text-[#4338CA] hover:text-[#312E81] hover:underline rounded ${focusRing}`}
          >
            Guidance Terms &amp; Privacy Policy
          </button>
          , and confirm the information I gave is true.
        </span>
      </label>
    </>
  );

  const register = (
    <div className={`min-h-screen w-full font-figtree text-[#1E293B] bg-white lg:bg-[#EEF0FA] flex flex-col lg:flex-row lg:p-6 lg:gap-6 ${viewMotionClass}`}>
      {/* DESKTOP PANEL */}
      <aside className={`hidden lg:flex w-[400px] xl:w-[440px] shrink-0 flex-col justify-between rounded-[56px] bg-[#1E1B4B] text-white p-11 ${panelEntranceClass}`}>
        <div className="flex flex-col gap-10">
          {brand('md')}

          <div className="flex flex-col gap-3.5">
            <h1 className="m-0 font-bricolage font-extrabold text-[42px] leading-[1.05] tracking-[-1px]">
              Create your student account
            </h1>
            <p className="m-0 text-base leading-[1.55] text-[#C7C9F2]">
              Takes about two minutes. Have your student ID and institutional email ready.
            </p>
          </div>

          <ol aria-label="Registration steps" className="m-0 p-0 list-none flex flex-col">
            {([1, 2, 3] as RegisterStep[]).map((step) => {
              const done = step < registerStep;
              const current = step === registerStep;
              return (
                <li key={step} aria-current={current ? 'step' : undefined} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    {/* One dot element for every state, so its fill
                        changes smoothly; the check pops in when done. */}
                    <span
                      className={`w-9 h-9 rounded-full border-2 text-base flex items-center justify-center transition-colors duration-300 ease-out ${
                        done
                          ? 'bg-[#34D399] border-[#34D399]'
                          : current
                            ? 'bg-[#FBBF24] border-[#FBBF24] text-[#1E1B4B] font-extrabold'
                            : 'bg-transparent border-white/35 text-[#C7C9F2] font-bold'
                      }`}
                    >
                      {done ? (
                        <Check className="w-[18px] h-[18px] text-[#064E3B] motion-pop" strokeWidth={3} aria-hidden="true" />
                      ) : (
                        step
                      )}
                    </span>
                    {step < 3 && (
                      <span className={`w-0.5 h-[34px] transition-colors duration-300 ease-out ${done ? 'bg-[#34D399]' : 'bg-white/[0.18]'}`} />
                    )}
                  </div>
                  <div className="flex flex-col gap-0.5 pt-1.5">
                    <span className={`font-bold text-base transition-colors duration-300 ease-out ${!done && !current ? 'text-[#C7C9F2]' : ''}`}>
                      {REGISTER_STEPS[step].title}
                    </span>
                    <span className={`text-sm ${current ? 'text-[#FBBF24]' : 'text-[#A5A8E0]'}`}>
                      {done ? 'Done' : current ? 'In progress' : 'Next'}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        <p className="m-0 text-[15px] text-[#C7C9F2]">
          Already have an account?{' '}
          <button
            type="button"
            onClick={switchMode}
            className={`font-bold text-white underline rounded ${focusRing}`}
          >
            Sign in
          </button>
        </p>
      </aside>

      {/* MOBILE HEADER */}
      <header className={`lg:hidden px-5 pt-[18px] pb-5 bg-[#1E1B4B] text-white rounded-b-[32px] flex flex-col gap-4 ${panelEntranceClass}`}>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={registerStep === 1 ? switchMode : goToPreviousStep}
            aria-label={registerStep === 1 ? 'Back to sign in' : 'Previous step'}
            className={`w-11 h-11 rounded-[14px] bg-white/10 flex items-center justify-center ${focusRing}`}
          >
            <ArrowLeft className="w-5 h-5" aria-hidden="true" />
          </button>
          <span className="font-bold text-base">Create your account</span>
          <span className="ml-auto px-[11px] py-1.5 rounded-full bg-[#FBBF24] text-[#1E1B4B] font-extrabold text-xs whitespace-nowrap">
            Step {registerStep} of 3
          </span>
          {homeButton(true)}
        </div>
        <div className="grid grid-cols-3 gap-1.5" aria-hidden="true">
          {([1, 2, 3] as RegisterStep[]).map((step) => (
            <span
              key={step}
              className={`h-1.5 rounded-full transition-colors duration-300 ease-out ${
                step < registerStep ? 'bg-[#34D399]' : step === registerStep ? 'bg-[#FBBF24]' : 'bg-white/20'
              }`}
            />
          ))}
        </div>
        <div className="flex flex-col gap-1">
          <h1
            data-view-heading
            tabIndex={-1}
            className="m-0 font-bricolage font-extrabold text-[28px] tracking-[-0.6px] focus:outline-none"
          >
            {stepInfo.title}
          </h1>
          <p className="m-0 text-sm leading-[1.5] text-[#C7C9F2]">{stepInfo.description}</p>
        </div>
      </header>

      {/* FORM */}
      <main
        style={cardEntranceStyle}
        className={`flex-grow flex flex-col px-5 py-6 lg:rounded-[40px] lg:bg-white lg:px-[52px] lg:py-11 ${cardEntranceClass}`}
      >
        {/* Remounts per step; Continue slides the new step in from the
            right, Back from the left. */}
        <form
          key={registerStep}
          onSubmit={handleSubmit}
          noValidate
          className={`w-full max-w-xl lg:max-w-none mx-auto flex flex-grow flex-col gap-[22px] lg:gap-[26px] ${
            stepDirection === 'next' ? 'motion-step-next' : stepDirection === 'prev' ? 'motion-step-prev' : ''
          }`}
        >
          <div className="hidden lg:flex flex-col gap-2.5">
            <span className="self-start px-3 py-1.5 rounded-full bg-[#EEF0FA] text-[#4338CA] font-bold text-[13px]">
              Step {registerStep} of 3
            </span>
            <h2
              data-view-heading
              tabIndex={-1}
              className="m-0 font-bricolage font-extrabold text-[34px] tracking-[-0.8px] text-[#1E1B4B] focus:outline-none"
            >
              {stepInfo.title}
            </h2>
            <p className="m-0 text-[15px] leading-[1.5] text-[#5B6477]">{stepInfo.description}</p>
          </div>

          {registerStep === 1 && stepOneFields}
          {registerStep === 2 && stepTwoFields}
          {registerStep === 3 && stepThreeFields}

          <div className="mt-auto pt-2 flex flex-col-reverse gap-3 lg:flex-row lg:justify-between lg:items-center">
            {registerStep > 1 ? (
              <button
                type="button"
                onClick={goToPreviousStep}
                className={`hidden lg:flex h-[52px] px-[22px] rounded-2xl border-[1.5px] border-[#DDE1EE] bg-white text-[#1E293B] font-bold text-[15px] items-center gap-2 hover:border-[#A5B4FC] transition-colors motion-press ${focusRing}`}
              >
                <ArrowLeft className="w-[18px] h-[18px]" aria-hidden="true" /> Back
              </button>
            ) : (
              <p className="hidden lg:block m-0 text-sm text-[#5B6477]">
                Already registered?{' '}
                <button
                  type="button"
                  onClick={switchMode}
                  className={`font-bold text-[#4338CA] hover:text-[#312E81] hover:underline rounded ${focusRing}`}
                >
                  Sign in
                </button>
              </p>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className={`h-14 lg:h-[52px] w-full lg:w-auto px-[34px] rounded-[18px] lg:rounded-2xl bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold text-base flex items-center justify-center gap-2 transition-colors motion-press disabled:opacity-70 ${focusRing}`}
            >
              {registerStep < 3 ? (
                'Continue'
              ) : (
                // On the last step the button reserves room for its
                // longest label ("Creating account..." with the spinner),
                // so it keeps the same width while loading.
                <span className="grid">
                  <span className="col-start-1 row-start-1 flex items-center justify-center gap-2">
                    {isLoading && <Loader2 className="w-5 h-5 animate-spin" />}
                    {isLoading ? 'Creating account...' : 'Create account'}
                  </span>
                  <span aria-hidden="true" className="col-start-1 row-start-1 invisible flex items-center justify-center gap-2">
                    <Loader2 className="w-5 h-5" />
                    Creating account...
                  </span>
                </span>
              )}
            </button>
          </div>

          {registerStep === 1 && (
            <p className="lg:hidden m-0 text-center text-[15px] text-[#5B6477]">
              Already have an account?{' '}
              <button
                type="button"
                onClick={switchMode}
                className={`font-bold text-[#4338CA] hover:text-[#312E81] hover:underline rounded ${focusRing}`}
              >
                Sign in
              </button>
            </p>
          )}
        </form>
      </main>
    </div>
  );

  /* =========================================================
     MODALS
  ========================================================= */

  const modalShell = (onClose: () => void, icon: ReactNode, title: string, children: ReactNode, maxWidth = 'max-w-md') => (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 font-figtree text-[#1E293B]">
      <div className="absolute inset-0 bg-[#1E1B4B]/60 backdrop-blur-sm motion-dialog-backdrop" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative z-10 w-full ${maxWidth} bg-white rounded-[40px] shadow-[0_24px_60px_-24px_rgba(30,27,75,0.45)] p-7 sm:p-10 motion-dialog`}
      >
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <span className="w-11 h-11 rounded-[14px] bg-[#EEF0FA] flex items-center justify-center shrink-0">{icon}</span>
            <div>
              <h2 className="m-0 font-bricolage font-extrabold text-2xl tracking-[-0.5px] text-[#1E1B4B]">{title}</h2>
              <p className="m-0 mt-0.5 text-[13px] text-[#5B6477]">Guidance and Testing Center</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={`w-10 h-10 rounded-xl bg-[#F1F2F9] flex items-center justify-center text-[#5B6477] hover:text-[#1E1B4B] shrink-0 ${focusRing}`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );

  return (
    <>
      {isRegister ? register : signIn}

      {/* FORGOT PASSWORD */}
      {showForgotPassword &&
        modalShell(
          () => setShowForgotPassword(false),
          <KeyRound className="w-6 h-6 text-[#4338CA]" />,
          'Reset password',
          resetEmailSent ? (
            <div className="text-center py-2">
              <div className="mx-auto w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mb-4">
                <CheckCircle2 className="w-7 h-7 text-emerald-600" />
              </div>
              <h3 className="m-0 font-bricolage font-extrabold text-xl text-[#1E1B4B]">Check your email</h3>
              <p className="mt-2 mb-0 text-sm text-[#5B6477] leading-relaxed">
                If an account exists for <strong className="text-[#1E293B]">{resetEmail}</strong>, a password reset
                link has been sent. Open it from the same device/browser to set a new password.
              </p>
              <button
                type="button"
                onClick={() => setShowForgotPassword(false)}
                className={`w-full h-[52px] mt-6 rounded-2xl bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold text-[15px] transition-colors motion-press ${focusRing}`}
              >
                Back to sign in
              </button>
            </div>
          ) : (
            <form onSubmit={handleSendResetEmail} className="flex flex-col gap-5">
              <p className="m-0 text-sm text-[#5B6477] leading-relaxed">
                Enter your institutional email and we'll send you a link to reset your password.
              </p>
              <div className="flex flex-col gap-2">
                <label htmlFor="reset-email" className="font-semibold text-sm">Institutional email</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-[17px] w-[18px] h-[18px] text-[#6B7285] pointer-events-none" aria-hidden="true" />
                  <input
                    id="reset-email"
                    type="email"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    placeholder="student@omsu.edu.ph"
                    autoComplete="email"
                    required
                    className={`${inputClass} pl-[46px] pr-4`}
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={sendingReset}
                className={`h-[52px] rounded-2xl bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold text-[15px] flex items-center justify-center gap-2 transition-colors motion-press disabled:opacity-70 ${focusRing}`}
              >
                {sendingReset ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {sendingReset ? 'Sending...' : 'Send reset link'}
              </button>
            </form>
          )
        )}

      {/* TERMS */}
      {showTerms &&
        modalShell(
          () => setShowTerms(false),
          <ShieldCheck className="w-6 h-6 text-[#4338CA]" />,
          'Privacy and terms',
          <>
            <div className="flex flex-col gap-5 max-h-[55vh] overflow-y-auto pr-2">
              {[
                { title: 'Information accuracy', text: 'You certify that the information you provide during registration is true and accurate.' },
                { title: 'Purpose of data collection', text: 'Student information may be used for account management, guidance program dissemination, survey administration, and aggregated system analytics.' },
                { title: 'Analytics', text: 'Demographic information such as program, year level, age, gender, PWD status, and IP status may be used to generate aggregated awareness analytics.' },
                { title: 'Confidentiality', text: 'Individual student information and survey responses should be handled confidentially and should not be unnecessarily exposed in public reports.' },
                { title: 'Account security', text: 'Students are responsible for keeping their account credentials secure.' },
              ].map((item, index) => (
                <div key={item.title}>
                  <p className="m-0 mb-1 font-bold text-sm text-[#4338CA]">
                    {String(index + 1).padStart(2, '0')}. {item.title}
                  </p>
                  <p className="m-0 text-sm leading-relaxed text-[#5B6477]">{item.text}</p>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                setAgreed(true);
                setShowTerms(false);
              }}
              className={`w-full h-14 mt-7 rounded-[18px] bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold text-base flex items-center justify-center gap-2 transition-colors motion-press ${focusRing}`}
            >
              <Check className="w-5 h-5" /> I agree
            </button>
          </>,
          'max-w-lg'
        )}
    </>
  );
}
