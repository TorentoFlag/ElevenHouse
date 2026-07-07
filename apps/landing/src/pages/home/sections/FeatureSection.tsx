import { useEffect, useState } from "react";
import { FeatureVisual } from "../../../components/FeatureVisual";
import { Icon } from "../../../components/Icon";
import type { LandingCopy, LandingLanguage } from "../../../content/landingContent";
import { SectionHead } from "../LandingPage";

export function FeatureSection({ copy, language }: { readonly copy: LandingCopy["features"]; readonly language: LandingLanguage }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const features = copy.items;
  const active = features[activeIndex] ?? features[0]!;

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % features.length);
    }, 4200);

    return () => window.clearInterval(timer);
  }, [features.length]);

  return (
    <section className="section" id="features">
      <SectionHead kicker={copy.kicker} title={copy.title} />
      <div className="feature-pills">
        {features.map((item, index) => (
          <button
            className={index === activeIndex ? "feature-pill feature-pill--active" : "feature-pill"}
            key={item.title}
            onClick={() => setActiveIndex(index)}
            style={
              index === activeIndex
                ? {
                    background: `linear-gradient(120deg, ${item.colors[0]}, ${item.colors[1]})`
                  }
                : undefined
            }
            type="button"
          >
            <Icon name={item.icon} size={15} />
            {item.title}
          </button>
        ))}
      </div>
      <div className="l-glass feature-panel">
        <div className="feature-panel__copy">
          <div className="feature-panel__head">
            <span
              style={{
                background: `linear-gradient(140deg, ${active.colors[0]}, ${active.colors[1]})`,
                boxShadow: `0 10px 30px -6px ${active.colors[0]}77`
              }}
            >
              <Icon name={active.icon} size={30} />
            </span>
            <div>
              <h3>{active.title}</h3>
              <p>{active.subtitle}</p>
            </div>
          </div>
          <div className="feature-panel__points">
            {active.points.map((point) => (
              <span key={point}>
                <Icon name="check" size={14} style={{ color: active.colors[0] }} />
                {point}
              </span>
            ))}
          </div>
        </div>
        <div
          className="feature-panel__visual"
          style={{
            background: `radial-gradient(120% 100% at 80% 20%, ${active.colors[0]}33, ${active.colors[1]}22, transparent 75%)`
          }}
        >
          <FeatureVisual
            id={active.icon === "flow" ? "flows" : active.icon === "users" ? "crm" : active.icon === "chart" ? "analytics" : "engine"}
            language={language}
          />
        </div>
      </div>
    </section>
  );
}
