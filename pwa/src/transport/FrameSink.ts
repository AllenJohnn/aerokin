import { FrameSink, FrameMeta, FrameSinkStats } from './Connection';

export type DecodedFrame = VideoFrame | ImageBitmap;

export interface CanvasFrameSinkOptions {
  canvas?: HTMLCanvasElement;
  preferredCodec?: 'h264' | 'mjpeg';
  onDecodedFrame?: (frame: DecodedFrame, meta: FrameMeta) => void;
}

export class CanvasFrameSink implements FrameSink {
  private canvas?: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | ImageBitmapRenderingContext | null = null;
  private preferredCodec: 'h264' | 'mjpeg';
  private videoDecoder: VideoDecoder | null = null;
  private statsHandlers = new Set<(stats: FrameSinkStats) => void>();
  private onDecodedFrameCb?: (frame: DecodedFrame, meta: FrameMeta) => void;
  private hasReceivedKeyframe = false;
  private currentPendingMeta: FrameMeta = { sequence: 0, timestampMs: 0 };

  // Metrics
  private frameCount = 0;
  private byteCount = 0;
  private droppedCount = 0;
  private lastStatsReport = performance.now();
  private statsTimer: any = null;

  constructor(options: CanvasFrameSinkOptions) {
    this.canvas = options.canvas;
    this.preferredCodec = options.preferredCodec || 'h264';
    this.onDecodedFrameCb = options.onDecodedFrame;

    if (this.canvas) {
      this.ctx = this.canvas.getContext('2d', { alpha: false });
    }

    if (this.preferredCodec === 'h264' && typeof VideoDecoder !== 'undefined') {
      this.initH264Decoder();
    }

    this.startStatsLoop();
  }

  private initH264Decoder(): void {
    try {
      this.videoDecoder = new VideoDecoder({
        output: (frame: VideoFrame) => {
          if (this.onDecodedFrameCb) {
            this.onDecodedFrameCb(frame, this.currentPendingMeta);
            return;
          }

          if (this.canvas) {
            if (this.canvas.width !== frame.displayWidth || this.canvas.height !== frame.displayHeight) {
              this.canvas.width = frame.displayWidth;
              this.canvas.height = frame.displayHeight;
            }
            if (this.ctx && 'drawImage' in this.ctx) {
              (this.ctx as CanvasRenderingContext2D).drawImage(frame, 0, 0);
            }
          }
          frame.close();
        },
        error: (err: any) => {
          console.warn('[FrameSink] VideoDecoder error, falling back to mjpeg:', err);
          this.videoDecoder = null;
          this.preferredCodec = 'mjpeg';
          this.hasReceivedKeyframe = false;
        },
      });

      // avc1.42001f = H.264 Baseline Profile Level 3.1
      this.videoDecoder.configure({
        codec: 'avc1.42001f',
        optimizeForLatency: true,
      });
      this.hasReceivedKeyframe = false;
    } catch (e) {
      console.warn('[FrameSink] WebCodecs init failed, using mjpeg fallback:', e);
      this.videoDecoder = null;
      this.hasReceivedKeyframe = false;
    }
  }

  public pushFrame(chunk: ArrayBuffer | Uint8Array, metadata?: FrameMeta): void {
    const bytes = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
    this.byteCount += bytes.byteLength;
    this.frameCount++;

    const meta: FrameMeta = metadata || {
      sequence: this.frameCount,
      timestampMs: performance.now(),
      codec: this.preferredCodec,
    };
    this.currentPendingMeta = meta;

    // 1. If H.264 chunk and decoder ready
    if (meta.codec === 'h264' && this.videoDecoder && this.videoDecoder.state === 'configured') {
      // Must wait for first keyframe to initialize decode stream
      if (!this.hasReceivedKeyframe) {
        if (!meta.isKeyframe) {
          this.droppedCount++;
          return;
        }
        this.hasReceivedKeyframe = true;
      }

      try {
        const encodedChunk = new EncodedVideoChunk({
          type: meta.isKeyframe ? 'key' : 'delta',
          timestamp: (meta.timestampMs || performance.now()) * 1000,
          data: bytes,
        });
        this.videoDecoder.decode(encodedChunk);
        return;
      } catch (err) {
        this.droppedCount++;
      }
    }

    // 2. MJPEG / ImageBitmap decode
    if (typeof createImageBitmap !== 'undefined') {
      const blob = new Blob([bytes as BlobPart], { type: 'image/jpeg' });
      createImageBitmap(blob)
        .then((bitmap) => {
          if (this.onDecodedFrameCb) {
            this.onDecodedFrameCb(bitmap, meta);
            return;
          }

          if (this.canvas) {
            if (this.canvas.width !== bitmap.width || this.canvas.height !== bitmap.height) {
              this.canvas.width = bitmap.width;
              this.canvas.height = bitmap.height;
            }
            if (this.ctx && 'drawImage' in this.ctx) {
              (this.ctx as CanvasRenderingContext2D).drawImage(bitmap, 0, 0);
            }
          }
          bitmap.close();
        })
        .catch(() => {
          this.droppedCount++;
        });
    }
  }

  private startStatsLoop(): void {
    this.statsTimer = setInterval(() => {
      const now = performance.now();
      const elapsedSec = (now - this.lastStatsReport) / 1000;
      if (elapsedSec <= 0) return;

      const fps = Math.round((this.frameCount / elapsedSec) * 10) / 10;
      const bitrateKbps = Math.round(((this.byteCount * 8) / elapsedSec / 1024) * 10) / 10;

      const stats: FrameSinkStats = {
        fps,
        bitrateKbps,
        droppedFrames: this.droppedCount,
      };

      for (const h of this.statsHandlers) {
        try {
          h(stats);
        } catch {}
      }

      this.frameCount = 0;
      this.byteCount = 0;
      this.lastStatsReport = now;
    }, 1000);
  }

  public onStats(handler: (stats: FrameSinkStats) => void): () => void {
    this.statsHandlers.add(handler);
    return () => {
      this.statsHandlers.delete(handler);
    };
  }

  public close(): void {
    if (this.statsTimer) {
      clearInterval(this.statsTimer);
      this.statsTimer = null;
    }
    if (this.videoDecoder) {
      try {
        this.videoDecoder.close();
      } catch {}
      this.videoDecoder = null;
    }
  }
}
