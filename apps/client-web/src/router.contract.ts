export const clientRouteContract = {
  home: "/",
  auth: "/auth",
  publicAstrologer: "/a/:handle",
  authenticatedProfile: "/me",
  authenticatedSession: "/sessions/:sessionId",
  notFound: "*"
} as const;

export const clientRoutePaths = Object.values(clientRouteContract);
