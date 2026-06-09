export type TestClock = {
  readonly now: () => Date;
};

export function createTestClock(isoTimestamp: string): TestClock {
  return {
    now: () => new Date(isoTimestamp)
  };
}
