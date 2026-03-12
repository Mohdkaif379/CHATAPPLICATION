const pool = require('./src/config/database');
const initializeDatabase = require('./src/config/initDb');

async function test() {
  try {
    console.log('Testing database connection...');
    await pool.query('SELECT NOW()');
    console.log('Database connection successful.');

    console.log('Initializing database...');
    await initializeDatabase();
    console.log('Database initialization successful.');

    console.log('Testing session table...');
    const res = await pool.query("SELECT * FROM information_schema.tables WHERE table_name = 'session'");
    if (res.rows.length > 0) {
      console.log('Session table exists.');
    } else {
      console.log('Session table does NOT exist.');
    }
  } catch (err) {
    console.error('Test failed:', err);
  } finally {
    await pool.end();
  }
}

test();
 