const publicPages = new Set(['/', '/about', '/live', '/contributors', '/docs', '/projects/new']);

export function isPublicVisitPath(path: string): boolean {
  return path.length <= 180 &&
    (publicPages.has(path) || /^\/(?:challenges|u|credentials)\/[a-zA-Z0-9_-]+$/.test(path));
}

export interface SiteTrafficOverview {
  registeredUsers: number;
  online: {
    total: number;
    registered: number;
    anonymous: number;
    minutes: number;
  };
  pageViews: {
    total: number;
    last24Hours: number;
  };
  recentVisits: Array<{ id: string; path: string; signedIn: boolean; visitedAt: string }>;
}
