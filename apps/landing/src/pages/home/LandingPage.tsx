import { LanguageSwitcher } from "@elevenhouse/design-system/components/LanguageSwitcher";
import { MotionContent, MotionText } from "@elevenhouse/design-system/motion";
import { useMemo, useState, type ReactNode } from "react";
import { CosmosScene } from "../../components/CosmosScene";
import { Logo } from "../../components/Logo";
import {
  landingCopy,
  landingLanguages,
  loginHref,
  primaryCtaHref,
  type LandingCopy,
  type LandingLanguage
} from "../../content/landingContent";
import { FeatureSection } from "./sections/FeatureSection";
import { FooterSection } from "./sections/FooterSection";
import { HeroSection } from "./sections/HeroSection";
import { HowSection } from "./sections/HowSection";
import { PainSection } from "./sections/PainSection";
import { PricingSection } from "./sections/PricingSection";
import { QuoteSection } from "./sections/QuoteSection";
import { ReplaceSection } from "./sections/ReplaceSection";
import { ShowcaseSection } from "./sections/ShowcaseSection";

const languageOptions = [
  { locale: "ru", label: "Русский", shortLabel: "RU" },
  { locale: "en", label: "English", shortLabel: "EN" }
] as const;

function isLandingLanguage(locale: string): locale is LandingLanguage {
  return landingLanguages.includes(locale as LandingLanguage);
}

export function LandingPage() {
  const [legal, setLegal] = useState<string | null>(null);
  const [language, setLanguage] = useState<LandingLanguage>("ru");
  const copy = landingCopy[language];
  const cta = useMemo(
    () => ({
      loginHref,
      primaryHref: primaryCtaHref
    }),
    []
  );
  const renderMotionText = (scope: string, value: string): ReactNode => (
    <MotionText transitionKey={`${language}:${scope}:${value}`}>{value}</MotionText>
  );

  return (
    <main className="cos-page" id="top">
      <div className="cos-page__ambient">
        <CosmosScene ambient />
      </div>
      <header className="landing-nav">
        <Logo sub={renderMotionText("logoSub", copy.logoSub)} />
        <nav aria-label={copy.navAria}>
          {copy.navLinks.map((link) => (
            <a className="cos-navlink" href={link.href} key={link.href}>
              {renderMotionText(`nav:${link.href}`, link.label)}
            </a>
          ))}
        </nav>
        <LanguageSwitcher
          ariaLabel={copy.languageAria}
          className="lang-toggle"
          locale={language}
          onLocaleChange={(nextLocale) => {
            if (isLandingLanguage(nextLocale)) {
              setLanguage(nextLocale);
            }
          }}
          options={languageOptions}
        />
        <a className="landing-nav__login" href={cta.loginHref}>
          {renderMotionText("auth:login", copy.auth.login)}
        </a>
        <a className="cos-pill landing-nav__cta" href={cta.primaryHref}>
          {renderMotionText("auth:startFree", copy.auth.startFree)}
        </a>
      </header>
      <MotionContent className="landing-language-motion" transitionKey={language}>
        <HeroSection
          copy={copy.hero}
          ctaHref={cta.primaryHref}
          ctaLabel={copy.auth.startFree}
          renderMotionText={renderMotionText}
        />
        <PainSection copy={copy.pain} />
        <ShowcaseSection copy={copy.showcase} language={language} />
        <FeatureSection copy={copy.features} language={language} />
        <ReplaceSection copy={copy.replace} ctaHref={cta.primaryHref} />
        <HowSection copy={copy.how} ctaHref={cta.primaryHref} />
        <PricingSection copy={copy.pricing} ctaHref={cta.primaryHref} />
        <QuoteSection copy={copy.quotes} />
        <FaqSection copy={copy.faq} />
        <FinalCta copy={copy.finalCta} ctaHref={cta.primaryHref} />
        <FooterSection copy={copy.footer} legalCopy={copy.legal} logoSub={copy.logoSub} onOpenLegal={setLegal} ctaHref={cta.primaryHref} />
      </MotionContent>
      {legal ? <LegalModal copy={copy.legal} kind={legal} onClose={() => setLegal(null)} /> : null}
    </main>
  );
}

function FaqSection({ copy }: { readonly copy: LandingCopy["faq"] }) {
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <section className="section section--tight" id="faq">
      <SectionHead kicker={copy.kicker} title={copy.title} />
      <div className="faq-list">
        {copy.items.map((item, index) => {
          const isOpen = openIndex === index;
          return (
            <button
              className={isOpen ? "faq-item faq-item--open" : "faq-item"}
              key={item.question}
              onClick={() => setOpenIndex(isOpen ? -1 : index)}
              type="button"
            >
              <span>{item.question}</span>
              <b>⌄</b>
              <em>{item.answer}</em>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function FinalCta({ copy, ctaHref }: { readonly copy: LandingCopy["finalCta"]; readonly ctaHref: string }) {
  return (
    <section className="section final-cta" id="final-cta">
      <CosmosScene />
      <div className="final-cta__content">
        <h2 className="cos-title">
          {copy.title[0]}
          <br />
          {copy.title[1]}
        </h2>
        <p>{copy.text}</p>
        <a className="cos-pill cta-button" href={ctaHref}>
          {copy.cta}
        </a>
      </div>
    </section>
  );
}

function LegalModal({ copy, kind, onClose }: { readonly copy: LandingCopy["legal"]; readonly kind: string; readonly onClose: () => void }) {
  const title = kind === "privacy" ? copy.privacy : kind === "offer" ? copy.offer : copy.legal;

  return (
    <div className="legal-modal" role="dialog" aria-modal="true" aria-label={title}>
      <div className="legal-modal__panel">
        <div className="legal-modal__head">
          <b>{title}</b>
          <button type="button" onClick={onClose} aria-label={copy.close}>
            ×
          </button>
        </div>
        <div className="legal-modal__body">
          <h3>{copy.title}</h3>
          <p>{copy.text}</p>
          <p>{copy.contacts}</p>
        </div>
        <button className="cos-pill legal-modal__close" type="button" onClick={onClose}>
          {copy.confirm}
        </button>
      </div>
    </div>
  );
}

export function SectionHead({
  kicker,
  title,
  subtitle
}: {
  readonly kicker: string;
  readonly title: string;
  readonly subtitle?: string;
}) {
  return (
    <div className="section-head">
      <span className="l-kick">{kicker}</span>
      <h2 className="cos-h2">{title}</h2>
      {subtitle ? <p>{subtitle}</p> : null}
    </div>
  );
}
