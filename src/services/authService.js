const bcrypt = require('bcryptjs');
const pool = require('../config/database');

class AuthService {
  normalize(username) {
    return String(username || '').trim().toLowerCase();
  }

  async createUser({ username, password }) {
    const cleanUsername = this.normalize(username);
    const cleanPassword = String(password || '');

    if (!cleanUsername || cleanPassword.length < 6) {
      return { ok: false, message: 'Username required and password must be 6+ chars.' };
    }

    const passwordHash = await bcrypt.hash(cleanPassword, 10);

    try {
      const result = await pool.query(
        'INSERT INTO chat_users (username, password_hash) VALUES ($1, $2) RETURNING id, username',
        [cleanUsername, passwordHash]
      );

      return { ok: true, user: result.rows[0] };
    } catch (error) {
      if (error.code === '23505') {
        return { ok: false, message: 'Username already exists.' };
      }

      throw error;
    }
  }

  async validateUser({ username, password }) {
    const cleanUsername = this.normalize(username);
    const cleanPassword = String(password || '');

    const result = await pool.query('SELECT id, username, password_hash FROM chat_users WHERE username = $1', [
      cleanUsername
    ]);

    const user = result.rows[0];
    if (!user) {
      return { ok: false, message: 'Invalid username or password.' };
    }

    const matched = await bcrypt.compare(cleanPassword, user.password_hash);
    if (!matched) {
      return { ok: false, message: 'Invalid username or password.' };
    }

    return {
      ok: true,
      user: {
        id: user.id,
        username: user.username
      }
    };
  }

  async findByUsername(username) {
    const cleanUsername = this.normalize(username);
    const result = await pool.query('SELECT id, username FROM chat_users WHERE username = $1', [cleanUsername]);
    return result.rows[0] || null;
  }

  async getAllUsers() {
    const result = await pool.query('SELECT id, username FROM chat_users ORDER BY username ASC');
    return result.rows;
  }

  async getUsersByIds(ids) {
    const clean = Array.isArray(ids) ? ids.map((id) => Number(id)).filter(Boolean) : [];
    if (!clean.length) return [];

    const result = await pool.query('SELECT id, username FROM chat_users WHERE id = ANY($1::int[])', [clean]);
    return result.rows;
  }
}

module.exports = new AuthService();
