import { useNavigate } from "react-router";
import type { AppShellNavigationCopy } from "../../../../common/i18n/astrologerCopy";
import { createPersonalPageIcon } from "../../helpers/navigationDrawerItems";

type AstrologerNavigationDrawerPersonalPageProps = {
  personalPage: AppShellNavigationCopy["personalPage"];
};

export function AstrologerNavigationDrawerPersonalPage({
  personalPage
}: AstrologerNavigationDrawerPersonalPageProps) {
  const navigate = useNavigate();

  return (
    <button
      className="astrologerNavigationDrawer__personalPage"
      type="button"
      aria-label={personalPage.ariaLabel}
      data-astrologer-navigation-drawer-personal-page="true"
      onClick={() => navigate(personalPage.href)}
    >
      <span className="astrologerNavigationDrawer__personalPageIcon" aria-hidden="true">
        {createPersonalPageIcon()}
      </span>
      <span className="astrologerNavigationDrawer__personalPageText">
        <span className="astrologerNavigationDrawer__personalPageTitle">
          {personalPage.title}
        </span>
        <span className="astrologerNavigationDrawer__personalPageDescription">
          {personalPage.description}
        </span>
      </span>
    </button>
  );
}
