import { useEffect, useState } from "react";
import { KeyRound, X } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { supabase } from "../../lib/supabase";
import { useT } from "../../i18n";

// PHASE 54. Accounts an administrator created start with a temporary password
// printed on a slip. Changing it is OPTIONAL: this is only a reminder, and the
// student can dismiss it. The dismissal is remembered on this device only (it is a
// convenience, not a record). Students who registered themselves never see it.
//
// A student who wants a new password signs out and uses "Forgot password" on the
// sign-in page (the email link is the only password-change route in the app).

const storageKey = (userId: string) => `omsu-temp-password-reminder-dismissed:${userId}`;

export default function TempPasswordReminder() {
  const { user } = useAuth();
  const { t } = useT();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!user?.id || !user.email) return;
    try {
      if (localStorage.getItem(storageKey(user.id)) === "1") return;
    } catch {
      /* blocked storage: the reminder simply shows each time */
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("users")
        .select("provisioned_batch")
        .eq("email", user.email as string)
        .is("archived_at", null)
        .maybeSingle();
      // the column is not there yet (or no connection): no reminder, nothing breaks
      if (cancelled || error) return;
      if (data?.provisioned_batch) setShow(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.email]);

  if (!show || !user?.id) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(storageKey(user.id), "1");
    } catch {
      /* ignore */
    }
    setShow(false);
  };

  return (
    <div
      role="note"
      className="mb-6 flex items-start gap-3 rounded-2xl border border-indigo-200 bg-white px-4 py-3 text-sm text-slate-700 dark:border-indigo-900 dark:bg-slate-900 dark:text-slate-200"
    >
      <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" aria-hidden="true" />
      <p className="m-0 flex-1 leading-[1.5]">
        {t("You are using the temporary password from your slip. Changing it is optional: sign out and choose \"Forgot password\" on the sign-in page whenever you want a new one.")}
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t("Dismiss")}
        className="rounded-lg p-1 text-slate-500 hover:text-slate-900 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#A5B4FC] dark:hover:text-white"
      >
        <X className="h-5 w-5" aria-hidden="true" />
      </button>
    </div>
  );
}
