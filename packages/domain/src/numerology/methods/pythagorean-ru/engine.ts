import type {
  NumerologyMethodEngine,
  NumerologyParticipantInput,
  PythagoreanIndividualResult,
  PythagoreanPeriodsRequest
} from "../../numerology-types";
import { calculateCompatibility } from "./compatibility";
import { calculateNameNumbers } from "./name-numbers";
import { calculatePeriodNumbers } from "./period-numbers";
import { parseIsoDate, sumDigits } from "./profile";
import { calculatePsychomatrix } from "./psychomatrix";
import { reduceScalar } from "./reduction";
import { calculateStrengthLines } from "./strength-lines";

export const pythagoreanRuEngine: NumerologyMethodEngine = {
  methodCode: "pythagorean",
  calculateIndividual: ({ participant, periods }) => calculateIndividual(participant, periods),
  calculateCompatibility: ({ participants, periods }) => {
    const first = calculateIndividual(participants.first, periods);
    const second = calculateIndividual(participants.second, periods);
    return {
      methodCode: "pythagorean",
      mode: "compatibility",
      participants,
      individuals: [first, second],
      ...calculateCompatibility(first, second)
    };
  }
};

function calculateIndividual(
  participant: NumerologyParticipantInput,
  periods: PythagoreanPeriodsRequest
): PythagoreanIndividualResult {
  const birthDate = parseIsoDate(participant.birthDate, "birthDate");
  const psychomatrix = calculatePsychomatrix(participant.birthDate);
  return {
    methodCode: "pythagorean",
    mode: "individual",
    participant,
    keyNumbers: {
      lifePath: reduceScalar(
        sumDigits(`${birthDate.dayText}${birthDate.monthText}${birthDate.yearText}`)
      ),
      birthday: reduceScalar(birthDate.day),
      ...calculateNameNumbers(participant.calculationName)
    },
    periods: calculatePeriodNumbers(participant.birthDate, periods),
    psychomatrix,
    strengthLines: calculateStrengthLines(psychomatrix.cells)
  };
}
