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
   * Render a single neon trail
   */
  private renderNeonTrail(trail: TrailPoint[], color: string): void {
    if (trail.length < 2) return;

    const width = this.canvas.width;
    const height = this.canvas.height;

    this.ctx.save();

    // Draw outer glow
    this.ctx.shadowBlur = 20;
    this.ctx.shadowColor = color;
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = 6;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    this.ctx.beginPath();
    this.ctx.moveTo(trail[0].x * width, trail[0].y * height);

    for (let i = 1; i < trail.length; i++) {
      this.ctx.lineTo(trail[i].x * width, trail[i].y * height);
    }

    this.ctx.globalAlpha = 0.3;
    this.ctx.stroke();

    // Draw middle glow
    this.ctx.shadowBlur = 10;
    this.ctx.lineWidth = 4;
    this.ctx.globalAlpha = 0.6;
    this.ctx.stroke();

    // Draw core line
    this.ctx.shadowBlur = 0;
    this.ctx.lineWidth = 2;
    this.ctx.globalAlpha = 1.0;
    this.ctx.strokeStyle = '#ffffff';
    this.ctx.stroke();

    this.ctx.restore();
  }

  /**
   * Render current tip positions
   */
  renderTips(fencers: Map<string, Fencer>): void {
    const width = this.canvas.width;
    const height = this.canvas.height;

    fencers.forEach((fencer) => {
      if (!fencer.tip) return;

      const x = fencer.tip.x * width;
      const y = fencer.tip.y * height;

      this.ctx.save();

      // Outer glow
      this.ctx.shadowBlur = 15;
      this.ctx.shadowColor = fencer.color;
      this.ctx.fillStyle = fencer.color;

      this.ctx.beginPath();
      this.ctx.arc(x, y, 8, 0, Math.PI * 2);
      this.ctx.fill();

      // Inner core
      this.ctx.shadowBlur = 0;
      this.ctx.fillStyle = '#ffffff';
      this.ctx.beginPath();
      this.ctx.arc(x, y, 4, 0, Math.PI * 2);
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
