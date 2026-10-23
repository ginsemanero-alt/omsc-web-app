import { ArrowRight, Lock } from "lucide-react";
import { shortDescription, thumbnailFor, typeStyle, type MaterialPreview } from "../../lib/materialPreview";

// One IEC material as a visitor sees it: thumbnail, type, title, a short
// description, and a clear "sign in" line. Opening it asks the parent to
// either send a signed-in student to the material or show the sign-in prompt.

const focusRing =
  "focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#A5B4FC]";

interface Props {
  material: MaterialPreview;
  signedIn: boolean;
  onOpen: (material: MaterialPreview) => void;
}

export default function MaterialPreviewCard({ material, signedIn, onOpen }: Props) {
  const style = typeStyle(material.type);
  const TypeIcon = style.icon;
  const cover = thumbnailFor(material);
  const description = shortDescription(material.description);

  return (
    <button
      type="button"
      onClick={() => onOpen(material)}
      aria-label={
        signedIn
          ? `Open ${style.label.toLowerCase()}: ${material.title}`
          : `${style.label}: ${material.title}. Sign in to view this material.`
      }
      className={`group text-left rounded-[28px] lg:rounded-[32px] bg-white overflow-hidden flex flex-col hover:shadow-[0_20px_40px_-20px_rgba(30,27,75,0.35)] hover:-translate-y-1 transition-all ${focusRing}`}
    >
      <div className={`relative h-[180px] w-full flex items-center justify-center ${style.tile}`}>
        {cover ? (
          <img
            src={cover}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <TypeIcon className={`w-14 h-14 ${style.ink}`} strokeWidth={1.6} aria-hidden="true" />
        )}
        <span className={`absolute top-3.5 left-3.5 px-3 py-1.5 rounded-full bg-white font-extrabold text-xs ${style.ink}`}>
          {style.label}
        </span>
      </div>

      <div className="px-5 pt-5 pb-5 lg:px-6 flex flex-col gap-2 flex-grow">
        {material.category && <span className="text-[13px] font-semibold text-[#4338CA]">{material.category}</span>}
        <h2 className="m-0 font-bold text-lg leading-[1.3] text-[#1E1B4B] line-clamp-2 group-hover:text-[#4338CA] transition-colors">
          {material.title}
        </h2>
        {description && <p className="m-0 text-sm leading-[1.5] text-[#5B6477] line-clamp-3">{description}</p>}

        <span className="mt-auto pt-2 inline-flex items-center gap-1.5 text-sm font-bold text-[#4338CA]">
          {signedIn ? (
            <>
              Open <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </>
          ) : (
            <>
              <Lock className="w-4 h-4" aria-hidden="true" /> Sign in to view
            </>
          )}
        </span>
      </div>
    </button>
  );
}
