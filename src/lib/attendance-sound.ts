"use client";

// A short, gentle two-tone chime for the attendance countdown's
// "your break has ended" / "please clock out" alerts. Synthesized with
// the Web Audio API rather than shipping an audio file - no asset to
// fetch, no network dependency, and it's trivially themeable (soft sine
// waves, slow fade) without needing an editor. Safe to call from
// anywhere; does nothing if the browser has no AudioContext (SSR,
// very old browsers) or briefly refuses it (autoplay policy before any
// user gesture on the page - clicking a break button earlier in the
// same session already satisfies that).
export function playGentleAlertSound(): void {
  if (typeof window === "undefined") return;
  const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;

  try {
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    // Two soft sine tones in quick succession, each with a gentle
    // attack/decay envelope so neither clicks or startles.
    const tones: { freq: number; start: number; duration: number }[] = [
      { freq: 660, start: 0, duration: 0.5 },
      { freq: 880, start: 0.28, duration: 0.6 },
    ];

    for (const tone of tones) {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = tone.freq;

      const startAt = now + tone.start;
      const endAt = startAt + tone.duration;
      gain.gain.setValueAtTime(0, startAt);
      gain.gain.linearRampToValueAtTime(0.12, startAt + 0.08);
      gain.gain.linearRampToValueAtTime(0, endAt);

      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(startAt);
      oscillator.stop(endAt + 0.05);
    }

    window.setTimeout(() => void ctx.close(), 1200);
  } catch {
    // Autoplay restrictions or an unsupported browser - the visible
    // banner text still carries the alert, so a missed chime here is
    // never the only signal the agent gets.
  }
}

// How often `playAlarmSound` is re-triggered while a start-of-break or
// end-of-break warning is showing and hasn't been acknowledged yet.
export const ALARM_REPEAT_MS = 4000;

// Safety cap: stop repeating the alarm sound after this long even if the
// agent never presses Acknowledge / Stop Alarm - "Continue the alarm
// until the agent acknowledges it, with a maximum duration of 30
// seconds."
export const ALARM_MAX_DURATION_MS = 30000;

// A sharper, more urgent alert than `playGentleAlertSound` above, used
// for the "it's time for your break" / "your break has ended" warnings -
// "Play a clear alarm sound repeatedly ... keep the volume at a safe,
// reasonable level." Three quick square-wave beeps read as noticeably
// more alarm-like than the soft sine chime, while the peak gain (0.2)
// stays only modestly louder than the gentle chime's 0.12, not jarring.
export function playAlarmSound(): void {
  if (typeof window === "undefined") return;
  const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;

  try {
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    const beeps: { freq: number; start: number; duration: number }[] = [
      { freq: 880, start: 0, duration: 0.16 },
      { freq: 880, start: 0.24, duration: 0.16 },
      { freq: 880, start: 0.48, duration: 0.16 },
    ];

    for (const beep of beeps) {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "square";
      oscillator.frequency.value = beep.freq;

      const startAt = now + beep.start;
      const endAt = startAt + beep.duration;
      gain.gain.setValueAtTime(0, startAt);
      gain.gain.linearRampToValueAtTime(0.2, startAt + 0.02);
      gain.gain.linearRampToValueAtTime(0, endAt);

      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(startAt);
      oscillator.stop(endAt + 0.05);
    }

    window.setTimeout(() => void ctx.close(), 900);
  } catch {
    // Autoplay restrictions or an unsupported browser - the on-screen
    // banner still carries the alert, so a missed sound here is never
    // the only signal the agent gets.
  }
}
