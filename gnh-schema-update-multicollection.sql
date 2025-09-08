ALTER TABLE users
ADD COLUMN last_synced_at TIMESTAMP WITH TIME ZONE;

CREATE TABLE bgg_games (
    bgg_id INTEGER PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    year_published INTEGER,
    thumbnail_url TEXT,
    image_url TEXT,
    min_players SMALLINT,
    max_players SMALLINT,
    playing_time INTEGER,
    min_playtime INTEGER,
    max_playtime INTEGER,
    min_age SMALLINT,
    description TEXT,
    bgg_avg_rating NUMERIC(4, 2),
    bgg_bayes_avg_rating NUMERIC(4, 2),
    bgg_rank INTEGER,
    bgg_weight NUMERIC(3, 2),
    last_updated_general_data_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX idx_bgg_games_name ON bgg_games (name);
CREATE INDEX idx_bgg_games_bgg_avg_rating ON bgg_games (bgg_avg_rating);
CREATE INDEX idx_bgg_games_bgg_weight ON bgg_games (bgg_weight);

CREATE TABLE user_game_collection_items (
    id SERIAL PRIMARY KEY,
    username VARCHAR(25) NOT NULL REFERENCES users(username) ON DELETE CASCADE,
    bgg_game_id INTEGER NOT NULL REFERENCES bgg_games(bgg_id) ON DELETE CASCADE,
    is_owned BOOLEAN NOT NULL DEFAULT FALSE,
    is_for_trade BOOLEAN NOT NULL DEFAULT FALSE,
    is_want BOOLEAN NOT NULL DEFAULT FALSE,
    is_wishlist BOOLEAN NOT NULL DEFAULT FALSE,
    wishlist_priority SMALLINT,
    num_plays INTEGER NOT NULL DEFAULT 0,
    user_rating NUMERIC(3, 1),
    user_comment TEXT,
    last_updated_collection_item_at TIMESTAMP WITH TIME ZONE NOT NULL,
    UNIQUE (username, bgg_game_id) -- A user can only have one entry for a given game
);

CREATE INDEX idx_user_collection_username ON user_game_collection_items (username);
CREATE INDEX idx_user_collection_bgg_game_id ON user_game_collection_items (bgg_game_id);

CREATE TABLE bgg_usernames (
    bgg_username VARCHAR(255) PRIMARY KEY,
    last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);