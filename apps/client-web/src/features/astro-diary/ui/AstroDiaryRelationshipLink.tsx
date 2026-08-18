import { Icon } from "@elevenhouse/design-system/icons/Icon";
import { Link } from "react-router";
import { clientAstroDiaryPath } from "../../../router.contract";

export function AstroDiaryRelationshipLink(props: {
  readonly astrologerId: string;
  readonly label: string;
  readonly className?: string;
}) {
  return (
    <Link className={props.className} to={clientAstroDiaryPath(props.astrologerId)}>
      <Icon iconName="orbit" width={15} height={15} aria-hidden="true" />
      {props.label}
    </Link>
  );
}
