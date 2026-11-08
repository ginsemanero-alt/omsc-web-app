import { buildNoticeSections } from "../../lib/privacyNotice";
import { usePrivacySettings } from "../../hooks/usePrivacySettings";
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
  const settings = usePrivacySettings();
  const sections = buildNoticeSections(settings);
  // Taken from when the retention settings were last saved; not shown until then.
  const lastUpdated = settings?.retention_updated_at
    ? new Date(settings.retention_updated_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : null;

  return (
    <div className="flex flex-col gap-5 font-figtree text-[#1E293B]">
      {sections.map((section, index) => (
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
      {lastUpdated && <p className="m-0 text-xs text-[#64748B]">Last updated: {lastUpdated}</p>}
    </div>
  );
}
