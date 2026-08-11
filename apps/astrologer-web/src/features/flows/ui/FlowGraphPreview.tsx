import type { FlowNodeKindV2 } from "@elevenhouse/contracts";
import { Icon } from "@elevenhouse/design-system/icons/Icon";
import { Fragment } from "react";
import { getFlowNodeVisual } from "./flowsVisualModel";

export type FlowGraphPreviewProps = {
  readonly nodeKinds: readonly FlowNodeKindV2[];
  readonly locale: "ru" | "en";
  readonly classNames?: Readonly<Record<"node" | "connector" | "overflow", string>>;
  readonly maxVisibleNodes?: number;
};

export function FlowGraphPreview({
  nodeKinds,
  locale,
  classNames,
  maxVisibleNodes = 7
}: FlowGraphPreviewProps) {
  const visibleNodes = nodeKinds.slice(0, maxVisibleNodes);
  const hiddenCount = nodeKinds.length - visibleNodes.length;

  return (
    <>
      {visibleNodes.map((kind, index) => {
        const visual = getFlowNodeVisual(kind, locale);
        return (
          <Fragment key={`${kind}-${index}`}>
            <span
              className={classNames?.node ?? ""}
              data-tone={visual.tone}
              title={visual.label}
            >
              <Icon iconName={visual.iconName} width={15} height={15} aria-hidden="true" />
            </span>
            {index < visibleNodes.length - 1 ? (
              <i className={classNames?.connector ?? ""} aria-hidden="true" />
            ) : null}
          </Fragment>
        );
      })}
      {hiddenCount > 0 ? (
        <span
          className={`${classNames?.node ?? ""} ${classNames?.overflow ?? ""}`.trim()}
          data-tone="human"
          title={locale === "ru" ? `Ещё узлов: ${hiddenCount}` : `More nodes: ${hiddenCount}`}
        >
          +{hiddenCount}
        </span>
      ) : null}
    </>
  );
}
