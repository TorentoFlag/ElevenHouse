import type { ReactNode } from "react";
import { CosmosScene } from "../../../components/CosmosScene";
import { Icon } from "../../../components/Icon";
import type { LandingCopy } from "../../../content/landingContent";
import { LandingReveal } from "../../../motion/LandingReveal";

export function HeroSection({
  copy,
  ctaHref,
  ctaLabel,
  renderMotionText
}: {
  readonly copy: LandingCopy["hero"];
  readonly ctaHref: string;
  readonly ctaLabel: string;
  readonly renderMotionText: (scope: string, value: string) => ReactNode;
}) {
  return (
    <section className="hero-section" id="hero">
      <CosmosScene />
      <div className="hero-section__content">
        <LandingReveal className="hero-badge" delay={0} variant="fade">
          <Icon name="spark" size={14} /> {renderMotionText("hero:badge", copy.badge)}
        </LandingReveal>
        <LandingReveal as="h1" className="cos-title" delay={1} variant="rise">
          <span className="hero-title-line">{renderMotionText("hero:title:0", copy.title[0])}</span>
          <span className="hero-title-line">{renderMotionText("hero:title:1", copy.title[1])}</span>
        </LandingReveal>
        <LandingReveal as="p" delay={2} variant="rise">
          {renderMotionText("hero:subtitle", copy.subtitle)}
        </LandingReveal>
        <LandingReveal className="hero-section__actions" delay={3} variant="lift">
          <a className="cos-pill cta-button" href={ctaHref}>
            {renderMotionText("hero:cta", ctaLabel)} <Icon name="chevR" size={18} />
          </a>
          <a className="ghost-pill" href="#showcase">
            <Icon name="play" size={16} /> {renderMotionText("hero:demo", copy.demo)}
          </a>
        </LandingReveal>
        <LandingReveal className="hero-proof" delay={4} variant="fade">
          {copy.proof.map((item) => (
            <span key={item}>
              <Icon name="check" size={14} />
              {renderMotionText(`hero:proof:${item}`, item)}
            </span>
          ))}
        </LandingReveal>
        <LandingReveal className="hero-stats" delay={5} variant="scale">
          {copy.stats.map(([value, label]) => (
            <div key={label}>
              <b className="tnum">{value}</b>
              <span>{renderMotionText(`hero:stat:${value}`, label)}</span>
            </div>
          ))}
        </LandingReveal>
      </div>
    </section>
  );
}
