CREATE TABLE site_presence (
  visitor_id TEXT PRIMARY KEY,
  github_id TEXT REFERENCES users(github_id) ON DELETE SET NULL,
  last_seen_at TEXT NOT NULL
);
CREATE INDEX site_presence_by_last_seen ON site_presence(last_seen_at);

CREATE TABLE site_page_views (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  signed_in INTEGER NOT NULL CHECK (signed_in IN (0, 1)),
  visited_at TEXT NOT NULL
);
CREATE INDEX site_page_views_by_time ON site_page_views(visited_at DESC, id DESC);

CREATE TABLE site_daily_traffic (
  day TEXT PRIMARY KEY,
  page_views INTEGER NOT NULL DEFAULT 0
);
CREATE TRIGGER count_site_page_view AFTER INSERT ON site_page_views BEGIN
  INSERT INTO site_daily_traffic(day,page_views)
  VALUES(substr(NEW.visited_at,1,10),1)
  ON CONFLICT(day) DO UPDATE SET page_views=page_views+1;
END;
