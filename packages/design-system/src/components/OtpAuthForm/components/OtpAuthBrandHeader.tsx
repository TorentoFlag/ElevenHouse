import { Icon } from "../../../icons/Icon/index.js";
import { LanguageSwitcher } from "../../LanguageSwitcher/index.js";
import type { OtpAuthLocaleSwitcher } from "../types.js";
import type { OtpAuthMotionTextRenderer } from "./types.js";

export type OtpAuthBrandHeaderProps = {
  readonly brandTitle: string;
  readonly brandAccent: string;
  readonly brandSubtitle: string;
  readonly localeSwitcher?: OtpAuthLocaleSwitcher;
  readonly renderMotionText: OtpAuthMotionTextRenderer;
};

export function OtpAuthBrandHeader({
  brandTitle,
  brandAccent,
  brandSubtitle,
  localeSwitcher,
  renderMotionText
}: OtpAuthBrandHeaderProps) {
  return (
    <div className="ehOtpAuthForm__brandHeader">
      <div
        className="ehOtpAuthForm__brand"
        aria-label={`${brandTitle}${brandAccent} ${brandSubtitle}`}
      >
        <Icon iconName="logoMoon" aria-hidden="true" />
        <span className="ehOtpAuthForm__brandContent">
          <span className="ehOtpAuthForm__brandName">
            {brandTitle}
            <span>{brandAccent}</span>
          </span>
          <span className="ehOtpAuthForm__brandSubtitle">
            {renderMotionText("brandSubtitle", brandSubtitle)}
          </span>
        </span>
      </div>

      {localeSwitcher ? (
        <LanguageSwitcher
          locale={localeSwitcher.locale}
          options={localeSwitcher.options}
          ariaLabel={localeSwitcher.ariaLabel}
          onLocaleChange={localeSwitcher.onLocaleChange}
        />
      ) : null}
    </div>
  );
}
