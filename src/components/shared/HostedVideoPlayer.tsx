import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { fetchPlaybackUrl } from '../../lib/videoHosting';

interface HostedVideoPlayerProps {
  materialId: number;
  poster?: string | null;
  className?: string;
}

// Plays a video hosted on Cloudinary. The signed link is requested from the
// server when the player opens, so a visitor who is not signed in never gets
// one. preload="metadata" means nothing is downloaded until play is pressed,
// which is what keeps the monthly bandwidth in check.
export default function HostedVideoPlayer({ materialId, poster, className }: HostedVideoPlayerProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const retried = useRef(false);

  useEffect(() => {
    let cancelled = false;
    retried.current = false;
    setUrl(null);
    setError(null);
    fetchPlaybackUrl(materialId)
      .then((link) => !cancelled && setUrl(link))
      .catch((err: Error) => !cancelled && setError(err.message || 'This video could not be loaded.'));
    return () => {
      cancelled = true;
    };
  }, [materialId]);

  // A link that stopped working (the admin rotated it) is asked for once more.
  const handleVideoError = () => {
    if (retried.current) {
      setError('This video could not be played. Please try again later.');
      return;
    }
    retried.current = true;
    fetchPlaybackUrl(materialId, true)
      .then(setUrl)
      .catch((err: Error) => setError(err.message || 'This video could not be played.'));
  };

  if (error) {
    return <p className="px-6 text-center text-sm text-slate-300" role="alert">{error}</p>;
  }
  if (!url) {
    return (
      <div className="flex flex-col items-center gap-3" role="status">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-400" aria-hidden="true" />
        <p className="text-sm text-slate-300">Loading video…</p>
      </div>
    );
  }
  return (
    <video
      src={url}
      poster={poster || undefined}
      controls
      playsInline
      preload="metadata"
      controlsList="nodownload"
      onError={handleVideoError}
      className={className || 'w-full max-h-full max-w-4xl rounded-2xl shadow-2xl'}
    />
  );
}
