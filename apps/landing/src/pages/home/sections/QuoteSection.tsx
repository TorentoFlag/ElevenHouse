import { Avatar } from "../../../components/Avatar";
import { Icon } from "../../../components/Icon";
import type { LandingCopy } from "../../../content/landingContent";
import { SectionHead } from "../LandingPage";

export function QuoteSection({ copy }: { readonly copy: LandingCopy["quotes"] }) {
  return (
    <section className="section section--tight" id="quotes">
      <SectionHead kicker={copy.kicker} title={copy.title} />
      <div className="quote-grid">
        {copy.items.map((quote) => (
          <article className="l-glass quote-card" key={quote.name}>
            <div className="quote-card__stars">
              {Array.from({ length: 5 }, (_, index) => (
                <Icon key={index} name="star" size={13} />
              ))}
              <span style={{ color: quote.color, borderColor: `${quote.color}55`, background: `${quote.color}1a` }}>
                {quote.chip}
              </span>
            </div>
            <p>«{quote.quote}»</p>
            <div className="quote-card__person">
              <Avatar initials={quote.initials} />
              <span>
                <b>{quote.name}</b>
                <em>{quote.role}</em>
              </span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
