import { useEffect, useState } from 'react';
import { Bell, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { adminPost } from '../../lib/retention';
import { useToast } from '../../hooks/use-toast';
import { Card } from '../ui/card';

// PHASE 55: the "Send email notifications" switch (app_settings, one row).
// Off by default. It is read here under the admin-only policy and changed only
// through the server, which also records the change in the Activity Log.
// In-app notifications are created either way.
export default function NotificationSettings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.from('app_settings').select('email_notifications').eq('id', 1).maybeSingle();
      if (cancelled) return;
      if (error) setLoadFailed(true);
      else setEnabled(data?.email_notifications === true);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = async () => {
    if (saving || loadFailed) return;
    const next = !enabled;
    setSaving(true);
    try {
      await adminPost('/api/admin/notification-settings', { emailNotifications: next });
      setEnabled(next);
      toast({
        title: next ? 'Email notifications are on' : 'Email notifications are off',
        description: next
          ? 'Students will be emailed when a new program is published.'
          : 'Notifications are shown inside the app only.',
      });
    } catch (error: any) {
      toast({ title: 'Could not save the setting', description: error?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-6 rounded-[2rem] border-none shadow-sm bg-white space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="m-0 text-base font-extrabold text-slate-800 flex items-center gap-2">
            <Bell className="w-4 h-4 text-indigo-600" aria-hidden="true" />
            Notifications
          </h2>
          <p id="email-notifications-help" className="m-0 mt-1 text-sm text-slate-600 leading-relaxed">
            Send email notifications. When on, students get an email only when a new program is published. Surveys, updates and
            materials are shown inside the app only. In-app notifications are always created.
          </p>
          {loadFailed && (
            <p className="m-0 mt-2 text-sm font-semibold text-rose-600">
              Could not load this setting. No emails are sent until it loads.
            </p>
          )}
        </div>

        {loading ? (
          <Loader2 className="w-5 h-5 animate-spin text-indigo-600 shrink-0 mt-1" aria-label="Loading" />
        ) : (
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label="Send email notifications"
            aria-describedby="email-notifications-help"
            onClick={toggle}
            disabled={saving || loadFailed}
            className={`relative shrink-0 min-h-[44px] w-14 rounded-full transition-colors disabled:opacity-60 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#A5B4FC] ${
              enabled ? 'bg-indigo-600' : 'bg-slate-300'
            }`}
          >
            <span
              aria-hidden="true"
              className={`absolute top-1/2 -translate-y-1/2 left-1 w-8 h-8 rounded-full bg-white shadow transition-transform ${
                enabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        )}
      </div>
      <p className="m-0 text-sm font-semibold text-slate-700" aria-live="polite">
        {loading ? '' : enabled ? 'On: email for new programs.' : 'Off: in-app notifications only.'}
      </p>
    </Card>
  );
}
