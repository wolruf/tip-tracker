// Visual Effects System
// Manages triggered animations with finite durations

export interface Effect {
  startTime: number;
  duration: number;
  update(now: number, ctx: CanvasRenderingContext2D, width: number, height: number): boolean;
}

export class EffectManager {
  private effects: Effect[] = [];
  private ctx: CanvasRenderingContext2D;

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }

  /**
   * Add a new effect to the active list
   */
  addEffect(effect: Effect): void {
    this.effects.push(effect);
  }

  /**
   * Update and render all active effects
   * Returns true if any effects are still active
   */
  updateAndRender(now: number, width: number, height: number): boolean {
    // Filter out completed effects
    this.effects = this.effects.filter(effect => {
      const elapsed = now - effect.startTime;
      return elapsed < effect.duration;
    });

    // Update and render remaining effects
    this.effects.forEach(effect => {
      effect.update(now, this.ctx, width, height);
    });

    return this.effects.length > 0;
  }

  /**
   * Clear all effects
   */
  clear(): void {
    this.effects = [];
  }
}

/**
 * Flash effect: full screen flash to white then fade back
 */
export class FlashEffect implements Effect {
  startTime: number;
  duration: number;

  constructor(duration: number = 500) {
    this.startTime = performance.now();
    this.duration = duration;
  }

  update(now: number, ctx: CanvasRenderingContext2D, width: number, height: number): boolean {
    const elapsed = now - this.startTime;
    const progress = elapsed / this.duration;

    if (progress >= 1) return false;

    // Flash curve: instant white, then exponential fade out
    // Use ease-out curve for smooth fade
    const alpha = Math.max(0, 1 - Math.pow(progress, 0.5));

    if (alpha > 0) {
      ctx.save();
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }

    return true;
  }
}

/**
 * Explosion effect: radial burst from a point
 */
export class ExplosionEffect implements Effect {
  startTime: number;
  duration: number;
  x: number;
  y: number;
  color: string;

  constructor(x: number, y: number, color: string = '#ffffff', duration: number = 600) {
    this.startTime = performance.now();
    this.duration = duration;
    this.x = x;
    this.y = y;
    this.color = color;
  }

  update(now: number, ctx: CanvasRenderingContext2D, width: number, height: number): boolean {
    const elapsed = now - this.startTime;
    const progress = elapsed / this.duration;

    if (progress >= 1) return false;

    ctx.save();

    // Expanding ring
    const maxRadius = Math.max(width, height) * 0.3;
    const radius = progress * maxRadius;
    const alpha = 1 - progress;

    // Outer glow ring
    ctx.beginPath();
    ctx.arc(this.x, this.y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 20 * (1 - progress);
    ctx.globalAlpha = alpha * 0.5;
    ctx.stroke();

    // Inner bright core
    ctx.beginPath();
    ctx.arc(this.x, this.y, radius * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = alpha * 0.8;
    ctx.fill();

    ctx.restore();

    return true;
  }
}
