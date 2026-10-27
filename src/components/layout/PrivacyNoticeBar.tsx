import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { NOTICE_BAR_TEXT, PRIVACY_NOTICE_VERSION } from "../../lib/privacyNotice";

// Small notice at the bottom of the public pages on a first visit. "Got it"
// remembers the dismissal for this version of the notice (localStorage);
// when the version changes it shows again.

const STORAGE_KEY = "omsu_privacy_notice_dismissed";

// Not shown where the notice is already the content (/privacy), where the
// registration consent step is the notice (/login), or inside the signed-in
// apps.
const HIDDEN_PREFIXES = ["/privacy", "/login", "/reset-password", "/student", "/admin"];

const focusRing =
  "focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#A5B4FC]";

function wasDismissed(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === PRIVACY_NOTICE_VERSION;
  } catch {
    return false;
  }
}

export default function PrivacyNoticeBar() {
  const { pathname } = useLocation();
  const [dismissed, setDismissed] = useState(wasDismissed);

  if (dismissed || HIDDEN_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, PRIVACY_NOTICE_VERSION);
    } catch {
      // Storage unavailable (private window, blocked site data): the
      // notice just shows again next visit.
    }
    setDismissed(true);
  };

  return (
    <section
      aria-label="Privacy notice"
      className="fixed inset-x-0 bottom-0 z-50 p-3 sm:p-4 font-figtree motion-fade-up"
    >
      <div className="max-w-[960px] mx-auto bg-[#1E1B4B] text-white rounded-[22px] shadow-[0_16px_40px_-16px_rgba(30,27,75,0.6)] px-4 py-4 sm:px-6 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5">
        <div className="flex gap-3 items-start flex-1 min-w-0">
          <ShieldCheck className="w-5 h-5 mt-0.5 shrink-0 text-[#FBBF24]" aria-hidden="true" />
          <p className="m-0 text-sm leading-[1.5] text-[#E0E1F8]">
            {NOTICE_BAR_TEXT}{" "}
            <Link
              to="/privacy"
              // py-3 with an equal negative margin: a 44px-tall tap area that leaves the text layout alone.
              className={`inline-block py-3 -my-3 font-bold text-white underline rounded ${focusRing}`}
            >
              Read our Privacy Notice.
            </Link>
          </p>
        </div>

        <div className="flex gap-2.5 sm:shrink-0">
          <Link
            to="/privacy"
            className={`flex-1 sm:flex-none min-h-[44px] min-w-[44px] px-5 rounded-xl border-[1.5px] border-white/35 text-white font-bold text-sm inline-flex items-center justify-center hover:bg-white/10 transition-colors ${focusRing}`}
          >
            Read
          </Link>
          <button
            type="button"
            onClick={dismiss}
            className={`flex-1 sm:flex-none min-h-[44px] min-w-[44px] px-5 rounded-xl bg-[#FBBF24] text-[#1E1B4B] font-extrabold text-sm hover:bg-[#F59E0B] transition-colors ${focusRing}`}
          >
            Got it
          </button>
        </div>
      </div>
    </section>
  );
}
