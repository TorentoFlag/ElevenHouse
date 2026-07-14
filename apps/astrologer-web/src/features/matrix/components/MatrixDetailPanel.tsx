import type { MatrixInterpretationEntry } from "@elevenhouse/contracts";
import type { MatrixSelection } from "../model/matrixWorkspaceModel";
import styles from "../../../pages/matrix/MatrixPage.module.css";

export function MatrixDetailPanel({
  selection,
  interpretation,
  isLoading
}: {
  readonly selection: MatrixSelection;
  readonly interpretation: MatrixInterpretationEntry | null;
  readonly isLoading: boolean;
}) {
  return (
    <div className={styles.detailPanel}>
      <div className={styles.detailHead}>
        <span>{selection.kicker}</span>
        <div>
          <strong>{selection.arcana}</strong>
          <h2>{selection.label}</h2>
        </div>
        {interpretation ? <p>{interpretation.title}</p> : null}
      </div>
      <div className={styles.detailBody}>
        {isLoading ? (
          <p className={styles.muted}>Загружаем трактовку…</p>
        ) : interpretation ? (
          <>
            <p>{interpretation.constructive}</p>
            <section>
              <h3>Теневая сторона</h3>
              <p>{interpretation.shadow}</p>
            </section>
            <section>
              <h3>Вопросы для размышления</h3>
              <ul>
                {interpretation.reflectionQuestions.map((question) => (
                  <li key={question}>{question}</li>
                ))}
              </ul>
            </section>
            <section>
              <h3>Практические рекомендации</h3>
              <ul>
                {interpretation.practicalRecommendations.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          </>
        ) : (
          <p className={styles.muted}>Трактовка временно недоступна.</p>
        )}
      </div>
    </div>
  );
}
