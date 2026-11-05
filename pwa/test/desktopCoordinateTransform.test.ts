import { describe, it, expect } from 'vitest';

/**
 * Pure coordinate transform math used by DesktopViewer to map
 * client touch events to normalized (0..1) monitor coordinates.
 */
export function calculateNormalizedMonitorCoords(
  clientX: number,
  clientY: number,
  canvasRect: { left: number; top: number; width: number; height: number },
  dpr: number,
  streamWidth: number,
  streamHeight: number,
  zoom = 1.0,
  pan = { x: 0, y: 0 }
): { x: number; y: number } {
  const cw = Math.round(canvasRect.width * dpr);
  const ch = Math.round(canvasRect.height * dpr);

  const canvasAspect = cw / (ch || 1);
  const streamAspect = streamWidth / (streamHeight || 1);

  let rw = cw;
  let rh = ch;
  let ox = 0;
  let oy = 0;

  if (canvasAspect > streamAspect) {
    // Height-constrained (pillarbox on left/right)
    rh = ch;
    rw = Math.round(ch * streamAspect);
    ox = Math.round((cw - rw) / 2);
    oy = 0;
  } else {
    // Width-constrained (letterbox on top/bottom)
    rw = cw;
    rh = Math.round(cw / streamAspect);
    ox = 0;
    oy = Math.round((ch - rh) / 2);
  }

  const touchX = (clientX - canvasRect.left) * dpr;
  const touchY = (clientY - canvasRect.top) * dpr;

  // Inverse camera transform
  const relX = touchX - (cw / 2 + pan.x * dpr);
  const relY = touchY - (ch / 2 + pan.y * dpr);

  const unscaledX = relX / zoom + cw / 2;
  const unscaledY = relY / zoom + ch / 2;

  const frameX = unscaledX - ox;
  const frameY = unscaledY - oy;

  const normX = Math.max(0, Math.min(1, frameX / rw));
  const normY = Math.max(0, Math.min(1, frameY / rh));

  return { x: normX, y: normY };
}

describe('AEROKIN Desktop Coordinate Transformation & Zoom Inversion', () => {
  it('maps center touch to (0.5, 0.5) on 16:9 stream in 16:9 container at 1x zoom', () => {
    const canvasRect = { left: 0, top: 0, width: 800, height: 450 };
    const dpr = 2; // e.g. Retina display
    const res = calculateNormalizedMonitorCoords(400, 225, canvasRect, dpr, 1920, 1080);
    expect(res.x).toBeCloseTo(0.5, 2);
    expect(res.y).toBeCloseTo(0.5, 2);
  });

  it('correctly accounts for letterboxing when screen is wider than stream (pillarboxed)', () => {
    // Ultra-wide container (2:1 aspect), 16:9 stream (1920x1080)
    // Canvas: 1000px wide, 400px tall. Stream render is 400 * (16/9) = 711.1px wide, centered.
    // OffsetX = (1000 - 711) / 2 = 144.5px
    const canvasRect = { left: 0, top: 0, width: 1000, height: 400 };
    const dpr = 1;

    // Touch at left border of video
    const leftEdge = 144.5;
    const resLeft = calculateNormalizedMonitorCoords(leftEdge, 200, canvasRect, dpr, 1920, 1080);
    expect(resLeft.x).toBeCloseTo(0, 2);
    expect(resLeft.y).toBeCloseTo(0.5, 2);

    // Touch at center
    const resCenter = calculateNormalizedMonitorCoords(500, 200, canvasRect, dpr, 1920, 1080);
    expect(resCenter.x).toBeCloseTo(0.5, 2);
    expect(resCenter.y).toBeCloseTo(0.5, 2);

    // Touch in black pillarbox area (< 144.5px) clamps to 0
    const resOutside = calculateNormalizedMonitorCoords(50, 200, canvasRect, dpr, 1920, 1080);
    expect(resOutside.x).toBe(0);
  });

  it('correctly accounts for letterboxing when screen is taller than stream (portrait phone)', () => {
    // iPhone in portrait: 390px wide, 844px tall. 16:9 stream (1920x1080).
    // RenderWidth = 390. RenderHeight = 390 / (16/9) = 219.375.
    // OffsetY = (844 - 219.375) / 2 = 312.3px
    const canvasRect = { left: 0, top: 0, width: 390, height: 844 };
    const dpr = 3;

    // Center of letterboxed video
    const resCenter = calculateNormalizedMonitorCoords(195, 422, canvasRect, dpr, 1920, 1080);
    expect(resCenter.x).toBeCloseTo(0.5, 2);
    expect(resCenter.y).toBeCloseTo(0.5, 2);

    // Top edge of letterboxed video
    const topVideoEdge = 312.3;
    const resTop = calculateNormalizedMonitorCoords(195, topVideoEdge, canvasRect, dpr, 1920, 1080);
    expect(resTop.x).toBeCloseTo(0.5, 2);
    expect(resTop.y).toBeCloseTo(0, 2);

    // Tapping in top black letterbox bar clamps Y to 0
    const resLetterbox = calculateNormalizedMonitorCoords(195, 100, canvasRect, dpr, 1920, 1080);
    expect(resLetterbox.y).toBe(0);
  });

  it('inverts local zoom and pan correctly', () => {
    // 800x450 canvas, 1920x1080 stream.
    // Zoom = 2x, Pan = 0.
    // Tapping center (400, 225) should still be (0.5, 0.5)
    const canvasRect = { left: 0, top: 0, width: 800, height: 450 };
    const dpr = 1;
    const resCenterZoom = calculateNormalizedMonitorCoords(400, 225, canvasRect, dpr, 1920, 1080, 2.0);
    expect(resCenterZoom.x).toBeCloseTo(0.5, 2);
    expect(resCenterZoom.y).toBeCloseTo(0.5, 2);

    // With 2x zoom, halfway between center and left edge of canvas (200px)
    // Canvas spans [0.25, 0.75], so touch at 200px (halfway to center) represents 0.375
    const resHalfLeft = calculateNormalizedMonitorCoords(200, 225, canvasRect, dpr, 1920, 1080, 2.0);
    expect(resHalfLeft.x).toBeCloseTo(0.375, 2);

    // With 2x zoom and panning right by 100px:
    // (200 - (400 + 100)) / 2 + 400 = -150 + 400 = 250px -> 250 / 800 = 0.3125
    const resPan = calculateNormalizedMonitorCoords(200, 225, canvasRect, dpr, 1920, 1080, 2.0, { x: 100, y: 0 });
    expect(resPan.x).toBeCloseTo(0.3125, 2);
  });
});
