export const clientRouteContract = {
  home: "/",
  auth: "/auth",
  publicAstrologer: "/a/:handle",
  authenticatedProfile: "/me",
  authenticatedAstroDiary: "/me/astrologers/:astrologerId/journal",
  authenticatedSession: "/sessions/:sessionId",
  notFound: "*"
} as const;

export const clientRoutePaths = Object.values(clientRouteContract);

export function clientAstroDiaryPath(astrologerId: string): string {
  return `/me/astrologers/${encodeURIComponent(astrologerId)}/journal`;
}
