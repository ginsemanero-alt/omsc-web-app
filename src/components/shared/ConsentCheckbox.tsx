import { Check } from "lucide-react";
import { CONSENT_CHECKBOX_LABEL } from "../../lib/privacyNotice";

// The one required consent checkbox, shared by the registration consent
// step and the consent screen for existing accounts.

const focusRing =
  "focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#A5B4FC]";

interface Props {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export default function ConsentCheckbox({ id, checked, onChange }: Props) {
  return (
    <label
      htmlFor={id}
      className={`flex gap-3.5 items-start p-4 lg:px-5 lg:py-[18px] rounded-[20px] lg:rounded-[22px] cursor-pointer border-[1.5px] transition-colors ${
        checked ? "bg-emerald-50 border-emerald-300" : "bg-[#EEF0FA] border-transparent"
      }`}
    >
      <span className="relative flex items-center shrink-0 mt-0.5">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className={`peer h-[22px] w-[22px] appearance-none rounded-md border-2 border-[#A5ADC6] bg-white checked:bg-[#4F46E5] checked:border-[#4F46E5] cursor-pointer transition-colors ${focusRing}`}
        />
        <Check
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white opacity-0 peer-checked:opacity-100 pointer-events-none"
          strokeWidth={3}
          aria-hidden="true"
        />
      </span>
      <span className="text-sm leading-[1.55] text-[#334155]">{CONSENT_CHECKBOX_LABEL}</span>
    </label>
  );
}
