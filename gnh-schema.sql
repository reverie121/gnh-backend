CREATE TABLE users (
  username VARCHAR(25) PRIMARY KEY,
  password TEXT NOT NULL,
  bgg_username VARCHAR(20), 
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL
    CHECK (position('@' IN email) > 1),
  is_admin BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE quick_filters (
  id SERIAL PRIMARY KEY,
  username VARCHAR(25) NOT NULL REFERENCES users ON DELETE CASCADE,
  settings_name VARCHAR(50) NOT NULL,
  filter_settings TEXT NOT NULL
);

CREATE TABLE filter_attribute (
  id SERIAL PRIMARY KEY,
  username VARCHAR(25) NOT NULL REFERENCES users ON DELETE CASCADE,
  game_id INT NOT NULL,
  attribute VARCHAR(50) NOT NULL
);

CREATE TABLE collection_backup (
  id SERIAL PRIMARY KEY,
  backup_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  username VARCHAR(25) NOT NULL REFERENCES users ON DELETE CASCADE,
  bgg_username VARCHAR(20) NOT NULL,
  collection_type VARCHAR(7) DEFAULT 'full',
  collection_data TEXT NOT NULL
);