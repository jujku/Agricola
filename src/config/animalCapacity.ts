export const animalCapacityRules = {
  house: 1,
  stableWithoutFence: 1,
  pastureBase: 2,
  pastureWithStables: {
    0: 2,
    1: 4,
    2: 8,
    3: 16,
    4: 32,
  },
} as const;
