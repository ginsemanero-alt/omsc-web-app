import { useEffect } from "react";
import { PRIVACY_NOTICE_VERSION } from "../lib/privacyNotice";
import PrivacyNoticeBody from "../components/shared/PrivacyNoticeBody";

// Public /privacy page — the full Data Privacy Notice (RA 10173). Rendered
// inside the public Layout like the other public pages.

export default function PrivacyPage() {
  useEffect(() => {
    const previous = document.title;
    document.title = "Privacy Notice | Guidance and Testing Center";
    return () => {
      document.title = previous;
    };
  }, []);

  return (
    <div className="font-figtree text-[#1E293B] max-w-[860px] mx-auto px-5 py-10 lg:px-8 lg:py-14">
      <div className="bg-white rounded-[32px] lg:rounded-[40px] p-6 sm:p-10 flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="m-0 font-bricolage font-extrabold text-[32px] sm:text-[40px] leading-[1.1] tracking-[-0.8px] text-[#1E1B4B]">
            Privacy Notice
          </h1>
          <p className="m-0 text-[15px] leading-[1.55] text-[#5B6477]">
            How the Guidance and Testing Center of Occidental Mindoro State University collects and uses your
            personal information, under the Data Privacy Act of 2012 (RA 10173).
          </p>
          <p className="m-0 text-[13px] text-[#5B6477]">Notice version {PRIVACY_NOTICE_VERSION}</p>
        </div>

        <PrivacyNoticeBody headingLevel="h2" />
      </div>
    </div>
  );
}
