import { Icon } from "../../../components/Icon";
import type { LandingCopy } from "../../../content/landingContent";
import { SectionHead } from "../LandingPage";

export function HowSection({ copy, ctaHref }: { readonly copy: LandingCopy["how"]; readonly ctaHref: string }) {
  return (
    <section className="section" id="how">
      <SectionHead kicker={copy.kicker} title={copy.title} subtitle={copy.subtitle} />
      <div className="orbit-road">
        <svg className="orbit-road__path" viewBox="0 0 1000 120" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="orbit-gradient" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" stopColor="#F4C430" />
              <stop offset="0.4" stopColor="#E59CC4" />
              <stop offset="0.7" stopColor="#B79CFB" />
              <stop offset="1" stopColor="#6FA8FF" />
            </linearGradient>
          </defs>
          <path
            d="M40 80 C 200 10, 300 10, 460 80 S 740 150, 960 50"
            fill="none"
            opacity="0.55"
            stroke="url(#orbit-gradient)"
            strokeDasharray="3 8"
            strokeLinecap="round"
            strokeWidth="2"
          />
        </svg>
        {copy.steps.map((step, index) => (
          <div className="orbit-step" key={step.number} style={{ marginTop: index % 2 ? 56 : 0 }}>
            <div className="orbit-step__planet-wrap">
              <span
                className="orbit-step__planet"
                style={{
                  background: `radial-gradient(circle at 34% 28%, ${step.colors[0]}, ${step.colors[1]})`,
                  boxShadow: `0 0 50px -6px ${step.colors[0]}99, inset -8px -10px 22px rgba(0,0,0,0.28)`
                }}
              >
                <Icon name={step.icon} size={30} />
                <span style={{ borderColor: `${step.colors[0]}88` }} />
              </span>
              <em style={{ color: step.colors[0] }}>{step.glyph}</em>
              <b className="tnum" style={{ color: step.colors[0] }}>
                {step.number}
              </b>
            </div>
            <div className="l-glass orbit-step__card">
              <h3>{step.title}</h3>
              <p>{step.text}</p>
              <span style={{ color: step.colors[0] }}>
                <Icon name="spark" size={11} /> {step.meta}
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className="section-action">
        <a className="cos-pill cta-button" href={ctaHref}>
          {copy.cta} <Icon name="chevR" size={18} />
        </a>
      </div>
    </section>
  );
}
