export const astrologerRouteContract = {
  root: {
    path: "/",
    redirectTo: "/auth",
    replace: true
  },
  auth: "/auth",
  protected: {
    dashboard: "/dashboard",
    calendar: "/calendar",
    clients: "/clients",
    clientDetail: "/clients/:clientUserId",
    finance: "/finance",
    flows: "/flows",
    products: "/products",
    reviews: "/reviews",
    reference: "/reference",
    inbox: "/inbox",
    numerology: "/numerology",
    matrix: "/matrix",
    humanDesign: "/human-design",
    astroCalendar: "/astro-calendar",
    astroDiary: "/astro-diary",
    chartEngine: "/chart-engine",
    session: "/sessions/:sessionId",
    settings: "/settings"
  },
  notFound: "*"
} as const;

export const astrologerRoutePaths = [
  astrologerRouteContract.root.path,
  astrologerRouteContract.auth,
  ...Object.values(astrologerRouteContract.protected),
  astrologerRouteContract.notFound
] as const;
