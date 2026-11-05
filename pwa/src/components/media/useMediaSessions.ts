import { useState, useEffect, useRef, useCallback } from 'react';
import { NowPlayingData, MediaSessionItem, SeekInterval } from './types';

const STORAGE_SEEK_INTERVAL_KEY = 'aerokin_seek_interval';

export interface UseMediaSessionsOptions {
  nowPlaying: NowPlayingData;
  sessions: MediaSessionItem[];
  onSeekTo?: (position: number) => void;
}

export function useMediaSessions({
  nowPlaying,
  sessions,
  onSeekTo,
}: UseMediaSessionsOptions) {
  // 1. Seek Interval Selection (5, 10, 15, 30s)
  const [seekInterval, setSeekIntervalState] = useState<SeekInterval>(() => {
    if (typeof window === 'undefined') return 10;
    try {
      const saved = Number(localStorage.getItem(STORAGE_SEEK_INTERVAL_KEY));
      if ([5, 10, 15, 30].includes(saved)) {
        return saved as SeekInterval;
      }
    } catch {}
    return 10;
  });

  const setSeekInterval = useCallback((val: SeekInterval) => {
    setSeekIntervalState(val);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_SEEK_INTERVAL_KEY, String(val));
    }
  }, []);

  // 2. Active Session Resolution
  const activeSession =
    sessions.find((s) => s.current) ||
    (nowPlaying.id ? sessions.find((s) => s.id === nowPlaying.id) : undefined);

  // 3. Capabilities Model
  const capabilities = activeSession?.capabilities || (nowPlaying as any).capabilities || {
    canPlay: true,
    canPause: true,
    canTogglePlayPause: true,
    canNext: nowPlaying.canNext ?? true,
    canPrev: nowPlaying.canPrev ?? true,
    canSeek: nowPlaying.canSeek ?? false,
    canSetPosition: nowPlaying.canSeek ?? false,
  };

  const duration = nowPlaying.duration ?? 0;
  const canSeek = Boolean(capabilities.canSeek || capabilities.canSetPosition || nowPlaying.canSeek) && duration > 0;
  const canNext = capabilities.canNext ?? true;
  const canPrev = capabilities.canPrev ?? true;

  // 4. Optimistic Timeline Position & Server Reconciliation
  const [scrubPosition, setScrubPosition] = useState<number | null>(null);
  const [optimisticPosition, setOptimisticPosition] = useState<number>(nowPlaying.position ?? 0);
  const lastServerSyncRef = useRef<{ position: number; time: number; title?: string }>({
    position: nowPlaying.position ?? 0,
    time: Date.now(),
    title: nowPlaying.title,
  });

  // Server state sync & drift reconciliation
  useEffect(() => {
    const serverPos = nowPlaying.position ?? 0;
    const isNewTrack = nowPlaying.title !== lastServerSyncRef.current.title;
    const drift = Math.abs(optimisticPosition - serverPos);

    if (isNewTrack || drift > 1.5 || nowPlaying.status !== 'playing') {
      setOptimisticPosition(serverPos);
      lastServerSyncRef.current = {
        position: serverPos,
        time: Date.now(),
        title: nowPlaying.title,
      };
    }
  }, [nowPlaying.position, nowPlaying.title, nowPlaying.status]);

  // Smooth local progression while playing
  useEffect(() => {
    if (nowPlaying.status !== 'playing' || scrubPosition !== null) {
      return;
    }

    const interval = setInterval(() => {
      setOptimisticPosition((prev) => {
        const next = prev + 0.25;
        if (duration > 0 && next > duration) {
          return duration;
        }
        return next;
      });
    }, 250);

    return () => clearInterval(interval);
  }, [nowPlaying.status, scrubPosition, duration]);

  // Commit scrub position
  const handleCommitScrub = useCallback(
    (newPosition: number) => {
      const clamped = Math.max(0, Math.min(duration, newPosition));
      setScrubPosition(null);
      setOptimisticPosition(clamped);
      lastServerSyncRef.current = {
        position: clamped,
        time: Date.now(),
        title: nowPlaying.title,
      };
      onSeekTo?.(clamped);
    },
    [duration, onSeekTo, nowPlaying.title]
  );

  const displayPosition = scrubPosition !== null ? scrubPosition : optimisticPosition;

  return {
    seekInterval,
    setSeekInterval,
    activeSession,
    capabilities,
    canSeek,
    canNext,
    canPrev,
    duration,
    displayPosition,
    scrubPosition,
    setScrubPosition,
    handleCommitScrub,
  };
}
