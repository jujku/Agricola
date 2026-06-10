export interface ScoringRule {
  id: string;
  ranges: Array<{
    min: number;
    max: number | null;
    points: number;
  }>;
}

export const scoringRules: ScoringRule[] = [
  { id: "fields", ranges: [{ min: 0, max: 1, points: -1 }, { min: 2, max: 2, points: 1 }, { min: 3, max: 3, points: 2 }, { min: 4, max: 4, points: 3 }, { min: 5, max: null, points: 4 }] },
  { id: "pastures", ranges: [{ min: 0, max: 0, points: -1 }, { min: 1, max: 1, points: 1 }, { min: 2, max: 2, points: 2 }, { min: 3, max: 3, points: 3 }, { min: 4, max: null, points: 4 }] },
  { id: "grain", ranges: [{ min: 0, max: 0, points: -1 }, { min: 1, max: 3, points: 1 }, { min: 4, max: 5, points: 2 }, { min: 6, max: 7, points: 3 }, { min: 8, max: null, points: 4 }] },
  { id: "vegetables", ranges: [{ min: 0, max: 0, points: -1 }, { min: 1, max: 1, points: 1 }, { min: 2, max: 2, points: 2 }, { min: 3, max: 3, points: 3 }, { min: 4, max: null, points: 4 }] },
  { id: "sheep", ranges: [{ min: 0, max: 0, points: -1 }, { min: 1, max: 3, points: 1 }, { min: 4, max: 5, points: 2 }, { min: 6, max: 7, points: 3 }, { min: 8, max: null, points: 4 }] },
  { id: "boar", ranges: [{ min: 0, max: 0, points: -1 }, { min: 1, max: 2, points: 1 }, { min: 3, max: 4, points: 2 }, { min: 5, max: 6, points: 3 }, { min: 7, max: null, points: 4 }] },
  { id: "cattle", ranges: [{ min: 0, max: 0, points: -1 }, { min: 1, max: 1, points: 1 }, { min: 2, max: 3, points: 2 }, { min: 4, max: 5, points: 3 }, { min: 6, max: null, points: 4 }] },
];

export const harvestRounds = [4, 7, 9, 11, 13, 14];

export const roomPoints = {
  wood: 0,
  clay: 1,
  stone: 2,
} as const;
