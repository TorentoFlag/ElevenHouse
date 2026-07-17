export function getCompatibilityComparisonSelection(
  currentSelector: string | null,
  comparisonSelector: string,
  collapsedSelector: string
): string {
  return currentSelector === comparisonSelector ? collapsedSelector : comparisonSelector;
}
