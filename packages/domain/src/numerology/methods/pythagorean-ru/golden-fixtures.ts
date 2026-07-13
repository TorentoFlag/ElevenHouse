export const golubevFixture = {
  participant: { calculationName: "Голубев Антон", birthDate: "2000-08-19" },
  expected: {
    keyNumbers: { lifePath: 2, birthday: 1, expression: 6, soul: 6, personality: 9 },
    workingNumbers: { first: 20, second: 2, third: 18, fourth: 9 },
    cells: {
      "1": "11",
      "2": "222",
      "3": "",
      "4": "",
      "5": "",
      "6": "",
      "7": "",
      "8": "88",
      "9": "99"
    },
    lines: {
      goal: 2,
      family: 5,
      stability: 2,
      self_esteem: 5,
      material: 0,
      talent: 4,
      spirituality: 4,
      temperament: 0
    }
  }
} as const;

export const koshkinaFixture = {
  participant: { calculationName: "Кошкина Яна Владимировна", birthDate: "2002-03-16" },
  expected: {
    keyNumbers: { lifePath: 5, birthday: 7, expression: 7, soul: 9, personality: 7 },
    workingNumbers: { first: 14, second: 5, third: 12, fourth: 3 },
    cells: {
      "1": "111",
      "2": "222",
      "3": "33",
      "4": "4",
      "5": "5",
      "6": "6",
      "7": "",
      "8": "",
      "9": ""
    },
    lines: {
      goal: 4,
      family: 4,
      stability: 3,
      self_esteem: 8,
      material: 3,
      talent: 0,
      spirituality: 4,
      temperament: 3
    }
  }
} as const;

export const compatibilityFixture = {
  pairNumber: 7,
  counts: {
    key_numbers: { match: 0, close: 1, different: 3, tension: 1 },
    psychomatrix: { match: 2, close: 4, different: 3, tension: 0 },
    strength_lines: { match: 1, close: 2, different: 1, tension: 4 },
    total: { match: 3, close: 7, different: 7, tension: 5 }
  },
  conclusion: "mixed"
} as const;
