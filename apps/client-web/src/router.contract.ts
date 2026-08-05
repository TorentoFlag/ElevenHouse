export const clientRouteContract = {
  home: "/",
  auth: "/auth",
  publicAstrologer: "/a/:handle",
  authenticatedProfile: "/me",
  notFound: "*"
} as const;

export const clientRoutePaths = Object.values(clientRouteContract);
