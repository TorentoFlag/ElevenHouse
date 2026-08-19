import type { AstrologerPersonalPageLink } from "../../model/personalPageLink";
import { createPersonalPageIcon } from "../../helpers/navigationDrawerItems";

type AstrologerNavigationDrawerPersonalPageProps = {
  personalPage: AstrologerPersonalPageLink;
};

export function AstrologerNavigationDrawerPersonalPage({
  personalPage
}: AstrologerNavigationDrawerPersonalPageProps) {
  const content = (
    <>
      <span className="astrologerNavigationDrawer__personalPageIcon" aria-hidden="true">
        {createPersonalPageIcon()}
      </span>
      <span className="astrologerNavigationDrawer__personalPageText">
        <span className="astrologerNavigationDrawer__personalPageTitle">{personalPage.title}</span>
        <span className="astrologerNavigationDrawer__personalPageDescription">
          {personalPage.description}
        </span>
      </span>
    </>
  );

  if (!personalPage.href) {
    return (
      <button
        className="astrologerNavigationDrawer__personalPage"
        type="button"
        aria-label={personalPage.ariaLabel}
        data-astrologer-navigation-drawer-personal-page="true"
        disabled
      >
        {content}
      </button>
    );
  }

  return (
    <a
      className="astrologerNavigationDrawer__personalPage"
      href={personalPage.href}
      aria-label={personalPage.ariaLabel}
      data-astrologer-navigation-drawer-personal-page="true"
    >
      {content}
    </a>
  );
}
