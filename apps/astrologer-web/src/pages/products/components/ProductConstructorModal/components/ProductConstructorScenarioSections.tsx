import { Fragment, type ReactNode } from "react";
import {
  getProductTypeDefinition,
  type ProductScenarioSectionId
} from "../../../../../features/products/model/productTypeDefinitions";
import type { ProductConstructorSectionProps } from "../types";
import {
  AccessGrantsSection,
  BasicProductSections,
  ClientDataSection,
  MethodsSection
} from "./sections/BasicProductSections";
import { IncludedItemsSection } from "./sections/IncludedItemsSection";
import { ModifiersSection } from "./sections/ModifiersSection";

export function ProductConstructorScenarioSections(props: ProductConstructorSectionProps) {
  const definition = getProductTypeDefinition(props.draft.type);

  if (definition.mode === "full") {
    return (
      <>
        <BasicProductSections {...props} />
        <MethodsSection {...props} />
        <ClientDataSection {...props} />
        <AccessGrantsSection {...props} />
        <ModifiersSection {...props} />
        <IncludedItemsSection {...props} />
      </>
    );
  }

  return <>{definition.primarySections.map((section) => renderScenarioSection(section, props))}</>;
}

function renderScenarioSection(
  section: ProductScenarioSectionId,
  props: ProductConstructorSectionProps
): ReactNode {
  switch (section) {
    case "media":
      return <BasicProductSections key={section} {...props} visibleSections={["media"]} />;
    case "basics":
      return <BasicProductSections key={section} {...props} visibleSections={["basics"]} />;
    case "format":
      return <BasicProductSections key={section} {...props} visibleSections={["format"]} />;
    case "execution":
      return <BasicProductSections key={section} {...props} visibleSections={["execution"]} />;
    case "payment":
      return <BasicProductSections key={section} {...props} visibleSections={["payment"]} />;
    case "duration":
      return <BasicProductSections key={section} {...props} visibleSections={["duration"]} />;
    case "participants":
      return <BasicProductSections key={section} {...props} visibleSections={["participants"]} />;
    case "consultation":
      return (
        <BasicProductSections
          key={section}
          {...props}
          visibleSections={["format", "execution", "duration", "participants"]}
        />
      );
    case "package":
      return (
        <BasicProductSections
          key={section}
          {...props}
          visibleSections={["format", "execution", "payment", "duration", "participants"]}
          paymentSectionMode="package"
        />
      );
    case "asyncResult":
      return (
        <BasicProductSections
          key={section}
          {...props}
          visibleSections={["format", "execution", "duration"]}
        />
      );
    case "subscription":
      return (
        <BasicProductSections
          key={section}
          {...props}
          visibleSections={["payment"]}
          paymentSectionMode="subscription"
        />
      );
    case "mini":
      return (
        <BasicProductSections
          key={section}
          {...props}
          visibleSections={["format", "execution", "duration"]}
        />
      );
    case "course":
      return (
        <BasicProductSections
          key={section}
          {...props}
          visibleSections={["duration"]}
        />
      );
    case "methods":
      return <MethodsSection key={section} {...props} />;
    case "clientData":
      return <ClientDataSection key={section} {...props} />;
    case "accessGrants":
      return <AccessGrantsSection key={section} {...props} />;
    case "modifiers":
      return <ModifiersSection key={section} {...props} />;
    case "includedItems":
      return <IncludedItemsSection key={section} {...props} />;
    default:
      return <Fragment key={section} />;
  }
}
