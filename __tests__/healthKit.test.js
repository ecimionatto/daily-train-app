import { calculateReadiness } from '../services/healthKit';

describe('calculateReadiness', () => {
  it('returns null when data is null', () => {
    expect(calculateReadiness(null)).toBeNull();
  });

  it('returns baseline 50 when all metrics are missing', () => {
    expect(calculateReadiness({})).toBe(50);
  });

  it('returns high score for excellent metrics', () => {
    const data = { hrv: 85, restingHR: 46, sleepHours: 8.5 };
    const score = calculateReadiness(data);
    expect(score).toBe(100);
  });

  it('returns low score for poor metrics', () => {
    const data = { hrv: 20, restingHR: 70, sleepHours: 5 };
    const score = calculateReadiness(data);
    expect(score).toBe(55);
  });

  it('handles partial data', () => {
    const data = { hrv: 60 };
    const score = calculateReadiness(data);
    expect(score).toBe(75);
  });
});
