import { CosmosScene } from "../../components/CosmosScene";
import { Logo } from "../../components/Logo";
import {
  privacyContactEmail,
  privacyPolicySections,
  privacyPolicyUpdatedAt
} from "./privacyPolicyContent";

export function PrivacyPolicyPage() {
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
          <h1>Политика конфиденциальности</h1>
          <p>
            Настоящая Политика конфиденциальности определяет порядок сбора, обработки, хранения и
            защиты персональных данных пользователей интернет-приложение Asteria.
          </p>
          <dl>
            <div>
              <dt>Редакция</dt>
              <dd>{privacyPolicyUpdatedAt}</dd>
            </div>
            <div>
              <dt>Контакты</dt>
              <dd>
                <a href={`mailto:${privacyContactEmail}`}>{privacyContactEmail}</a>
              </dd>
            </div>
          </dl>
        </header>

        <div className="privacy-section-list">
          {privacyPolicySections.map((section) => (
            <section className="privacy-section" key={section.title}>
              <h2>{section.title}</h2>
              {section.blocks.map((block) => {
                if (block.kind === "subheading") {
                  return <h3 key={block.text}>{block.text}</h3>;
                }

                if (block.kind === "list") {
                  return (
                    <ul key={block.items.join("|")}>
                      {block.items.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  );
                }

                return <p key={block.text}>{block.text}</p>;
              })}
            </section>
          ))}
        </div>
      </article>
    </main>
  );
}
