// Canvas Renderer Module
// Handles trail rendering and visual effects

import type { TrailPoint, TipPosition, Fencer } from '../types/fencing';

export class TrailRenderer {
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not get 2D context from canvas');
    }
    this.ctx = ctx;
  }

  /**
   * Resize canvas to match display size
   */
  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
  }

  /**
   * Clear the canvas
   */
  clear(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * Render trails for all fencers
   */
  renderTrails(fencers: Map<string, Fencer>): void {
    fencers.forEach((fencer) => {
      if (fencer.trail.length >= 2) {
        this.renderNeonTrail(fencer.trail, fencer.color);
      }
    });
  }

  /**
   * Calculate control points for cubic bezier spline
   * Uses standard Catmull-Rom to cubic bezier conversion
   * Ensures C1 continuity (smooth curves) between segments
   */
  private getControlPoints(
    p0: TrailPoint,
    p1: TrailPoint,
    p2: TrailPoint,
    p3: TrailPoint,
    width: number,
    height: number,
    tension: number = 0.5
  ): { cp1x: number; cp1y: number; cp2x: number; cp2y: number } {
    // Convert normalized coordinates to canvas coordinates
    const x0 = p0.x * width, y0 = p0.y * height;
    const x1 = p1.x * width, y1 = p1.y * height;
    const x2 = p2.x * width, y2 = p2.y * height;
    const x3 = p3.x * width, y3 = p3.y * height;

    // Standard Catmull-Rom to cubic bezier conversion
    // This ensures C1 continuity (smooth tangent) at segment joints
    // cp1 = p1 + (p2 - p0) / 6 * tension
    // cp2 = p2 - (p3 - p1) / 6 * tension
    const cp1x = x1 + (x2 - x0) / 6 * tension;
    const cp1y = y1 + (y2 - y0) / 6 * tension;
    const cp2x = x2 - (x3 - x1) / 6 * tension;
    const cp2y = y2 - (y3 - y1) / 6 * tension;

    return { cp1x, cp1y, cp2x, cp2y };
  }

  /**
   * Render a single neon trail using cubic splines
   * Draws individual segments for maximum opacity control
   */
  private renderNeonTrail(trail: TrailPoint[], color: string): void {
    if (trail.length < 2) return;

    const width = this.canvas.width;
    const height = this.canvas.height;

    // Pre-calculate all canvas coordinates, control points, and opacities
    const segments: {
      x1: number; y1: number;
      cp1x: number; cp1y: number;
      cp2x: number; cp2y: number;
      x2: number; y2: number;
      opacity: number;
    }[] = [];

    for (let i = 0; i < trail.length - 1; i++) {
      const p0 = trail[Math.max(0, i - 1)];
      const p1 = trail[i];
      const p2 = trail[i + 1];
      const p3 = trail[Math.min(trail.length - 1, i + 2)];

      const cp = this.getControlPoints(p0, p1, p2, p3, width, height, 1.2);

      const progress = (i + 1) / (trail.length - 1);
      const opacity = smoothstep(0, 1, progress) * p2.opacity;

      segments.push({
        x1: p1.x * width,
        y1: p1.y * height,
        cp1x: cp.cp1x,
        cp1y: cp.cp1y,
        cp2x: cp.cp2x,
        cp2y: cp.cp2y,
        x2: p2.x * width,
        y2: p2.y * height,
        opacity,
      });
    }

    // Draw each segment individually for per-segment opacity control
    const whiteCoreLength = Math.min(15, Math.floor(segments.length * 0.5)); // White core spans up to 15 segments or 50% of trail

    segments.forEach((seg, i) => {
      // Multiple thin layers with low opacity for smooth blending
      // Outer glow - very wide, very low opacity
      this.drawSegment(seg, color, 24, 30, 0.15);
      // Middle glow
      this.drawSegment(seg, color, 16, 20, 0.2);
      // Inner glow
      this.drawSegment(seg, color, 10, 10, 0.25);
      // Core
      this.drawSegment(seg, color, 5, 0, 0.5);

      // White core with smooth fade-in
      if (i >= segments.length - whiteCoreLength) {
        // Calculate fade progress: 0 at start of white section, 1 at tip
        const whiteProgress = (i - (segments.length - whiteCoreLength)) / (whiteCoreLength - 1);
        const whiteOpacity = smoothstep(0, 1, whiteProgress);
        this.drawSegment(seg, '#ffffff', 2, 0, whiteOpacity);
      }
    });
  }

  /**
   * Draw a single curve segment with its own opacity
   */
  private drawSegment(
    seg: {
      x1: number; y1: number;
      cp1x: number; cp1y: number;
      cp2x: number; cp2y: number;
      x2: number; y2: number;
      opacity: number;
    },
    color: string,
    lineWidth: number,
    shadowBlur: number,
    baseAlpha: number
  ): void {
    const alpha = seg.opacity * baseAlpha;
    if (alpha <= 0.01) return;

    this.ctx.save();
    this.ctx.strokeStyle = this.colorWithAlpha(color, alpha);
    this.ctx.lineWidth = lineWidth;
    this.ctx.lineCap = 'butt';
    this.ctx.lineJoin = 'miter';
    this.ctx.shadowBlur = shadowBlur;
    this.ctx.shadowColor = color;

    this.ctx.beginPath();
    this.ctx.moveTo(seg.x1, seg.y1);
    this.ctx.bezierCurveTo(seg.cp1x, seg.cp1y, seg.cp2x, seg.cp2y, seg.x2, seg.y2);
    this.ctx.stroke();
    this.ctx.restore();
  }

  /**
   * Convert color to rgba string with alpha
   */
  private colorWithAlpha(color: string, alpha: number): string {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  /**
   * Render a glowing dot at the head (latest point) of each trail
   */
  renderTipDots(fencers: Map<string, Fencer>): void {
    const width = this.canvas.width;
    const height = this.canvas.height;

    fencers.forEach((fencer) => {
      if (!fencer.tip) return;

      const x = fencer.tip.x * width;
      const y = fencer.tip.y * height;

      this.ctx.save();

      // Outer glow
      this.ctx.shadowBlur = 12;
      this.ctx.shadowColor = fencer.color;
      this.ctx.fillStyle = fencer.color;

      this.ctx.beginPath();
      this.ctx.arc(x, y, 6, 0, Math.PI * 2);
      this.ctx.fill();

      // Inner core with slight glow
      this.ctx.shadowBlur = 6;
      this.ctx.fillStyle = fencer.color;
      this.ctx.beginPath();
      this.ctx.arc(x, y, 4, 0, Math.PI * 2);
      this.ctx.fill();

      // White center
      this.ctx.shadowBlur = 0;
      this.ctx.fillStyle = '#ffffff';
      this.ctx.beginPath();
      this.ctx.arc(x, y, 2, 0, Math.PI * 2);
      this.ctx.fill();

      this.ctx.restore();
    });
  }

  /**
   * Render trails only (black background)
   */
  renderTrailsOnly(fencers: Map<string, Fencer>): void {
    this.ctx.fillStyle = '#000000';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.renderTrails(fencers);
  }
}

/**
 * Smoothstep function for smooth interpolation
 * Returns 0 when x <= edge0, 1 when x >= edge1, smooth transition in between
 */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export class DebugRenderer {
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not get 2D context from canvas');
    }
    this.ctx = ctx;
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
  }

  clear(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * Render pose landmarks as dots
   */
  renderLandmarks(landmarks: any[], color: string = '#00ff00'): void {
    const width = this.canvas.width;
    const height = this.canvas.height;

    this.ctx.save();
    this.ctx.fillStyle = color;

    landmarks.forEach((lm) => {
      if (lm.visibility > 0.5) {
        const x = lm.x * width;
        const y = lm.y * height;
        this.ctx.beginPath();
        this.ctx.arc(x, y, 4, 0, Math.PI * 2);
        this.ctx.fill();
      }
    });

    this.ctx.restore();
  }

  /**
   * Render skeleton connections
   */
  renderSkeleton(landmarks: any[], color: string = '#00ff00'): void {
    const width = this.canvas.width;
    const height = this.canvas.height;

    // Define skeleton connections (pairs of landmark indices)
    const connections: [number, number][] = [
      [11, 12], // shoulders
      [11, 13], [13, 15], // left arm
      [12, 14], [14, 16], // right arm
      [11, 23], [12, 24], // torso
      [23, 24], // hips
    ];

    this.ctx.save();
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = 2;

    connections.forEach(([start, end]) => {
      const startLm = landmarks[start];
      const endLm = landmarks[end];

      if (startLm?.visibility > 0.5 && endLm?.visibility > 0.5) {
        this.ctx.beginPath();
        this.ctx.moveTo(startLm.x * width, startLm.y * height);
        this.ctx.lineTo(endLm.x * width, endLm.y * height);
        this.ctx.stroke();
      }
    });

    this.ctx.restore();
  }

  /**
   * Render forearm vectors (elbow -> wrist -> tip)
   */
  renderVectors(
    wrist: any,
    elbow: any,
    tip: { x: number; y: number },
    color: string = '#00ff00'
  ): void {
    const width = this.canvas.width;
    const height = this.canvas.height;

    if (wrist.visibility < 0.5 || elbow.visibility < 0.5) return;

    this.ctx.save();

    // Elbow to wrist
    this.ctx.strokeStyle = '#ffff00';
    this.ctx.lineWidth = 3;
    this.ctx.beginPath();
    this.ctx.moveTo(elbow.x * width, elbow.y * height);
    this.ctx.lineTo(wrist.x * width, wrist.y * height);
    this.ctx.stroke();

    // Wrist to tip
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = 3;
    this.ctx.setLineDash([5, 5]);
    this.ctx.beginPath();
    this.ctx.moveTo(wrist.x * width, wrist.y * height);
    this.ctx.lineTo(tip.x * width, tip.y * height);
    this.ctx.stroke();

    // Draw tip marker
    this.ctx.setLineDash([]);
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.arc(tip.x * width, tip.y * height, 6, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.restore();
  }

  /**
   * Render lightsaber blade effect (triangle from wrist through tip)
   */
  renderLightsaber(
    wrist: any,
    tip: { x: number; y: number },
    color: string
  ): void {
    const width = this.canvas.width;
    const height = this.canvas.height;

    if (wrist.visibility < 0.5) return;

    const wx = wrist.x * width;
    const wy = wrist.y * height;
    const tx = tip.x * width;
    const ty = tip.y * height;

    // Calculate perpendicular for blade width
    const dx = tx - wx;
    const dy = ty - wy;
    const len = Math.sqrt(dx * dx + dy * dy);
    const perpX = (-dy / len) * 8;
    const perpY = (dx / len) * 8;

    this.ctx.save();

    // Outer glow
    this.ctx.shadowBlur = 30;
    this.ctx.shadowColor = color;
    this.ctx.fillStyle = color;
    this.ctx.globalAlpha = 0.4;

    this.ctx.beginPath();
    this.ctx.moveTo(wx + perpX * 2, wy + perpY * 2);
    this.ctx.lineTo(tx + perpX * 3, ty + perpY * 3);
    this.ctx.lineTo(tx - perpX * 3, ty - perpY * 3);
    this.ctx.lineTo(wx - perpX * 2, wy - perpY * 2);
    this.ctx.closePath();
    this.ctx.fill();

    // Inner blade
    this.ctx.shadowBlur = 10;
    this.ctx.globalAlpha = 0.8;

    this.ctx.beginPath();
    this.ctx.moveTo(wx + perpX, wy + perpY);
    this.ctx.lineTo(tx + perpX * 2, ty + perpY * 2);
    this.ctx.lineTo(tx - perpX * 2, ty - perpY * 2);
    this.ctx.lineTo(wx - perpX, wy - perpY);
    this.ctx.closePath();
    this.ctx.fill();

    // Core (white)
    this.ctx.shadowBlur = 0;
    this.ctx.fillStyle = '#ffffff';
    this.ctx.globalAlpha = 1.0;

    this.ctx.beginPath();
    this.ctx.moveTo(wx + perpX * 0.3, wy + perpY * 0.3);
    this.ctx.lineTo(tx + perpX * 0.5, ty + perpY * 0.5);
    this.ctx.lineTo(tx - perpX * 0.5, ty - perpY * 0.5);
    this.ctx.lineTo(wx - perpX * 0.3, wy - perpY * 0.3);
    this.ctx.closePath();
    this.ctx.fill();

    this.ctx.restore();
  }
}
