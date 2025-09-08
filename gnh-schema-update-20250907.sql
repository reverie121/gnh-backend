BEGIN;

-- A. Add copy identity + metadata
ALTER TABLE user_game_collection_items
  ADD COLUMN bgg_collid BIGINT,                -- BGG collection-item id (copy-level)
  ADD COLUMN subtype TEXT,                     -- e.g. boardgame, boardgameexpansion
  ADD COLUMN last_modified_from_bgg TIMESTAMPTZ;

-- B. Full status set the collection endpoint exposes
ALTER TABLE user_game_collection_items
  ADD COLUMN prevowned      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN wanttoplay     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN wanttobuy      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN preordered     BOOLEAN NOT NULL DEFAULT false;

-- C. Optional private fields (only present if you call with showprivate=1)
ALTER TABLE user_game_collection_items
  ADD COLUMN private_comment    TEXT,
  ADD COLUMN wishlist_comment   TEXT,
  ADD COLUMN condition_text     TEXT,
  ADD COLUMN has_parts_text     TEXT,
  ADD COLUMN want_parts_text    TEXT,
  ADD COLUMN acquired_from      TEXT,
  ADD COLUMN inventory_location TEXT,
  ADD COLUMN acquired_date      DATE,
  ADD COLUMN price_paid         NUMERIC(10,2),
  ADD COLUMN price_currency     TEXT;

-- Guard against negative money
ALTER TABLE user_game_collection_items
  ADD CONSTRAINT chk_price_paid_nonneg CHECK (price_paid IS NULL OR price_paid >= 0);

-- D. Relax the old uniqueness and replace it with collid-based identity
ALTER TABLE user_game_collection_items
  DROP CONSTRAINT IF EXISTS unique_bgg_user_game;

-- collid is unique per user; safest composite key:
ALTER TABLE user_game_collection_items
  ADD CONSTRAINT unique_bgg_user_collid UNIQUE (bgg_username, bgg_collid);

-- Keep legacy uniqueness for rows that don't have collid yet (partial unique)
CREATE UNIQUE INDEX IF NOT EXISTS unique_bgg_user_game_when_collid_null
  ON user_game_collection_items (bgg_username, bgg_game_id)
  WHERE bgg_collid IS NULL;

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_user_game ON user_game_collection_items (bgg_username, bgg_game_id);
CREATE INDEX IF NOT EXISTS idx_bgg_collid ON user_game_collection_items (bgg_collid);
CREATE INDEX IF NOT EXISTS idx_collection_last_modified ON user_game_collection_items (last_modified_from_bgg);

-- Enforce valid wishlist priority if present
ALTER TABLE user_game_collection_items
  ADD CONSTRAINT chk_wishlist_priority_range CHECK (wishlist_priority IS NULL OR wishlist_priority BETWEEN 1 AND 5);

-- ===============================
-- E. COLLECTION: per-copy version link & raw capture (version=1)
-- ===============================

ALTER TABLE user_game_collection_items
  ADD COLUMN bgg_version_id BIGINT,            -- boardgameversion id from collection (if provided)
  ADD COLUMN version_name TEXT,
  ADD COLUMN version_year_published SMALLINT,
  ADD COLUMN version_language TEXT,
  ADD COLUMN version_thumbnail_url TEXT,
  ADD COLUMN version_image_url TEXT,
  ADD COLUMN raw_collection_item JSONB;        -- entire parsed item payload for audit/future fields

-- ===============================
-- F. /THING: lightweight additions on bgg_games
-- ===============================

-- Ensure bgg_games can track type/subtype and store the last time we refreshed deep thing data.
ALTER TABLE bgg_games
  ADD COLUMN thing_type TEXT,                  -- 'boardgame', 'boardgameexpansion', etc.
  ADD COLUMN thing_subtype TEXT,               -- if you filter by specific subtype
  ADD COLUMN last_updated_thing_at TIMESTAMPTZ,
  ADD COLUMN names_primary TEXT,               -- convenience (primary name)
  ADD COLUMN names_alternate_count INTEGER,    -- convenience (how many alternate names)
  ADD COLUMN raw_thing JSONB;                  -- entire parsed thing node for audit/fallback

CREATE INDEX IF NOT EXISTS idx_bgg_games_type ON bgg_games (thing_type, thing_subtype);
CREATE INDEX IF NOT EXISTS idx_bgg_games_lastupdated ON bgg_games (last_updated_thing_at);

-- Optional JSONB GIN if you plan to query these
CREATE INDEX IF NOT EXISTS gin_bgg_games_raw_thing ON bgg_games USING GIN (raw_thing);

-- ===============================
-- G. /THING: normalized detail tables (names, links, ranks, stats, polls)
-- ===============================

-- Names (primary + alternates)
CREATE TABLE IF NOT EXISTS bgg_game_names (
  bgg_id          INTEGER NOT NULL REFERENCES bgg_games(bgg_id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  is_primary      BOOLEAN NOT NULL DEFAULT false,
  sort_index      INTEGER,
  UNIQUE (bgg_id, name, is_primary)
);
CREATE INDEX IF NOT EXISTS idx_bgg_game_names_bgg_id ON bgg_game_names (bgg_id);

-- Links (designers, artists, publishers, categories, mechanics, families, expansions, implementations, integrations…)
CREATE TABLE IF NOT EXISTS bgg_game_links (
  bgg_id          INTEGER NOT NULL REFERENCES bgg_games(bgg_id) ON DELETE CASCADE,
  link_type       TEXT NOT NULL,               -- e.g., 'boardgamedesigner','boardgameartist','boardgamecategory','boardgamemechanic','boardgamepublisher','boardgamefamily','boardgameexpansion', etc.
  target_bgg_id   INTEGER,                     -- id attribute on <link>, if present
  value           TEXT,                        -- value attribute (display name)
  UNIQUE (bgg_id, link_type, target_bgg_id)
);
CREATE INDEX IF NOT EXISTS idx_bgg_game_links_type ON bgg_game_links (link_type);
CREATE INDEX IF NOT EXISTS idx_bgg_game_links_target ON bgg_game_links (target_bgg_id);

-- ALSO: dedupe NULL-target rows so plain-text-only links don’t double-insert
CREATE UNIQUE INDEX IF NOT EXISTS uq_bgg_game_links_null_target
  ON bgg_game_links (bgg_id, link_type, value)
  WHERE target_bgg_id IS NULL;

-- Ranks (from statistics->ratings->ranks->rank)
CREATE TABLE IF NOT EXISTS bgg_game_ranks (
  bgg_id          INTEGER NOT NULL REFERENCES bgg_games(bgg_id) ON DELETE CASCADE,
  rank_type       TEXT,                        -- api 'type' attribute (e.g., 'subtype','family')
  name            TEXT,                        -- api 'name' attribute (e.g., 'boardgame', 'familyname')
  friendly_name   TEXT,                        -- api 'friendlyname'
  value           INTEGER,                     -- rank value (NULL if 'Not Ranked')
  bayes_average   NUMERIC(4,2),
  PRIMARY KEY (bgg_id, name)
);
CREATE INDEX IF NOT EXISTS idx_bgg_game_ranks_value ON bgg_game_ranks (value);

-- Statistics (one row per game for the numeric counters)
CREATE TABLE IF NOT EXISTS bgg_game_statistics (
  bgg_id          INTEGER PRIMARY KEY REFERENCES bgg_games(bgg_id) ON DELETE CASCADE,
  users_rated     INTEGER,
  average         NUMERIC(4,2),
  bayes_average   NUMERIC(4,2),
  stddev          NUMERIC(4,2),
  median          NUMERIC(4,2),
  owned           INTEGER,
  trading         INTEGER,
  wanting         INTEGER,
  wishing         INTEGER,
  num_comments    INTEGER,
  num_weights     INTEGER,
  average_weight  NUMERIC(3,2),
  last_updated_at TIMESTAMPTZ
);

-- Polls (store raw poll blocks; flexible enough for suggested_numplayers, suggested_playerage, language_dependency, etc.)
CREATE TABLE IF NOT EXISTS bgg_game_polls (
  bgg_id          INTEGER NOT NULL REFERENCES bgg_games(bgg_id) ON DELETE CASCADE,
  poll_name       TEXT NOT NULL,               -- e.g., 'suggested_numplayers'
  title           TEXT,
  total_votes     INTEGER,
  results         JSONB,                       -- entire <results> subtree so we don't lose detail
  PRIMARY KEY (bgg_id, poll_name)
);
CREATE INDEX IF NOT EXISTS gin_bgg_game_polls_results ON bgg_game_polls USING GIN (results);

-- ===============================
-- H. /THING: versions catalog (via thing?versions=1 and/or collection version=1)
-- ===============================

CREATE TABLE IF NOT EXISTS bgg_versions (
  version_id      BIGINT PRIMARY KEY,          -- id on <item> inside <versions>
  bgg_game_id     INTEGER NOT NULL REFERENCES bgg_games(bgg_id) ON DELETE CASCADE,
  name            TEXT,
  year_published  SMALLINT,
  language        TEXT,                        -- if provided via link/value
  thumbnail_url   TEXT,
  image_url       TEXT,
  links           JSONB,                       -- raw links on the version (publishers, artists, languages, etc.)
  raw_version     JSONB,                       -- full version payload
  last_updated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_bgg_versions_game ON bgg_versions (bgg_game_id);

-- Now that bgg_versions exists, add the FK from collection items
ALTER TABLE user_game_collection_items
  ADD CONSTRAINT fk_collection_version
  FOREIGN KEY (bgg_version_id) REFERENCES bgg_versions(version_id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;

-- ===============================
-- I. /user profile details (if you’re already calling /xmlapi2/user)
-- ===============================

CREATE TABLE IF NOT EXISTS bgg_users (
  bgg_username            VARCHAR(255) PRIMARY KEY,
  firstname               TEXT,
  lastname                TEXT,
  avatarlink              TEXT,
  yearregistered          SMALLINT,
  lastlogin               TIMESTAMPTZ,
  stateorprovince         TEXT,
  country                 TEXT,
  webaddress              TEXT,
  xboxaccount             TEXT,
  wiiaccount              TEXT,
  psnaccount              TEXT,
  battlenetaccount        TEXT,
  steamaccount            TEXT,
  traderating             INTEGER,
  hot10                   JSONB,               -- if requested
  top10                   JSONB,               -- if requested
  buddies                 JSONB,               -- if requested (paged)
  guilds                  JSONB,               -- if requested (paged)
  raw_user                JSONB,               -- entire user payload
  last_updated_profile_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_bgg_users_last_updated ON bgg_users (last_updated_profile_at);

-- If you want a formal FK from bgg_usernames to bgg_users (optional metadata sync marker)
ALTER TABLE bgg_usernames
  ADD COLUMN IF NOT EXISTS profile_last_synced_at TIMESTAMPTZ;

-- ===============================
-- J. Convenience/materialized JSON captures (optional but handy)
-- ===============================

-- Full raw XML-to-JSON blobs let you rehydrate later without more schema churn.
ALTER TABLE bgg_games
  ADD COLUMN IF NOT EXISTS raw_statistics JSONB,      -- just the <statistics> block if you want it separated
  ADD COLUMN IF NOT EXISTS raw_polls JSONB;           -- entire <polls>
CREATE INDEX IF NOT EXISTS gin_bgg_games_raw_statistics ON bgg_games USING GIN (raw_statistics);
CREATE INDEX IF NOT EXISTS gin_bgg_games_raw_polls      ON bgg_games USING GIN (raw_polls);

-- =====================================================================
-- K. Plays: one row per BGG play (play id is globally unique at BGG)
-- =====================================================================
CREATE TABLE IF NOT EXISTS bgg_plays (
  id                BIGSERIAL PRIMARY KEY,
  bgg_play_id       BIGINT NOT NULL,                       -- <play id="...">
  bgg_username      VARCHAR(255) NOT NULL,                 -- owner of the log (from <plays username="..."> context)
  bgg_userid        BIGINT,                                -- <plays userid="...">, if you want to keep it
  play_date         DATE NOT NULL,                         -- <play date="YYYY-MM-DD">
  quantity          INTEGER NOT NULL DEFAULT 1,            -- <play quantity="...">
  length_minutes    INTEGER,                               -- <play length="..."> (minutes)
  incomplete        BOOLEAN NOT NULL DEFAULT FALSE,        -- <play incomplete="0|1">
  now_in_stats      BOOLEAN NOT NULL DEFAULT TRUE,         -- <play nowinstats="0|1">
  location          TEXT,                                  -- <play location="...">
  comments          TEXT,                                  -- <comments>...</comments>
  -- Item (game) played; Plays API has one main <item>, but we keep it on this table for convenience
  item_bgg_id       INTEGER,                               -- <item objectid="...">
  item_name         TEXT,                                  -- <item name="...">
  item_objecttype   TEXT,                                  -- <item objecttype="..."> (typically "thing")
  item_subtypes     TEXT[] NULL,                           -- <item><subtypes><subtype value="..."/></subtypes>
  -- Keep the raw JSON (converted from XML) in case BGG adds fields or you want full fidelity
  raw_payload       JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_bgg_play UNIQUE (bgg_play_id),
  CONSTRAINT fk_plays_username
    FOREIGN KEY (bgg_username) REFERENCES bgg_usernames(bgg_username) ON DELETE CASCADE,
  CONSTRAINT fk_plays_item_bgg
    FOREIGN KEY (item_bgg_id) REFERENCES bgg_games(bgg_id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_bgg_plays_user_date ON bgg_plays (bgg_username, play_date);
CREATE INDEX IF NOT EXISTS idx_bgg_plays_item       ON bgg_plays (item_bgg_id);
CREATE INDEX IF NOT EXISTS idx_bgg_plays_bggid      ON bgg_plays (bgg_play_id);

-- =====================================================================
-- L. Players: one row per participant in a play
-- =====================================================================
CREATE TABLE IF NOT EXISTS bgg_play_players (
  id               BIGSERIAL PRIMARY KEY,
  play_id          BIGINT NOT NULL REFERENCES bgg_plays(id) ON DELETE CASCADE,
  player_username  VARCHAR(255),
  player_userid    BIGINT,
  player_name      TEXT,
  startposition    TEXT,
  color            TEXT,
  score            TEXT,                 -- keep TEXT; values aren’t always purely numeric
  rating           NUMERIC(4,2),
  new_to_game      BOOLEAN,
  win              BOOLEAN,
  raw_player       JSONB
);
CREATE INDEX IF NOT EXISTS idx_play_players_play     ON bgg_play_players (play_id);
CREATE INDEX IF NOT EXISTS idx_play_players_username ON bgg_play_players (player_username);

-- =====================================================================
-- M. Optional: extra items per play (future-proofing for expansions, etc.)
-- =====================================================================
CREATE TABLE IF NOT EXISTS bgg_play_items (
  id              BIGSERIAL PRIMARY KEY,
  play_id         BIGINT NOT NULL REFERENCES bgg_plays(id) ON DELETE CASCADE,
  item_bgg_id     INTEGER,
  item_name       TEXT,
  item_objecttype TEXT,
  item_subtypes   TEXT[],
  is_primary      BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_play_items_play ON bgg_play_items (play_id);
CREATE INDEX IF NOT EXISTS idx_play_items_item ON bgg_play_items (item_bgg_id);

-- =====================================================================
-- N. Sync state for plays
-- =====================================================================
ALTER TABLE bgg_usernames
  ADD COLUMN IF NOT EXISTS last_synced_plays_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_play_import_through_date DATE;

-- =========================================
-- O. /xmlapi2/hot snapshots (by type)
--    <items type="boardgame" date="YYYY-MM-DD"> <item id=... rank=...>...</item>...
-- =========================================
CREATE TABLE IF NOT EXISTS bgg_hot_snapshots (
  id           BIGSERIAL PRIMARY KEY,
  hot_type     TEXT NOT NULL,          -- 'boardgame','boardgamecompany','rpg','rpgissue',...
  source_date  DATE,                   -- items/@date (BGG provides a date here)
  total_items  INTEGER,
  fetched_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw_payload  JSONB                   -- full parsed response for audit/future fields
);

CREATE INDEX IF NOT EXISTS idx_hot_snapshots_type_date
  ON bgg_hot_snapshots (hot_type, COALESCE(source_date, (fetched_at AT TIME ZONE 'UTC')::date));

-- Items within a hot snapshot
CREATE TABLE IF NOT EXISTS bgg_hot_items (
  snapshot_id     BIGINT NOT NULL REFERENCES bgg_hot_snapshots(id) ON DELETE CASCADE,
  rank            INTEGER NOT NULL,     -- <item rank="...">
  bgg_id          INTEGER NOT NULL,     -- <item id="...">
  name            TEXT,                 -- <name value="..."> (if present)
  year_published  SMALLINT,             -- <yearpublished value="..."> (if present)
  thumbnail_url   TEXT,                 -- <thumbnail value="...">
  image_url       TEXT,                 -- rarely present in /hot; keep it for future-proofing
  raw_item        JSONB,                -- full <item> node
  PRIMARY KEY (snapshot_id, rank)
);
CREATE INDEX IF NOT EXISTS idx_hot_items_bgg_id ON bgg_hot_items (bgg_id);
ALTER TABLE bgg_hot_items
  ADD CONSTRAINT uq_hot_items_snapshot_bgg UNIQUE (snapshot_id, bgg_id);

-- Optional JSONB GIN for ad-hoc exploration
CREATE INDEX IF NOT EXISTS gin_hot_items_raw ON bgg_hot_items USING GIN (raw_item);

-- =========================================
-- P. “Top N” snapshots (your getTop100). Many teams build this
--    via ranks/statistics or a curated list. We’ll store what you return.
-- =========================================
CREATE TABLE IF NOT EXISTS bgg_top_snapshots (
  id           BIGSERIAL PRIMARY KEY,
  top_type     TEXT NOT NULL,           -- e.g. 'boardgame', 'boardgameexpansion'
  description  TEXT,                    -- "Top 100 Board Games" (handy for UI)
  total_items  INTEGER,
  fetched_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw_payload  JSONB                    -- full parsed response you used to build the list
);

CREATE INDEX IF NOT EXISTS idx_top_snapshots_type_time
  ON bgg_top_snapshots (top_type, fetched_at DESC);

-- Items within a top snapshot
CREATE TABLE IF NOT EXISTS bgg_top_items (
  snapshot_id     BIGINT NOT NULL REFERENCES bgg_top_snapshots(id) ON DELETE CASCADE,
  rank            INTEGER NOT NULL,     -- position in this snapshot (1..N)
  bgg_id          INTEGER NOT NULL,
  name            TEXT,
  year_published  SMALLINT,
  thumbnail_url   TEXT,
  image_url       TEXT,

  -- If your builder pulled stats/ranks from /thing?stats=1, keep them:
  average         NUMERIC(4,2),         -- ratings->average
  bayes_average   NUMERIC(4,2),         -- ratings->bayesaverage
  users_rated     INTEGER,              -- ratings->usersrated
  bgg_rank_value  INTEGER,              -- ranks->rank(name='boardgame')->@value (often equals rank)
  raw_item        JSONB,                -- full per-item payload you assembled
  PRIMARY KEY (snapshot_id, rank)
);
CREATE INDEX IF NOT EXISTS idx_top_items_bgg_id ON bgg_top_items (bgg_id);
CREATE INDEX IF NOT EXISTS idx_top_items_rank   ON bgg_top_items (snapshot_id, rank);
ALTER TABLE bgg_top_items
  ADD CONSTRAINT uq_top_items_snapshot_bgg UNIQUE (snapshot_id, bgg_id);
  
-- Optional JSONB GIN for digging into raw fields
CREATE INDEX IF NOT EXISTS gin_top_items_raw ON bgg_top_items USING GIN (raw_item);

-- ============================================================
-- Q. /thing?videos=1 (optional but handy)
-- ============================================================
CREATE TABLE IF NOT EXISTS bgg_game_videos (
  video_id     BIGINT PRIMARY KEY,           -- <video id="...">
  bgg_id       INTEGER NOT NULL REFERENCES bgg_games(bgg_id) ON DELETE CASCADE,
  title        TEXT,
  category     TEXT,                         -- e.g., 'review', 'howto'
  language     TEXT,
  link         TEXT,
  username     TEXT,                         -- uploader
  postdate     TIMESTAMPTZ,
  views        INTEGER,
  raw_video    JSONB
);
CREATE INDEX IF NOT EXISTS idx_bgg_game_videos_game ON bgg_game_videos (bgg_id);

-- ============================================================
-- R. /user buddies & guilds + numeric user id
-- ============================================================
ALTER TABLE bgg_users
  ADD COLUMN IF NOT EXISTS bgg_user_id BIGINT UNIQUE;

ALTER TABLE bgg_usernames
  ADD COLUMN IF NOT EXISTS bgg_user_id BIGINT,
  ADD CONSTRAINT fk_usernames_bgg_userid
    FOREIGN KEY (bgg_user_id) REFERENCES bgg_users(bgg_user_id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS bgg_user_buddies (
  bgg_username     VARCHAR(255) NOT NULL REFERENCES bgg_users(bgg_username) ON DELETE CASCADE,
  buddy_username   VARCHAR(255) NOT NULL,
  buddy_user_id    BIGINT,
  PRIMARY KEY (bgg_username, buddy_username)
);
CREATE INDEX IF NOT EXISTS idx_bgg_user_buddies_buddy ON bgg_user_buddies (buddy_username);

CREATE TABLE IF NOT EXISTS bgg_user_guilds (
  bgg_username   VARCHAR(255) NOT NULL REFERENCES bgg_users(bgg_username) ON DELETE CASCADE,
  guild_id       BIGINT NOT NULL,
  guild_name     TEXT,
  PRIMARY KEY (bgg_username, guild_id)
);

-- ============================================================
-- S. Practical partial indexes for collection queries
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_ugci_owned
  ON user_game_collection_items (bgg_username, bgg_game_id)
  WHERE is_owned;

CREATE INDEX IF NOT EXISTS idx_ugci_wishlist
  ON user_game_collection_items (bgg_username, wishlist_priority)
  WHERE is_wishlist;

CREATE INDEX IF NOT EXISTS idx_ugci_recently_modified
  ON user_game_collection_items (bgg_username, last_modified_from_bgg DESC);

COMMIT;
