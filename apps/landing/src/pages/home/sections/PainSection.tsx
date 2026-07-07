import { Icon } from "../../../components/Icon";
import type { LandingCopy } from "../../../content/landingContent";
import { LandingReveal } from "../../../motion/LandingReveal";
import { SectionHead } from "../LandingPage";

export function PainSection({ copy }: { readonly copy: LandingCopy["pain"] }) {
  return (
    <section className="section section--top" id="pains">
      <SectionHead kicker={copy.kicker} title={copy.title} subtitle={copy.subtitle} />
      <div className="vs-grid">
        <LandingReveal className="l-glass vs-card" delay={1} variant="slide">
          <h3>
            <span className="vs-card__bad">×</span>
            {copy.manualTitle}
          </h3>
          {copy.items.map((row) => (
            <p key={row.problem}>
              <span className="vs-card__bad">×</span>
              {row.problem}
            </p>
          ))}
        </LandingReveal>
        <LandingReveal className="l-glass vs-card vs-card--gold" delay={2} variant="slide">
          <h3>
            <Icon name="spark" size={14} />
            {copy.productTitle}
          </h3>
          {copy.items.map((row) => (
            <p key={row.solution}>
              <Icon name="check" size={15} />
              {row.solution}
            </p>
          ))}
        </LandingReveal>
      </div>
      <div className="results-grid">
        {copy.results.map((item, index) => (
          <LandingReveal className="l-glass result-card" delay={index + 1} key={item.label} variant="scale">
            <b className="tnum" style={{ color: item.color }}>
              {item.value}
            </b>
            <span>{item.label}</span>
          </LandingReveal>
        ))}
      </div>
      <p className="section-note">{copy.note}</p>
    </section>
  );
}
