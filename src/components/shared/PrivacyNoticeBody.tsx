import { NOTICE_SECTIONS } from "../../lib/privacyNotice";
import { withRaLinks } from "./Ra10173Link";

// The Data Privacy Notice text (src/lib/privacyNotice.ts), rendered the
// same way on the registration consent step, the /privacy page, the
// Privacy Notice modal and the consent screen for existing accounts.

interface Props {
  // Heading level of each section title, so it nests under the page's own
  // heading ("h2" under a page h1, "h3" under a dialog or step heading).
  headingLevel?: "h2" | "h3";
}

export default function PrivacyNoticeBody({ headingLevel = "h2" }: Props) {
  const Heading = headingLevel;

  return (
    <div className="flex flex-col gap-5 font-figtree text-[#1E293B]">
      {NOTICE_SECTIONS.map((section, index) => (
        <section key={section.id} aria-labelledby={`notice-${section.id}`}>
          <Heading
            id={`notice-${section.id}`}
            className="m-0 mb-1.5 font-bold text-[15px] text-[#4338CA]"
          >
            {String(index + 1).padStart(2, "0")}. {withRaLinks(section.title)}
          </Heading>

          {section.items && (
            <ul className="m-0 pl-5 flex flex-col gap-1 text-sm leading-relaxed text-[#334155] list-disc">
              {section.items.map((item) => (
                <li key={item}>{withRaLinks(item)}</li>
              ))}
            </ul>
          )}
          {section.paragraphs?.map((text) => (
            <p key={text} className="m-0 mt-2 first:mt-0 text-sm leading-relaxed text-[#334155]">
              {withRaLinks(text)}
            </p>
          ))}

        </section>
      ))}
    </div>
  );
}
