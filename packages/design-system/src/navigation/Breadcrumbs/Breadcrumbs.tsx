import { classNames } from "../../helpers/classNames.js";
import type { BreadcrumbsItem, BreadcrumbsProps } from "./types.js";

export function Breadcrumbs({
  ariaLabel,
  items,
  currentValue = "step",
  className,
  ...navProps
}: BreadcrumbsProps) {
  return (
    <nav {...navProps} className={classNames("ehBreadcrumbs", className)} aria-label={ariaLabel}>
      <ol className="ehBreadcrumbs__list">
        {items.map((item) => (
          <li className="ehBreadcrumbs__item" key={item.id}>
            {renderBreadcrumbsItem(item, currentValue)}
          </li>
        ))}
      </ol>
    </nav>
  );
}

function renderBreadcrumbsItem(
  item: BreadcrumbsItem,
  currentValue: NonNullable<BreadcrumbsProps["currentValue"]>
) {
  if (item.isCurrent) {
    return (
      <span className="ehBreadcrumbs__current" aria-current={currentValue}>
        {item.label}
      </span>
    );
  }

  if (item.href) {
    return (
      <a className="ehBreadcrumbs__link" href={item.href} onClick={item.onClick}>
        {item.label}
      </a>
    );
  }

  return (
    <button
      className="ehBreadcrumbs__button"
      type="button"
      disabled={item.disabled}
      onClick={item.onClick}
    >
      {item.label}
    </button>
  );
}
