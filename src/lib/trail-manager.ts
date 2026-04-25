// Trail Manager Module
// Manages trail buffers for fencers with ring buffer implementation

import type { Fencer, TrailPoint, TipPosition, TrailConfig } from '../types/fencing';

// Default configuration
export const DEFAULT_TRAIL_CONFIG: TrailConfig = {
  maxLength: 60,
  fadeMode: 'linear',
  glowIntensity: 1.0,
  lineWidth: 3,
};

export class TrailManager {
  private fencers: Map<string, Fencer>;
  private config: TrailConfig;
  private lastTips: Map<string, TipPosition> = new Map();
  private lastDetectionTime: number = 0;

  constructor(config: Partial<TrailConfig> = {}) {
    this.config = { ...DEFAULT_TRAIL_CONFIG, ...config };
    
    // Initialize fencers
    this.fencers = new Map([
      ['A', { 
        id: 'A', 
        side: 'left', 
        color: '#00ff00', // green
        tip: null, 
        trail: [] 
      }],
      ['B', { 
        id: 'B', 
        side: 'right', 
        color: '#ff0000', // red
        tip: null, 
        trail: [] 
      }],
    ]);
  }

  /**
   * Update tip positions from detection
   * Call this when new pose detection results arrive
   */
  updateTips(tips: Map<string, TipPosition>, timestamp: number): void {
    this.lastDetectionTime = timestamp;
    
    tips.forEach((tip, id) => {
      const fencer = this.fencers.get(id);
      if (!fencer) return;

      // Store previous tip for interpolation
      const prevTip = this.lastTips.get(id);
      if (prevTip) {
        tip.prevX = prevTip.x;
        tip.prevY = prevTip.y;
      }
      
      this.lastTips.set(id, tip);
      fencer.tip = tip;

      // Calculate velocity for heatmap mode
      let velocity = 0;
      if (prevTip) {
        const dx = tip.x - prevTip.x;
        const dy = tip.y - prevTip.y;
        const dt = timestamp - prevTip.timestamp;
        velocity = dt > 0 ? Math.sqrt(dx * dx + dy * dy) / dt * 1000 : 0;
      }

      // Add to trail buffer
      fencer.trail.push({
        x: tip.x,
        y: tip.y,
        timestamp,
        velocity,
      });

      // Trim to max length (ring buffer behavior)
      if (fencer.trail.length > this.config.maxLength) {
        fencer.trail.shift();
      }
    });

    // Fade trails for fencers not detected in this frame
    this.fencers.forEach((fencer, id) => {
      if (!tips.has(id)) {
        fencer.tip = null;
        // Optionally fade out trail over time
        // For now, we keep the trail but don't add new points
      }
    });
  }

  /**
   * Get interpolated tip positions for smooth rendering
   * Call this at 60fps to get interpolated positions between detections
   */
  getInterpolatedTips(now: number, detectionInterval: number): Map<string, TipPosition> {
    const interpolated = new Map<string, TipPosition>();
    const t = Math.min(1, Math.max(0, (now - this.lastDetectionTime) / detectionInterval));

    this.lastTips.forEach((tip, id) => {
      if (tip.prevX !== undefined && tip.prevY !== undefined) {
        interpolated.set(id, {
          ...tip,
          x: lerp(tip.prevX, tip.x, t),
          y: lerp(tip.prevY, tip.y, t),
        });
      } else {
        interpolated.set(id, tip);
      }
    });

    return interpolated;
  }

  /**
   * Get all fencer data including trails
   */
  getFencers(): Map<string, Fencer> {
    return this.fencers;
  }

  /**
   * Get trails for rendering
   */
  getTrails(): Map<string, TrailPoint[]> {
    const trails = new Map<string, TrailPoint[]>();
    this.fencers.forEach((fencer, id) => {
      trails.set(id, [...fencer.trail]);
    });
    return trails;
  }

  /**
   * Get current tips
   */
  getTips(): Map<string, TipPosition> {
    const tips = new Map<string, TipPosition>();
    this.fencers.forEach((fencer, id) => {
      if (fencer.tip) {
        tips.set(id, fencer.tip);
      }
    });
    return tips;
  }

  /**
   * Clear all trails
   */
  clear(): void {
    this.fencers.forEach(fencer => {
      fencer.trail = [];
      fencer.tip = null;
    });
    this.lastTips.clear();
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<TrailConfig>): void {
    this.config = { ...this.config, ...config };
    
    // Trim existing trails if maxLength decreased
    this.fencers.forEach(fencer => {
      if (fencer.trail.length > this.config.maxLength) {
        fencer.trail = fencer.trail.slice(-this.config.maxLength);
      }
    });
  }

  /**
   * Get current configuration
   */
  getConfig(): TrailConfig {
    return { ...this.config };
  }
}

/**
 * Linear interpolation between two values
 */
function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}
