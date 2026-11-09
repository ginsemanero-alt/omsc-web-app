import { ReactNode, useCallback, useEffect, useState } from "react";
import { Loader2, UserCheck } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabase";
import { UNDER_18_NOTE } from "../lib/privacyNotice";
import { useT } from "../i18n";

// PHASE 54. A student whose profile has no gender, age, PWD or IP answer yet
// (every account an administrator provisioned) answers them here once, before
// reaching programs or assessments. The wording and options are the same as at
// registration: no preselected answer and no "prefer not to say", because these
// answers feed the gender / PWD / IP statistics. Existing students are never
// shown this (all of them already answered at registration).
//
// The database enforces the same rule in submit_assessment(), so this screen
// cannot be skipped by calling the API directly.
//
// If the check itself cannot run (the database function is not there yet, or no
// connection) the student is let through rather than locked out; the database
// check is what actually protects the data.

const focusRing =
  "focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#A5B4FC]";

type Gender = "Male" | "Female" | "Other";
type YesNo = "Yes" | "No";
type State = "checking" | "complete" | "incomplete";

interface Props {
  children: ReactNode;
  onSignOut: () => void | Promise<void>;
}

export default function ProfileGate({ children, onSignOut }: Props) {
  const { user } = useAuth();
  const { t } = useT();
  const [state, setState] = useState<State>("checking");
  const [gender, setGender] = useState<Gender | "">("");
  const [age, setAge] = useState("");
  const [isPwd, setIsPwd] = useState<YesNo | "">("");
  const [isIp, setIsIp] = useState<YesNo | "">("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const check = useCallback(async (): Promise<State> => {
    const { data, error: rpcError } = await supabase.rpc("my_profile_is_complete");
    if (rpcError) {
      console.warn("my_profile_is_complete:", rpcError.message);
      return "complete";
    }
    return data === false ? "incomplete" : "complete";
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const result = await check();
      if (cancelled) return;
      if (result === "incomplete") {
        // keep whatever the student has already answered
        const { data } = await supabase
          .from("profiles")
          .select("gender, age, is_pwd, is_ip")
          .eq("id", user.id)
          .maybeSingle();
        if (cancelled) return;
        if (data?.gender === "Male" || data?.gender === "Female" || data?.gender === "Other") setGender(data.gender);
        if (typeof data?.age === "number") setAge(String(data.age));
        if (typeof data?.is_pwd === "boolean") setIsPwd(data.is_pwd ? "Yes" : "No");
        if (typeof data?.is_ip === "boolean") setIsIp(data.is_ip ? "Yes" : "No");
      }
      setState(result);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, check]);

  if (state === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#EEF0FA]">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" aria-label="Loading" />
      </div>
    );
  }

  if (state === "complete") return <>{children}</>;

  const numericAge = Number(age);
  const ageNumber = age.trim() !== "" && Number.isFinite(numericAge) && Number.isInteger(numericAge);

  const handleSave = async () => {
    if (saving || !user?.id) return;
    if (!gender) return setError(t("Please select your gender."));
    if (!ageNumber || numericAge < 15 || numericAge > 100) return setError(t("Please enter a valid age (15 to 100)."));
    if (!isPwd || !isIp) return setError(t("Please answer the PWD and IP questions."));

    setSaving(true);
    setError(null);
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ gender, age: numericAge, is_pwd: isPwd === "Yes", is_ip: isIp === "Yes" })
      .eq("id", user.id);

    // An update that matched no row reports no error, so the database is asked again.
    const result = updateError ? "incomplete" : await check();
    if (result === "complete") {
      setState("complete");
    } else {
      if (updateError) console.error("profile update:", updateError.message);
      setError(t("We couldn't save your answers. Check your connection and try again."));
    }
    setSaving(false);
  };

  const choice = <V extends string>(
    label: string,
    options: readonly V[],
    value: V | "",
    onChange: (v: V) => void,
    columns: string,
    display: (v: V) => string
  ) => (
    <div className="flex flex-col gap-2">
      <span id={`pg-${label.replace(/[^a-z0-9]+/gi, "-")}`} className="font-semibold text-sm text-[#1E293B]">
        {label}
      </span>
      <div role="radiogroup" aria-labelledby={`pg-${label.replace(/[^a-z0-9]+/gi, "-")}`} className={`grid ${columns} gap-2.5`}>
        {options.map((option) => {
          const selected = value === option;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => {
                setError(null);
                onChange(option);
              }}
              className={`min-h-[52px] rounded-2xl border-[1.5px] font-bold text-[15px] transition-colors ${focusRing} ${
                selected
                  ? "border-[#4F46E5] bg-[#EEF0FA] text-[#312E81]"
                  : "border-[#DDE1EE] bg-white text-[#1E293B] hover:border-[#A5B4FC]"
              }`}
            >
              {display(option)}
            </button>
          );
        })}
      </div>
    </div>
  );

  const ageIsMinor = ageNumber && numericAge > 0 && numericAge < 18;

  return (
    <div className="min-h-screen bg-[#EEF0FA] font-figtree text-[#1E293B] px-4 py-8 flex items-start justify-center">
      <main className="w-full max-w-xl bg-white rounded-[32px] sm:rounded-[40px] p-6 sm:p-10 flex flex-col gap-6 motion-fade-up">
        <div className="flex items-center gap-3">
          <span className="w-11 h-11 rounded-[14px] bg-[#EEF0FA] flex items-center justify-center shrink-0">
            <UserCheck className="w-6 h-6 text-[#4338CA]" aria-hidden="true" />
          </span>
          <div>
            <h1 className="m-0 font-bricolage font-extrabold text-2xl sm:text-[28px] tracking-[-0.5px] text-[#1E1B4B]">
              {t("Complete your profile")}
            </h1>
            <p className="m-0 mt-0.5 text-[13px] text-[#5B6477]">Guidance and Testing Center</p>
          </div>
        </div>

        <p className="m-0 text-[15px] leading-[1.55] text-[#5B6477]">
          {t("Answer these four questions once. You can then continue to the programs and assessments.")}
        </p>

        <div className="flex flex-col gap-2">
          <label htmlFor="pg-age" className="font-semibold text-sm">
            {t("Age")}
          </label>
          <input
            id="pg-age"
            type="number"
            inputMode="numeric"
            min={15}
            max={100}
            value={age}
            onChange={(e) => {
              setError(null);
              setAge(e.target.value);
            }}
            placeholder="e.g. 20"
            className={`h-12 rounded-[14px] border-[1.5px] border-[#DDE1EE] bg-white px-4 text-[15px] ${focusRing}`}
          />
          {ageIsMinor && (
            <p role="note" className="m-0 rounded-[14px] bg-[#FEF3C7] px-3.5 py-2.5 text-[13px] leading-[1.5] text-[#92400E]">
              {UNDER_18_NOTE}
            </p>
          )}
        </div>

        {choice(t("Gender"), ["Male", "Female", "Other"] as const, gender, setGender, "grid-cols-3", (v) => t(v))}
        {choice(t("Person with disability (PWD)"), ["Yes", "No"] as const, isPwd, setIsPwd, "grid-cols-2", (v) => t(v))}
        {choice(t("Member of an Indigenous Peoples group (IP)"), ["Yes", "No"] as const, isIp, setIsIp, "grid-cols-2", (v) => t(v))}

        <p className="m-0 text-sm leading-[1.55] text-[#5B6477]">
          <strong className="text-[#1E1B4B]">{t("Why we ask.")}</strong>{" "}
          {t("These details appear only in combined statistics and are never shown next to your name.")}
        </p>

        {error && (
          <p role="alert" className="m-0 text-sm font-semibold text-rose-600">
            {error}
          </p>
        )}

        <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-3">
          <button
            type="button"
            onClick={() => void onSignOut()}
            disabled={saving}
            className={`min-h-[52px] px-[22px] rounded-2xl border-[1.5px] border-[#DDE1EE] bg-white text-[#1E293B] font-bold text-[15px] hover:border-[#A5B4FC] transition-colors disabled:opacity-60 ${focusRing}`}
          >
            {t("Sign out")}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className={`min-h-[52px] px-[34px] rounded-2xl bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold text-base flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${focusRing}`}
          >
            {saving && <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />}
            {saving ? t("Saving...") : t("Save and continue")}
          </button>
        </div>
      </main>
    </div>
  );
}
