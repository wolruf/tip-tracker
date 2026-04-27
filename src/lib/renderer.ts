// Canvas Renderer Module
// Handles trail rendering and visual effects

import type { TrailPoint, Fencer } from '../types/fencing';

export class TrailRenderer {
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;
  private coordinateMapper: ((normX: number, normY: number) => { x: number; y: number }) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not get 2D context from canvas');
    }
    this.ctx = ctx;
  }

  /**
   * Set the coordinate mapper function to transform normalized video coords to canvas coords
   */
  setCoordinateMapper(mapper: (normX: number, normY: number) => { x: number; y: number }): void {
    this.coordinateMapper = mapper;
  }

  /**
   * Map normalized coordinates to canvas coordinates
   */
  private map(normX: number, normY: number): { x: number; y: number } {
    if (this.coordinateMapper) {
      return this.coordinateMapper(normX, normY);
    }
    // Fallback to direct mapping (canvas represents full video frame)
    return { x: normX * this.canvas.width, y: normY * this.canvas.height };
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
    tension: number = 0.5
  ): { cp1x: number; cp1y: number; cp2x: number; cp2y: number } {
    // Convert normalized coordinates to canvas coordinates using mapper
    const c0 = this.map(p0.x, p0.y);
    const c1 = this.map(p1.x, p1.y);
    const c2 = this.map(p2.x, p2.y);
    const c3 = this.map(p3.x, p3.y);

    // Standard Catmull-Rom to cubic bezier conversion
    // This ensures C1 continuity (smooth tangent) at segment joints
    // cp1 = p1 + (p2 - p0) / 6 * tension
    // cp2 = p2 - (p3 - p1) / 6 * tension
    const cp1x = c1.x + (c2.x - c0.x) / 6 * tension;
    const cp1y = c1.y + (c2.y - c0.y) / 6 * tension;
    const cp2x = c2.x - (c3.x - c1.x) / 6 * tension;
    const cp2y = c2.y - (c3.y - c1.y) / 6 * tension;

    return { cp1x, cp1y, cp2x, cp2y };
  }

  /**
   * Render a single neon trail using cubic splines
   * Draws individual segments for maximum opacity control with depth cues
   */
  private renderNeonTrail(trail: TrailPoint[], color: string): void {
    if (trail.length < 2) return;

    // Get average z depth for this trail (closer = more negative z)
    const avgZ = trail.reduce((sum, p) => sum + p.z, 0) / trail.length;

    // Calculate depth scale factor (closer = larger, further = smaller)
    // z is typically in range [-0.5, 0.5] in MediaPipe
    const depthScale = 1 - avgZ * 1.5; // 1.75 when close (z=-0.5), 0.25 when far (z=0.5)

    // Calculate parallax offset (further objects shift more)
    const parallaxX = avgZ * 40; // pixels
    const parallaxY = avgZ * 25;

    // Pre-calculate all canvas coordinates, control points, and depth properties
    const segments: {
      x1: number; y1: number;
      cp1x: number; cp1y: number;
      cp2x: number; cp2y: number;
      x2: number; y2: number;
      opacity: number;
      depthGlow: number;
      widthScale: number; // Per-segment width scale for perspective effect
    }[] = [];

    for (let i = 0; i < trail.length - 1; i++) {
      const p0 = trail[Math.max(0, i - 1)];
      const p1 = trail[i];
      const p2 = trail[i + 1];
      const p3 = trail[Math.min(trail.length - 1, i + 2)];

      const cp = this.getControlPoints(p0, p1, p2, p3, 1.2);

      const progress = (i + 1) / (trail.length - 1);
      const opacity = smoothstep(0, 1, progress) * p2.opacity;

      // Average z for this segment (closer = more negative)
      const segmentZ = (p1.z + p2.z) / 2;
      
      // Closer segments get more glow (negative z = closer)
      const depthGlow = Math.max(0, -segmentZ * 0.8);
      
      // Per-segment width scale: closer = wider, further = narrower
      // Tuned: 3.75x at close (z=-0.5), 0.2x at far (z=0.5)
      // Linear interpolation: scale = baseWidth - z * perspectiveWidthScale
      const baseWidth = 0.5;
      const perspectiveWidthScale = 5.0;
      const widthScale = Math.max(0.2, baseWidth - segmentZ * perspectiveWidthScale);

      // Map base coordinates using the coordinate mapper
      const c1 = this.map(p1.x, p1.y);
      const c2 = this.map(p2.x, p2.y);

      segments.push({
        x1: c1.x + parallaxX,
        y1: c1.y + parallaxY,
        cp1x: cp.cp1x + parallaxX,
        cp1y: cp.cp1y + parallaxY,
        cp2x: cp.cp2x + parallaxX,
        cp2y: cp.cp2y + parallaxY,
        x2: c2.x + parallaxX,
        y2: c2.y + parallaxY,
        opacity,
        depthGlow,
        widthScale,
      });
    }

    // Draw each segment individually for per-segment width and opacity control
    // Ensure white core always renders for very short trails
    const whiteCoreLength = Math.max(3, Math.min(15, Math.floor(segments.length * 0.5)));

    segments.forEach((seg, i) => {
      // Per-segment width scale for perspective effect
      const segWidthScale = seg.widthScale;
      
      // Depth-adjusted glow: closer segments glow more
      const glowBoost = seg.depthGlow;

      // Base widths scaled by both overall depth and per-segment perspective
      const outer = 24 * depthScale * segWidthScale;
      const middle = 16 * depthScale * segWidthScale;
      const inner = 10 * depthScale * segWidthScale;
      const core = 5 * depthScale * segWidthScale;

      // Multiple thin layers with low opacity for smooth blending
      // Outer glow - very wide, very low opacity, boosted by depth
      this.drawSegment(seg, color, outer, 30 + glowBoost * 20, 0.15 + glowBoost * 0.1);
      // Middle glow
      this.drawSegment(seg, color, middle, 20 + glowBoost * 15, 0.2 + glowBoost * 0.1);
      // Inner glow
      this.drawSegment(seg, color, inner, 10 + glowBoost * 10, 0.25 + glowBoost * 0.1);
      // Core - ensure minimum alpha to prevent black appearance
      this.drawSegment(seg, color, core, 0, Math.max(0.3, 0.5 + glowBoost * 0.2));

      // White core with smooth fade-in - ensure it renders for all segments in short trails
      if (i >= segments.length - whiteCoreLength) {
        const whiteProgress = (i - (segments.length - whiteCoreLength)) / Math.max(1, whiteCoreLength - 1);
        const whiteOpacity = smoothstep(0, 1, whiteProgress);
        this.drawSegment(seg, '#ffffff', 2 * depthScale * segWidthScale, glowBoost * 10, whiteOpacity);
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
    // Skip very transparent segments to avoid black artifacts
    if (alpha <= 0.05) return;

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
   * Render a small dot at the head (latest point) of each trail
   * Size varies with depth for perspective effect
   */
  renderTipDots(fencers: Map<string, Fencer>): void {
    fencers.forEach((fencer) => {
      if (!fencer.tip) return;

      // Apply same parallax offset as the trail rendering
      const avgZ = fencer.tip.z;
      const parallaxX = avgZ * 40;
      const parallaxY = avgZ * 25;

      // Map coordinates using the coordinate mapper
      const mapped = this.map(fencer.tip.x, fencer.tip.y);
      const x = mapped.x + parallaxX;
      const y = mapped.y + parallaxY;

      // Perspective scale for tip dot: closer = larger
      // Same formula as trail segments: 1.975 - z * 3.55
      const widthScale = Math.max(0.2, 1.975 - avgZ * 3.55);

      this.ctx.save();

      // White tip dot - size varies with depth for perspective
      this.ctx.fillStyle = '#ffffff';
      this.ctx.beginPath();
      this.ctx.arc(x, y, 3 * widthScale, 0, Math.PI * 2);
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
  private coordinateMapper: ((normX: number, normY: number) => { x: number; y: number }) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not get 2D context from canvas');
    }
    this.ctx = ctx;
  }

  setCoordinateMapper(mapper: (normX: number, normY: number) => { x: number; y: number }): void {
    this.coordinateMapper = mapper;
  }

  private map(normX: number, normY: number): { x: number; y: number } {
    if (this.coordinateMapper) {
      return this.coordinateMapper(normX, normY);
    }
    return { x: normX * this.canvas.width, y: normY * this.canvas.height };
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
    this.ctx.save();
    this.ctx.fillStyle = color;

    landmarks.forEach((lm) => {
      if (lm.visibility > 0.5) {
        const mapped = this.map(lm.x, lm.y);
        this.ctx.beginPath();
        this.ctx.arc(mapped.x, mapped.y, 4, 0, Math.PI * 2);
        this.ctx.fill();
      }
    });

    this.ctx.restore();
  }

  /**
   * Render skeleton with bones (lines) and joints (outline circles)
   */
  renderSkeleton(landmarks: any[], connections: [number, number][], color: string = '#00ff00'): void {
    this.ctx.save();

    // Helper to check if landmark is valid
    const isValid = (lm: any) => lm && (lm.visibility === undefined || lm.visibility > 0.5);

    // Draw bones (lines)
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = 3;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    connections.forEach(([start, end]) => {
      const startLm = landmarks[start];
      const endLm = landmarks[end];

      if (isValid(startLm) && isValid(endLm)) {
        const startMapped = this.map(startLm.x, startLm.y);
        const endMapped = this.map(endLm.x, endLm.y);
        this.ctx.beginPath();
        this.ctx.moveTo(startMapped.x, startMapped.y);
        this.ctx.lineTo(endMapped.x, endMapped.y);
        this.ctx.stroke();
      }
    });

    // Draw joints (outline circles) at each connected landmark
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = 2;
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'; // Semi-transparent fill

    // Get unique landmark indices from connections
    const uniqueIndices = new Set<number>();
    connections.forEach(([start, end]) => {
      uniqueIndices.add(start);
      uniqueIndices.add(end);
    });

    uniqueIndices.forEach((idx) => {
      const lm = landmarks[idx];
      if (isValid(lm)) {
        const mapped = this.map(lm.x, lm.y);
        this.ctx.beginPath();
        this.ctx.arc(mapped.x, mapped.y, 6, 0, Math.PI * 2);
        this.ctx.fill();
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
    if (wrist.visibility < 0.5 || elbow.visibility < 0.5) return;

    this.ctx.save();

    // Map coordinates
    const elbowMapped = this.map(elbow.x, elbow.y);
    const wristMapped = this.map(wrist.x, wrist.y);
    const tipMapped = this.map(tip.x, tip.y);

    // Elbow to wrist
    this.ctx.strokeStyle = '#ffff00';
    this.ctx.lineWidth = 3;
    this.ctx.beginPath();
    this.ctx.moveTo(elbowMapped.x, elbowMapped.y);
    this.ctx.lineTo(wristMapped.x, wristMapped.y);
    this.ctx.stroke();

    // Wrist to tip
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = 3;
    this.ctx.setLineDash([5, 5]);
    this.ctx.beginPath();
    this.ctx.moveTo(wristMapped.x, wristMapped.y);
    this.ctx.lineTo(tipMapped.x, tipMapped.y);
    this.ctx.stroke();

    // Draw tip marker
    this.ctx.setLineDash([]);
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.arc(tipMapped.x, tipMapped.y, 6, 0, Math.PI * 2);
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
    if (wrist.visibility < 0.5) return;

    // Map coordinates
    const wristMapped = this.map(wrist.x, wrist.y);
    const tipMapped = this.map(tip.x, tip.y);

    const wx = wristMapped.x;
    const wy = wristMapped.y;
    const tx = tipMapped.x;
    const ty = tipMapped.y;

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
