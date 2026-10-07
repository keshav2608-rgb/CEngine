'use client';

import React, { useMemo, useState } from 'react';
import {
  addDays,
  addHours,
  format,
  nextMonday,
  setHours,
  setMinutes,
  startOfMinute,
  isToday,
  isTomorrow,
} from 'date-fns';
import { Clock } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils';

const MIN_LEAD_MS = 60 * 1000;

function isTooSoon(when: Date) {
  return when.getTime() - Date.now() < MIN_LEAD_MS;
}

function at(day: Date, hour: number, minute = 0) {
  return setMinutes(setHours(startOfMinute(day), hour), minute);
}

/** "Today at 6:00 PM", "Tomorrow at 9:00 AM", "Mon, Oct 13 at 9:00 AM" */
export function formatScheduleTime(date: Date): string {
  const time = format(date, 'h:mm a');
  if (isToday(date)) return `Today at ${time}`;
  if (isTomorrow(date)) return `Tomorrow at ${time}`;
  return `${format(date, 'EEE, MMM d')} at ${time}`;
}

function quickOptions(now: Date): { label: string; date: Date }[] {
  const options: { label: string; date: Date }[] = [];
  const inAnHour = startOfMinute(addHours(now, 1));
  inAnHour.setMinutes(Math.ceil(inAnHour.getMinutes() / 5) * 5);
  options.push({ label: 'In 1 hour', date: inAnHour });
  if (now.getHours() < 17) options.push({ label: 'This evening', date: at(now, 18) });
  else if (now.getHours() < 20) options.push({ label: 'Tonight', date: at(now, 21) });
  options.push({ label: 'Tomorrow morning', date: at(addDays(now, 1), 9) });
  const monday = at(nextMonday(now), 9);
  if (!isTomorrow(monday)) options.push({ label: 'Monday morning', date: monday });
  return options;
}

interface ScheduleDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (date: Date) => Promise<void> | void;
  title?: string;
  confirmLabel?: string;
  initial?: Date;
}

export function ScheduleDialog(props: ScheduleDialogProps) {
  return (
    <Modal
      isOpen={props.isOpen}
      onClose={props.onClose}
      title={props.title || 'Schedule message'}
      description="It will be sent automatically, even if you're offline."
      maxWidth="sm"
    >
      <ScheduleForm {...props} />
    </Modal>
  );
}

/** Mounted only while the dialog is open so the suggested times are fresh. */
function ScheduleForm({ onClose, onConfirm, confirmLabel, initial }: ScheduleDialogProps) {
  const [now] = useState(() => new Date());
  const options = useMemo(() => quickOptions(now), [now]);
  const fallback = initial ?? at(addDays(now, 1), 9);
  const [date, setDate] = useState(format(fallback, 'yyyy-MM-dd'));
  const [time, setTime] = useState(format(fallback, 'HH:mm'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const custom = new Date(`${date}T${time}`);
  const customValid = !Number.isNaN(custom.getTime());
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const confirm = async (when: Date) => {
    if (isTooSoon(when)) {
      setError('Pick a time at least a minute from now.');
      return;
    }
    try {
      setBusy(true);
      setError('');
      await onConfirm(when);
      onClose();
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e?.response?.data?.message || "Couldn't schedule the message. Try again.");
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        {options.map((o) => (
          <button
            key={o.label}
            type="button"
            disabled={busy}
            onClick={() => confirm(o.date)}
            className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-md hover:bg-surface-2 text-left disabled:opacity-50"
          >
            <span className="text-sm text-fg">{o.label}</span>
            <span className="text-[13px] text-muted">{formatScheduleTime(o.date)}</span>
          </button>
        ))}
      </div>

      <div className="pt-3 border-t border-line">
        <p className="text-[13px] font-medium text-fg mb-2">Custom date and time</p>
        <div className="flex gap-2">
          <Input
            type="date"
            value={date}
            min={format(now, 'yyyy-MM-dd')}
            onChange={(e) => setDate(e.target.value)}
            aria-label="Date"
          />
          <Input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            aria-label="Time"
            className="w-32 shrink-0"
          />
        </div>
        <p className="mt-1.5 text-[12px] text-muted flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {customValid ? formatScheduleTime(custom) : 'Choose a date and time'} · {timeZone}
        </p>
      </div>

      {error && (
        <p role="alert" className={cn('text-[13px] text-danger')}>
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={() => customValid && confirm(custom)}
          loading={busy}
          disabled={!customValid}
        >
          {confirmLabel || 'Schedule'}
        </Button>
      </div>
    </div>
  );
}
