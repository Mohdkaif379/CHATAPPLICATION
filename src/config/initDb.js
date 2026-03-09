const pool = require('./database');

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_private_messages (
      id SERIAL PRIMARY KEY,
      sender_id INTEGER NOT NULL REFERENCES chat_users(id) ON DELETE CASCADE,
      receiver_id INTEGER NOT NULL REFERENCES chat_users(id) ON DELETE CASCADE,
      text TEXT NOT NULL,
      message_type VARCHAR(20) NOT NULL DEFAULT 'text',
      file_url TEXT,
      file_name TEXT,
      file_size INTEGER,
      file_mime VARCHAR(255),
      location_lat DOUBLE PRECISION,
      location_lng DOUBLE PRECISION,
      location_mode VARCHAR(20),
      read_at TIMESTAMPTZ,
      is_deleted_for_everyone BOOLEAN NOT NULL DEFAULT FALSE,
      deleted_for_everyone_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_message_hidden_for_user (
      id SERIAL PRIMARY KEY,
      message_id INTEGER NOT NULL REFERENCES chat_private_messages(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES chat_users(id) ON DELETE CASCADE,
      hidden_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(message_id, user_id)
    );
  `);

  await pool.query(`
    ALTER TABLE chat_users
    ALTER COLUMN created_at TYPE TIMESTAMPTZ
    USING created_at AT TIME ZONE 'UTC';
  `);

  await pool.query(`
    ALTER TABLE chat_private_messages
    ALTER COLUMN created_at TYPE TIMESTAMPTZ
    USING created_at AT TIME ZONE 'UTC';
  `);

  await pool.query(`
    ALTER TABLE chat_private_messages
    ADD COLUMN IF NOT EXISTS is_deleted_for_everyone BOOLEAN NOT NULL DEFAULT FALSE;
  `);

  await pool.query(`
    ALTER TABLE chat_private_messages
    ADD COLUMN IF NOT EXISTS deleted_for_everyone_at TIMESTAMPTZ;
  `);

  await pool.query(`
    ALTER TABLE chat_private_messages
    ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
  `);

  await pool.query(`
    ALTER TABLE chat_private_messages
    ADD COLUMN IF NOT EXISTS message_type VARCHAR(20) NOT NULL DEFAULT 'text';
  `);

  await pool.query(`
    ALTER TABLE chat_private_messages
    ADD COLUMN IF NOT EXISTS file_url TEXT;
  `);

  await pool.query(`
    ALTER TABLE chat_private_messages
    ADD COLUMN IF NOT EXISTS file_name TEXT;
  `);

  await pool.query(`
    ALTER TABLE chat_private_messages
    ADD COLUMN IF NOT EXISTS file_size INTEGER;
  `);

  await pool.query(`
    ALTER TABLE chat_private_messages
    ADD COLUMN IF NOT EXISTS file_mime VARCHAR(255);
  `);

  await pool.query(`
    ALTER TABLE chat_private_messages
    ADD COLUMN IF NOT EXISTS location_lat DOUBLE PRECISION;
  `);

  await pool.query(`
    ALTER TABLE chat_private_messages
    ADD COLUMN IF NOT EXISTS location_lng DOUBLE PRECISION;
  `);

  await pool.query(`
    ALTER TABLE chat_private_messages
    ADD COLUMN IF NOT EXISTS location_mode VARCHAR(20);
  `);
}

module.exports = initializeDatabase;
