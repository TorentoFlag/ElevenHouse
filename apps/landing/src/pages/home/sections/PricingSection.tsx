import { MotionContent } from "@elevenhouse/design-system/motion";
import { useState } from "react";
import { Icon } from "../../../components/Icon";
import type { LandingCopy } from "../../../content/landingContent";
import { LandingReveal } from "../../../motion/LandingReveal";
import { SectionHead } from "../LandingPage";

export function PricingSection({ copy, ctaHref }: { readonly copy: LandingCopy["pricing"]; readonly ctaHref: string }) {
  const [cycle, setCycle] = useState<"month" | "year">("month");

  return (
    <section className="section" id="pricing">
      <SectionHead kicker={copy.kicker} title={copy.title} subtitle={copy.subtitle} />
      <div className="cycle-switch">
        {copy.cycles.map(([id, label]) => (
          <button
            className={cycle === id ? "cycle-switch__button cycle-switch__button--active" : "cycle-switch__button"}
            key={id}
            onClick={() => setCycle(id as "month" | "year")}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>
      <div className="pricing-grid">
        {copy.plans.map((plan, index) => {
          const price = cycle === "year" && plan.price > 0 ? Math.round(plan.price * 0.8) : plan.price;
          return (
            <LandingReveal
              className={plan.popular ? "l-glass price-card price-card--popular" : "l-glass price-card"}
              delay={index + 1}
              key={plan.id}
              variant={plan.popular ? "scale" : "rise"}
            >
              <span className="price-card__line" style={{ background: `linear-gradient(90deg, ${plan.color}, ${plan.color}66)` }} />
              {plan.popular ? <b className="cos-pill price-card__hit">{copy.hit}</b> : null}
              <span
                className="price-card__planet"
                style={{
                  background: `radial-gradient(circle at 34% 28%, ${plan.color}, ${plan.color}99)`,
                  boxShadow: `0 0 30px -4px ${plan.color}aa`
                }}
              >
                <Icon name={plan.icon} size={24} />
              </span>
              <h3>{plan.name}</h3>
              <p>{plan.tagline}</p>
              <MotionContent className="price-cycle-motion" transitionKey={`${cycle}-${plan.id}-${price}`}>
                <div className="price-card__price">
                  <b className="tnum">{price === 0 ? "0 ₽" : `${price.toLocaleString(copy.locale)} ₽`}</b>
                  {price > 0 ? <span>{copy.perMonth}</span> : null}
                </div>
                <div className="price-card__fee">
                  {copy.fee} {plan.fee}% {cycle === "year" && price > 0 ? <em>{copy.saving}</em> : null}
                </div>
              </MotionContent>
              <div className="price-card__features">
                {plan.features.map((feature) => (
                  <span key={feature}>
                    <Icon name="check" size={14} style={{ color: plan.color }} />
                    {feature}
                  </span>
                ))}
              </div>
              <a className={plan.popular ? "cos-pill price-card__cta" : "price-card__cta price-card__cta--ghost"} href={ctaHref}>
                {plan.price === 0 ? copy.start : `${copy.choose} ${plan.name}`}
              </a>
            </LandingReveal>
          );
        })}
      </div>
      <p className="section-note">{copy.note}</p>
    </section>
  );
}
