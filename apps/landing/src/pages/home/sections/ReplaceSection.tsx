import { Icon } from "../../../components/Icon";
import type { LandingCopy } from "../../../content/landingContent";
import { LandingReveal } from "../../../motion/LandingReveal";
import { SectionHead } from "../LandingPage";

export function ReplaceSection({ copy, ctaHref }: { readonly copy: LandingCopy["replace"]; readonly ctaHref: string }) {
  return (
    <section className="section" id="replace">
      <SectionHead kicker={copy.kicker} title={copy.title} subtitle={copy.subtitle} />
      <div className="replace-grid">
        <LandingReveal className="l-glass replace-card" delay={1} variant="slide">
          <h3>{copy.stackTitle}</h3>
          {copy.stackItems.map(([title, price, icon]) => (
            <div className="replace-row" key={title}>
              <span>
                <Icon name={icon as "orbit"} size={16} />
              </span>
              <b>{title}</b>
              <em>{price}</em>
            </div>
          ))}
          <div className="replace-total">
            <b>{copy.totalLabel}</b>
            <em>{copy.totalValue}</em>
          </div>
          <p>{copy.totalNote}</p>
        </LandingReveal>
        <LandingReveal className="l-glass replace-card replace-card--gold" delay={2} variant="slide">
          <h3>
            <span className="replace-card__brand">
              <Icon name="spark" size={19} />
            </span>
            ElevenHouse
          </h3>
          <div className="replace-included">
            {copy.includedItems.map((item) => (
              <span key={item}>
                <Icon name="check" size={15} />
                {item}
              </span>
            ))}
          </div>
          <div className="replace-price">
            <b>{copy.price}</b>
            <span>{copy.priceNote}</span>
          </div>
          <a className="cos-pill replace-cta" href={ctaHref}>
            {copy.cta} <Icon name="chevR" size={17} />
          </a>
        </LandingReveal>
      </div>
    </section>
  );
}
