import React from 'react';
import { NowPlayingData } from './types';
import { Disc, MusicNotes } from '@phosphor-icons/react';

export interface NowPlayingProps {
  nowPlaying: NowPlayingData;
}

export const NowPlaying: React.FC<NowPlayingProps> = ({ nowPlaying }) => {
  const isPlaying = nowPlaying.status === 'playing';
  const hasTrack = Boolean(nowPlaying.title && nowPlaying.title.trim().length > 0);

  return (
    <div className="w-full rounded-2xl bg-surface border border-border p-4 shadow-sm flex flex-col transition-colors">
      {/* App & Status Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider truncate">
          {nowPlaying.app || 'Windows Media'}
        </span>

        {hasTrack && (
          <div className="flex items-center gap-1.5 shrink-0">
            <span
              className={`w-2 h-2 rounded-full ${
                isPlaying ? 'bg-success animate-pulse' : 'bg-muted-foreground/40'
              }`}
            />
            <span className="text-[10px] uppercase font-mono text-muted-foreground">
              {isPlaying ? 'Playing' : 'Paused'}
            </span>
          </div>
        )}
      </div>

      {/* Media Info or Empty State */}
      {hasTrack ? (
        <div className="flex items-center gap-3.5 my-1">
          {/* Artwork or Fallback Placeholder */}
          <div className="w-14 h-14 rounded-xl bg-raised border border-border/80 flex items-center justify-center shrink-0 overflow-hidden shadow-inner">
            {nowPlaying.art ? (
              <img
                src={nowPlaying.art}
                alt={nowPlaying.title || 'Album artwork'}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-raised to-border text-accent">
                {isPlaying ? (
                  <Disc size={26} className="animate-spin" style={{ animationDuration: '6s' }} />
                ) : (
                  <MusicNotes size={24} />
                )}
              </div>
            )}
          </div>

          {/* Title & Artist */}
          <div className="flex-1 min-w-0 pr-1">
            <h2 className="text-sm font-semibold text-foreground truncate leading-snug">
              {nowPlaying.title}
            </h2>
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {nowPlaying.artist || 'System Media Audio'}
            </p>
          </div>
        </div>
      ) : (
        <div className="py-6 text-center">
          <div className="w-10 h-10 rounded-full bg-raised border border-border mx-auto flex items-center justify-center text-muted-foreground mb-2">
            <MusicNotes size={20} />
          </div>
          <p className="text-sm font-medium text-foreground">Play something on your PC</p>
          <p className="text-xs text-muted-foreground mt-0.5 max-w-xs mx-auto">
            Media sessions from Spotify, YouTube, VLC, and browsers appear here automatically.
          </p>
        </div>
      )}
    </div>
  );
};
