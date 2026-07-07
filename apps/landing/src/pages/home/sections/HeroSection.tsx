import type { ReactNode } from "react";
import { CosmosScene } from "../../../components/CosmosScene";
import { Icon } from "../../../components/Icon";
import type { LandingCopy } from "../../../content/landingContent";

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
        <div className="hero-badge">
          <Icon name="spark" size={14} /> {renderMotionText("hero:badge", copy.badge)}
        </div>
        <h1 className="cos-title">
          {renderMotionText("hero:title:0", copy.title[0])}
          <br />
          {renderMotionText("hero:title:1", copy.title[1])}
        </h1>
        <p>{renderMotionText("hero:subtitle", copy.subtitle)}</p>
        <div className="hero-section__actions">
          <a className="cos-pill cta-button" href={ctaHref}>
            {renderMotionText("hero:cta", ctaLabel)} <Icon name="chevR" size={18} />
          </a>
          <a className="ghost-pill" href="#showcase">
            <Icon name="play" size={16} /> {renderMotionText("hero:demo", copy.demo)}
          </a>
        </div>
        <div className="hero-proof">
          {copy.proof.map((item) => (
            <span key={item}>
              <Icon name="check" size={14} />
              {renderMotionText(`hero:proof:${item}`, item)}
            </span>
          ))}
        </div>
        <div className="hero-stats">
          {copy.stats.map(([value, label]) => (
            <div key={label}>
              <b className="tnum">{value}</b>
              <span>{renderMotionText(`hero:stat:${value}`, label)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
