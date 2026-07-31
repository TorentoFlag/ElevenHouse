import { CosmosScene } from "../../components/CosmosScene";
import { Logo } from "../../components/Logo";
import {
  personalDataProcessingContactEmail,
  personalDataProcessingPolicyEn,
  personalDataProcessingPolicyRu,
  personalDataProcessingPolicyVersion
} from "./personalDataProcessingPolicyContent";

export function PersonalDataProcessingPolicyPage() {
  return (
    <main className="cos-page privacy-page">
      <div className="cos-page__ambient">
        <CosmosScene ambient />
      </div>
      <header className="landing-nav privacy-nav">
        <Logo sub="Astrologer workspace" />
        <a className="cos-pill privacy-nav__back" href="/">
          Back to ElevenHouse
        </a>
      </header>
      <article className="privacy-document">
        <header className="privacy-hero">
          <span className="l-kick">сервис ElevenHouse</span>
          <h1>Политика сбора и обработки персональных данных</h1>
          <p>
            Самостоятельная политика ElevenHouse о сборе, обработке, хранении, раскрытии и защите
            персональных данных.
          </p>
          <dl>
            <div>
              <dt>Версия</dt>
              <dd>{personalDataProcessingPolicyVersion}</dd>
            </div>
            <div>
              <dt>Контакты</dt>
              <dd>
                <a href={`mailto:${personalDataProcessingContactEmail}`}>
                  {personalDataProcessingContactEmail}
                </a>
              </dd>
            </div>
          </dl>
        </header>

        <section className="privacy-section privacy-section--text">
          <h2>Русская версия</h2>
          <pre>{personalDataProcessingPolicyRu}</pre>
        </section>
        <section className="privacy-section privacy-section--text">
          <h2>English version</h2>
          <pre lang="en">{personalDataProcessingPolicyEn}</pre>
        </section>
      </article>
    </main>
  );
}
