export type NumberStepperProps = {
  readonly value: number;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly suffix?: string;
  readonly decrementLabel: string;
  readonly incrementLabel: string;
  readonly className?: string;
  readonly onValueChange: (value: number) => void;
};
