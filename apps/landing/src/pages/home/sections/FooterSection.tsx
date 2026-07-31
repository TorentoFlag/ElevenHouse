import { Icon } from "../../../components/Icon";
import { Logo } from "../../../components/Logo";
import type { LandingCopy } from "../../../content/landingContent";

type FooterSectionProps = {
  readonly ctaHref: string;
  readonly copy: LandingCopy["footer"];
  readonly legalCopy: LandingCopy["legal"];
  readonly logoSub: string;
  readonly onOpenLegal: (kind: string) => void;
};

export function FooterSection({
  copy,
  ctaHref,
  legalCopy,
  logoSub,
  onOpenLegal
}: FooterSectionProps) {
  return (
    <footer className="landing-footer" id="footer">
      <div className="landing-footer__grid">
        <div>
          <Logo sub={logoSub} />
          <p>{copy.tagline}</p>
          <a href="mailto:hello@elevenhouse.ai">
            <Icon name="chat" size={14} /> hello@elevenhouse.ai
          </a>
        </div>
        <div>
          <b>{copy.product}</b>
          <a href="#features">{copy.features}</a>
          <a href="#how">{copy.how}</a>
          <a href="#pricing">{copy.pricing}</a>
          <a href={ctaHref}>{copy.registration}</a>
        </div>
        <div>
          <b>{copy.documents}</b>
          <a href="/privacy">{legalCopy.privacy}</a>
          <a href="/personal-data-processing">{legalCopy.personalDataProcessing}</a>
          <button type="button" onClick={() => onOpenLegal("offer")}>
            {legalCopy.offer}
          </button>
          <button type="button" onClick={() => onOpenLegal("legal")}>
            {legalCopy.legal}
          </button>
        </div>
        <div>
          <b>{copy.contacts}</b>
          <a href="mailto:hello@elevenhouse.ai">hello@elevenhouse.ai</a>
          <a href="mailto:support@elevenhouse.ai">{copy.support}</a>
          <a href="https://t.me/elevenhouse_support">Telegram</a>
        </div>
      </div>
      <div className="landing-footer__bottom">
        <span>© 2026 ElevenHouse</span>
        <span>{copy.legalId}</span>
      </div>
    </footer>
  );
}
