import { Fragment, useState, type ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Scale, X } from "lucide-react";

// "RA 10173" as a clickable term: a student who doesn't know what it is can
// tap it and read a short plain-English explanation. Used wherever the
// privacy notice or the registration form mentions the law.
//
// Built on the Radix dialog directly (not components/ui/dialog) so it can
// sit above the custom Privacy Notice modal on the login page, which uses
// z-[100]. Radix gives it focus trapping, Esc to close and focus return.

const focusRing =
  "focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#A5B4FC]";

export default function Ra10173Link({ label = "RA 10173" }: { label?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <button
          type="button"
          aria-haspopup="dialog"
          className={`inline p-0 m-0 bg-transparent border-0 font-inherit font-bold text-[#4338CA] underline decoration-dotted underline-offset-[3px] hover:text-[#312E81] cursor-pointer rounded ${focusRing}`}
        >
          {label}
        </button>
      </DialogPrimitive.Trigger>

      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[300] bg-[#1E1B4B]/60 backdrop-blur-sm motion-safe:data-[state=open]:animate-in motion-safe:data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-1/2 z-[301] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 max-h-[85vh] flex flex-col overflow-hidden rounded-[32px] bg-white p-6 sm:p-8 shadow-[0_24px_60px_-24px_rgba(30,27,75,0.45)] font-figtree text-[#1E293B] motion-safe:data-[state=open]:animate-in motion-safe:data-[state=open]:fade-in-0 motion-safe:data-[state=open]:zoom-in-95"
        >
          <div className="flex items-start justify-between gap-4 mb-4 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-11 h-11 rounded-[14px] bg-[#EEF0FA] flex items-center justify-center shrink-0">
                <Scale className="w-6 h-6 text-[#4338CA]" aria-hidden="true" />
              </span>
              <DialogPrimitive.Title className="m-0 font-bricolage font-extrabold text-2xl tracking-[-0.5px] text-[#1E1B4B]">
                What is RA 10173?
              </DialogPrimitive.Title>
            </div>
            <DialogPrimitive.Close
              aria-label="Close"
              className={`w-11 h-11 -mt-1 -mr-1 rounded-xl bg-[#F1F2F9] flex items-center justify-center text-[#5B6477] hover:text-[#1E1B4B] shrink-0 ${focusRing}`}
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>

          <DialogPrimitive.Description asChild>
            <div className="flex flex-col gap-3 text-sm leading-relaxed text-[#334155] min-h-0 flex-1 overflow-y-auto pr-1">
              <p className="m-0">
                <strong className="text-[#1E1B4B]">RA 10173</strong> is the <strong className="text-[#1E1B4B]">Data Privacy Act of 2012</strong>.
                It is a Philippine law that protects the personal information you give to schools, offices and
                companies.
              </p>
              <p className="m-0">
                Under this law, an organization has to tell you why it collects your information, collect only
                what it needs, keep it safe, and let you see it, correct it, object to its use, or have it
                erased.
              </p>
              <p className="m-0">
                Some information is <strong className="text-[#1E1B4B]">sensitive</strong>, such as disability
                status or Indigenous Peoples membership. The law gives it extra protection, which is why this
                system shows it only as combined counts and never next to your name.
              </p>
              <p className="m-0">
                The <strong className="text-[#1E1B4B]">National Privacy Commission</strong> (privacy.gov.ph) is
                the government office that enforces the law. You can file a complaint there if you believe your
                rights were violated.
              </p>
            </div>
          </DialogPrimitive.Description>

          <DialogPrimitive.Close
            className={`w-full min-h-[52px] mt-5 shrink-0 rounded-2xl bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold text-base transition-colors ${focusRing}`}
          >
            Got it
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

// Plain text with every "RA 10173" turned into the clickable term.
export function withRaLinks(text: string): ReactNode {
  const parts = text.split("RA 10173");
  if (parts.length === 1) return text;
  return parts.map((part, index) => (
    <Fragment key={index}>
      {part}
      {index < parts.length - 1 && <Ra10173Link />}
    </Fragment>
  ));
}
