import { MotionContent } from "@elevenhouse/design-system/motion";
import { useEffect, useState } from "react";
import { FeatureVisual } from "../../../components/FeatureVisual";
import { Icon } from "../../../components/Icon";
import type { LandingCopy, LandingLanguage } from "../../../content/landingContent";
import { LandingReveal } from "../../../motion/LandingReveal";
import { SectionHead } from "../LandingPage";

type ShowcaseId = LandingCopy["showcase"]["items"][number]["id"];

export function ShowcaseSection({
  copy,
  language
}: {
  readonly copy: LandingCopy["showcase"];
  readonly language: LandingLanguage;
}) {
  const [activeId, setActiveId] = useState<ShowcaseId>("engine");
  const [isUserControlled, setIsUserControlled] = useState(false);
  const showcaseItems = copy.items;

  useEffect(() => {
    if (isUserControlled) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setActiveId((current) => {
        const index = showcaseItems.findIndex((item) => item.id === current);
        return (showcaseItems[(index + 1) % showcaseItems.length] ?? showcaseItems[0]!).id;
      });
    }, 3400);

    return () => window.clearInterval(timer);
  }, [isUserControlled, showcaseItems]);

  const active = showcaseItems.find((item) => item.id === activeId) ?? showcaseItems[0]!;

  return (
    <section className="section" id="showcase">
      <SectionHead kicker={copy.kicker} title={copy.title} />
      <div className="showcase-grid">
        <div className="showcase-tabs">
          {showcaseItems.map((item, index) => (
            <LandingReveal
              as="button"
              className={item.id === activeId ? "l-glass showcase-tab showcase-tab--active" : "l-glass showcase-tab"}
              delay={index + 1}
              key={item.id}
              onClick={() => {
                setIsUserControlled(true);
                setActiveId(item.id);
              }}
              type="button"
              variant="slide"
            >
              <span
                className="showcase-tab__icon"
                style={{
                  background: `linear-gradient(140deg, ${item.colors[0]}, ${item.colors[1]})`
                }}
              >
                <Icon name={item.icon} size={21} />
              </span>
              <span>
                <b>{item.title}</b>
                <em>{item.text}</em>
              </span>
            </LandingReveal>
          ))}
        </div>
        <LandingReveal className="browser-mock" delay={2} variant="lift">
          <div className="browser-mock__top">
            <span />
            <span />
            <span />
            <b>{active.title}</b>
          </div>
          <MotionContent className="panel-swap-motion" transitionKey={`${language}-${active.id}`}>
            <FeatureVisual id={active.id} language={language} />
          </MotionContent>
          <div className="show-caption">
            {copy.captions.map((caption) => (
              <span key={caption}>
                <Icon name="check" size={12} /> {caption}
              </span>
            ))}
          </div>
        </LandingReveal>
      </div>
    </section>
  );
}
