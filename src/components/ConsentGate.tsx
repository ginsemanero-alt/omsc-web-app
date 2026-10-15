import { ReactNode, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabase";
import { PRIVACY_NOTICE_VERSION } from "../lib/privacyNotice";
import PrivacyNoticeBody from "./shared/PrivacyNoticeBody";
import ConsentCheckbox from "./shared/ConsentCheckbox";

// Students whose consent on file is missing or for an older version of the
// notice (every account created before PHASE 33, and everyone after a
// version bump) see the notice once and continue only after agreeing.
// Enforced here in the app; registration is enforced on the server.

const focusRing =
  "focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#A5B4FC]";

interface Props {
  children: ReactNode;
  onSignOut: () => void | Promise<void>;
}

export default function ConsentGate({ children, onSignOut }: Props) {
  const { consentVersion, consentLoaded, refreshConsent } = useAuth();
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!consentLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#EEF0FA]">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" aria-label="Loading" />
      </div>
    );
  }

  if (consentVersion === PRIVACY_NOTICE_VERSION) return <>{children}</>;

  const handleAgree = async () => {
    if (!agreed || saving) return;
    setSaving(true);
    setError(null);

    const { error: rpcError } = await supabase.rpc("record_my_consent", {
      p_version: PRIVACY_NOTICE_VERSION,
    });

    if (rpcError) {
      console.error("record_my_consent:", rpcError);
      setError("We couldn't save your agreement. Check your connection and try again.");
      setSaving(false);
      return;
    }

    await refreshConsent();
    setSaving(false);
  };

  return (
    <div className="min-h-screen bg-[#EEF0FA] font-figtree text-[#1E293B] px-4 py-8 flex items-start justify-center">
      <main className="w-full max-w-2xl bg-white rounded-[32px] sm:rounded-[40px] p-6 sm:p-10 flex flex-col gap-6 motion-fade-up">
        <div className="flex items-center gap-3">
          <span className="w-11 h-11 rounded-[14px] bg-[#EEF0FA] flex items-center justify-center shrink-0">
            <ShieldCheck className="w-6 h-6 text-[#4338CA]" aria-hidden="true" />
          </span>
          <div>
            <h1 className="m-0 font-bricolage font-extrabold text-2xl sm:text-[28px] tracking-[-0.5px] text-[#1E1B4B]">
              Data privacy consent
            </h1>
            <p className="m-0 mt-0.5 text-[13px] text-[#5B6477]">Guidance and Testing Center</p>
          </div>
        </div>

        <p className="m-0 text-[15px] leading-[1.55] text-[#5B6477]">
          Please read how your information is collected and used. You can continue to your account after you agree.
        </p>

        <div className="max-h-[45vh] overflow-y-auto pr-2" tabIndex={0} aria-label="Data privacy notice">
          <PrivacyNoticeBody headingLevel="h2" />
        </div>

        <ConsentCheckbox id="gate-consent" checked={agreed} onChange={setAgreed} />

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
            Don't agree, sign out
          </button>
          <button
            type="button"
            onClick={handleAgree}
            disabled={!agreed || saving}
            className={`min-h-[52px] px-[34px] rounded-2xl bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold text-base flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${focusRing}`}
          >
            {saving && <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />}
            {saving ? "Saving..." : "Continue"}
          </button>
        </div>
      </main>
    </div>
  );
}
