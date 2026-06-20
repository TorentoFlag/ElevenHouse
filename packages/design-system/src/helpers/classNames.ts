export type ClassNameValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly ClassNameValue[]
  | { readonly [className: string]: boolean | null | undefined };

export function classNames(...values: readonly ClassNameValue[]): string {
  const resolvedClassNames: string[] = [];

  for (const value of values) {
    collectClassNames(value, resolvedClassNames);
  }

  return resolvedClassNames.join(" ");
}

function collectClassNames(value: ClassNameValue, resolvedClassNames: string[]) {
  if (!value) {
    return;
  }

  if (typeof value === "string" || typeof value === "number") {
    resolvedClassNames.push(String(value));
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectClassNames(item, resolvedClassNames);
    }
    return;
  }

  for (const [className, enabled] of Object.entries(value)) {
    if (enabled) {
      resolvedClassNames.push(className);
    }
  }
}
