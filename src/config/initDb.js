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
    CREATE TABLE IF NOT EXISTS chat_groups (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      creator_id INTEGER NOT NULL REFERENCES chat_users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_group_members (
      id SERIAL PRIMARY KEY,
      group_id INTEGER NOT NULL REFERENCES chat_groups(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES chat_users(id) ON DELETE CASCADE,
      joined_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(group_id, user_id)
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
    CREATE TABLE IF NOT EXISTS chat_group_messages (
      id SERIAL PRIMARY KEY,
      group_id INTEGER NOT NULL REFERENCES chat_groups(id) ON DELETE CASCADE,
      sender_id INTEGER NOT NULL REFERENCES chat_users(id) ON DELETE CASCADE,
      text TEXT NOT NULL,
      message_type VARCHAR(20) NOT NULL DEFAULT 'text',
      file_url TEXT,
      file_name TEXT,
      file_size INTEGER,
      file_mime VARCHAR(255),
      location_lat DOUBLE PRECISION,
      location_lng DOUBLE PRECISION,
      location_mode VARCHAR(20),
      is_deleted_for_everyone BOOLEAN NOT NULL DEFAULT FALSE,
      deleted_for_everyone_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_group_message_hidden (
      id SERIAL PRIMARY KEY,
      message_id INTEGER NOT NULL REFERENCES chat_group_messages(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES chat_users(id) ON DELETE CASCADE,
      hidden_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(message_id, user_id)
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

  await pool.query(`
    ALTER TABLE chat_group_messages
    ADD COLUMN IF NOT EXISTS is_deleted_for_everyone BOOLEAN NOT NULL DEFAULT FALSE;
  `);

  await pool.query(`
    ALTER TABLE chat_group_messages
    ADD COLUMN IF NOT EXISTS deleted_for_everyone_at TIMESTAMPTZ;
  `);

  await pool.query(`
    ALTER TABLE chat_group_members
    ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;
  `);

  // Migrate existing creators to be admins
  await pool.query(`
    UPDATE chat_group_members gm
    SET is_admin = TRUE
    FROM chat_groups g
    WHERE gm.group_id = g.id AND gm.user_id = g.creator_id;
  `);

  await pool.query(`
    ALTER TABLE chat_groups
    ADD COLUMN IF NOT EXISTS admins_only_messages BOOLEAN NOT NULL DEFAULT FALSE;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS "session" (
      "sid" varchar NOT NULL COLLATE "default",
      "sess" json NOT NULL,
      "expire" timestamp(6) NOT NULL
    )
    WITH (OIDS=FALSE);
  `);

  const res = await pool.query(`
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'session_pkey' AND table_name = 'session'
  `);
  
  if (res.rows.length === 0) {
    await pool.query(`
      ALTER TABLE "session" ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE;
    `);
  }

  await pool.query(`
    CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
  `);
}

module.exports = initializeDatabase;


module.exports = initializeDatabase;
