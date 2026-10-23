import { useNavigate } from "react-router-dom";
import { LogIn } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../ui/dialog";
import { signInUrlFor } from "../../lib/returnTo";

// The prompt a visitor gets when they try to open a material. It never shows
// file content or a file link. After signing in (or registering and
// verifying their email) the student comes back to returnPath.

export const SIGN_IN_CTA = "Sign in to view this material and take the Awareness Check.";

const focusRing =
  "focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#A5B4FC]";

interface Props {
  // The title of the material being opened; null = closed.
  title: string | null;
  // Where the student should land after signing in, e.g.
  // "/student/materials?material=12".
  returnPath: string;
  onClose: () => void;
}

export default function SignInPrompt({ title, returnPath, onClose }: Props) {
  const navigate = useNavigate();

  return (
    <Dialog open={!!title} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm rounded-[2.5rem] p-7 sm:p-9 border-none shadow-2xl font-figtree text-center">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-[#EEF0FA] text-[#4338CA] flex items-center justify-center">
          <LogIn className="w-6 h-6" aria-hidden="true" />
        </div>
        <DialogTitle className="mt-2 font-bricolage font-extrabold text-2xl tracking-[-0.5px] text-[#1E1B4B] text-center">
          Sign in to view this material
        </DialogTitle>
        <DialogDescription className="text-[15px] leading-[1.55] text-[#5B6477] text-center">
          <strong className="text-[#1E293B]">{title}</strong> is for OMSU students. {SIGN_IN_CTA}
        </DialogDescription>
        <div className="mt-4 flex flex-col gap-3">
          <button
            type="button"
            onClick={() => navigate(signInUrlFor(returnPath))}
            className={`min-h-[52px] rounded-2xl bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold text-[15px] transition-colors ${focusRing}`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => navigate(signInUrlFor(returnPath, "register"))}
            className={`min-h-[52px] rounded-2xl border-[1.5px] border-[#DDE1EE] bg-white text-[#1E1B4B] font-bold text-[15px] hover:border-[#A5B4FC] transition-colors ${focusRing}`}
          >
            Create account
          </button>
          <button
            type="button"
            onClick={onClose}
            className={`min-h-[44px] rounded-2xl text-[#5B6477] font-semibold text-[15px] hover:text-[#1E1B4B] ${focusRing}`}
          >
            Cancel
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
