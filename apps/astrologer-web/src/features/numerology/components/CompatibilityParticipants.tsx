import { formatNullableNumerologyNumber } from "../model/numerologyResultPanelModel";
import type { NumerologyWorkspaceCompatibilityParticipant } from "../model/numerologyWorkspaceModel";
import styles from "./NumerologyComponents.module.css";

export function CompatibilityParticipants({
  participants
}: {
  readonly participants: readonly NumerologyWorkspaceCompatibilityParticipant[];
}) {
  return (
    <aside className={styles.keyRail} aria-label="Участники совместимости">
      {participants.map((participant) => (
        <div className={styles.participantCard} key={participant.displayName}>
          <span className={styles.avatar}>{participant.initials}</span>
          <strong>{participant.displayName}</strong>
          <dl>
            <ParticipantNumber label="Число жизненного пути" value={participant.lifePath} />
            <ParticipantNumber label="Число выражения" value={participant.expression} />
            <ParticipantNumber label="Число души" value={participant.soul} />
            <ParticipantNumber label="Число личности" value={participant.personality} />
            <ParticipantNumber label="Число дня рождения" value={participant.birthday} />
          </dl>
        </div>
      ))}
    </aside>
  );
}

function ParticipantNumber({ label, value }: { readonly label: string; readonly value: number | null }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{formatNullableNumerologyNumber(value)}</dd>
    </div>
  );
}

