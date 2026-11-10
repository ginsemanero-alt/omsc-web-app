import { ExternalLink } from 'lucide-react';
import { parseYouTubeId, youTubeEmbedUrl, youTubeWatchUrl } from '../../lib/youtube';

interface YouTubeEmbedProps {
  url: string;
  title: string;
  // Translated by the caller where the page is translated (student portal).
  watchLabel?: string;
  className?: string;
}

// A YouTube player with a "Watch on YouTube" button under it, always. When the
// link has no usable video ID, only the button is shown. The button is a plain
// link to YouTube: opening it records nothing; the view was already recorded
// when the preview opened.
export default function YouTubeEmbed({ url, title, watchLabel = 'Watch on YouTube', className = '' }: YouTubeEmbedProps) {
  const id = parseYouTubeId(url);
  const watchUrl = youTubeWatchUrl(url);

  return (
    <div className={`w-full max-w-4xl max-h-full overflow-y-auto flex flex-col items-center gap-3 p-1 ${className}`}>
      {id && (
        <iframe
          src={youTubeEmbedUrl(id)}
          title={title}
          className="w-full aspect-video rounded-2xl shadow-2xl border-none"
          allow="accelerometer; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          loading="lazy"
        />
      )}
      {watchUrl && (
        <a
          href={watchUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 rounded-xl bg-white text-slate-900 font-bold text-sm hover:bg-slate-100 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#A5B4FC]"
        >
          <ExternalLink className="w-4 h-4" aria-hidden="true" />
          {watchLabel}
        </a>
      )}
    </div>
  );
}
