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
          <span className="l-kick">Privacy</span>
          <h1>Privacy Policy</h1>
          <p>
            This policy describes how ElevenHouse processes personal data for its websites,
            astrologer workspace, CRM, booking, calculation, payment and messaging features.
          </p>
          <dl>
            <div>
              <dt>Effective date</dt>
              <dd>{privacyPolicyUpdatedAt}</dd>
            </div>
            <div>
              <dt>Privacy contact</dt>
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
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
              {section.bullets ? (
                <ul>
                  {section.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
        </div>
      </article>
    </main>
  );
}
