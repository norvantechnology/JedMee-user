-- SERP v2: PAA, related searches, answer box (from same SerpAPI response)

ALTER TABLE serp_snapshots ADD COLUMN people_also_ask TEXT;
ALTER TABLE serp_snapshots ADD COLUMN related_searches TEXT;
ALTER TABLE serp_snapshots ADD COLUMN answer_box TEXT;
