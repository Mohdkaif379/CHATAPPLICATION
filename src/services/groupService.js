const pool = require('../config/database');

class GroupService {
  async createGroup(name, creatorId, memberIds) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      const groupResult = await client.query(
        'INSERT INTO chat_groups (name, creator_id) VALUES ($1, $2) RETURNING id',
        [name, creatorId]
      );
      const groupId = groupResult.rows[0].id;

      // Add members (including creator)
      const uniqueMemberIds = [...new Set([...memberIds, creatorId])];
      for (const userId of uniqueMemberIds) {
        const isAdmin = Number(userId) === Number(creatorId);
        await client.query(
          'INSERT INTO chat_group_members (group_id, user_id, is_admin) VALUES ($1, $2, $3)',
          [groupId, userId, isAdmin]
        );
      }

      await client.query('COMMIT');
      return { id: groupId, name, creatorId, memberIds: uniqueMemberIds };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getUserGroups(userId) {
    const result = await pool.query(
      `SELECT g.*, gm.is_admin FROM chat_groups g
       JOIN chat_group_members gm ON g.id = gm.group_id
       WHERE gm.user_id = $1
       ORDER BY g.created_at DESC`,
      [userId]
    );
    return result.rows;
  }

  async getGroupById(groupId) {
    const result = await pool.query(
      'SELECT * FROM chat_groups WHERE id = $1',
      [groupId]
    );
    return result.rows[0];
  }

  async updateGroupSettings(groupId, adminsOnlyMessages) {
    await pool.query(
      'UPDATE chat_groups SET admins_only_messages = $1 WHERE id = $2',
      [adminsOnlyMessages, groupId]
    );
  }

  async getGroupMembers(groupId) {
    const result = await pool.query(
      `SELECT u.id, u.username, gm.is_admin 
       FROM chat_users u
       JOIN chat_group_members gm ON u.id = gm.user_id
       WHERE gm.group_id = $1 AND u.username NOT ILIKE 'debuguser%'`,
      [groupId]
    );
    return result.rows;
  }

  async promoteMember(groupId, userId) {
    await pool.query(
      'UPDATE chat_group_members SET is_admin = TRUE WHERE group_id = $1 AND user_id = $2',
      [groupId, userId]
    );
  }

  async isUserAdmin(groupId, userId) {
    const result = await pool.query(
      'SELECT is_admin FROM chat_group_members WHERE group_id = $1 AND user_id = $2',
      [groupId, userId]
    );
    return result.rows[0]?.is_admin === true;
  }

  async saveGroupMessage({ groupId, senderId, text, messageType = 'text', file = null, location = null }) {
    const type = ['file', 'location', 'audio', 'system'].includes(messageType) ? messageType : 'text';
    const cleanText = (type === 'text' || type === 'system') ? String(text || '').trim() : '';
    const locationUrl = type === 'location' ? String((location && location.url) || '').trim() : '';

    if ((type === 'text' || type === 'system') && !cleanText) return null;

    const result = await pool.query(
      `INSERT INTO chat_group_messages (
        group_id, sender_id, text, message_type, file_url, file_name, file_size, file_mime, location_lat, location_lng, location_mode
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *, TO_CHAR(created_at AT TIME ZONE 'Asia/Kolkata', 'HH12:MI:SS AM') AS display_time`,
      [
        groupId,
        senderId,
        type === 'location' ? locationUrl : cleanText,
        type,
        file ? file.fileUrl : null,
        file ? file.fileName : null,
        file ? file.fileSize : null,
        file ? file.fileMime : null,
        type === 'location' ? Number(location.lat) : null,
        type === 'location' ? Number(location.lng) : null,
        type === 'location' ? String(location.mode || 'current') : null
      ]
    );
    return result.rows[0];
  }

  async getGroupHistory(groupId, userId) {
    const result = await pool.query(
      `SELECT m.*, u.username as sender_name, TO_CHAR(m.created_at AT TIME ZONE 'Asia/Kolkata', 'HH12:MI:SS AM') AS display_time
       FROM chat_group_messages m
       JOIN chat_users u ON m.sender_id = u.id
       LEFT JOIN chat_group_message_hidden h ON m.id = h.message_id AND h.user_id = $2
       WHERE m.group_id = $1 AND h.id IS NULL
       ORDER BY m.created_at ASC`,
      [groupId, userId]
    );
    return result.rows;
  }

  async getMessageById(messageId) {
    const result = await pool.query(
      'SELECT * FROM chat_group_messages WHERE id = $1',
      [messageId]
    );
    return result.rows[0] || null;
  }

  async deleteMessageForEveryone(messageId, senderId) {
    const result = await pool.query(
      `UPDATE chat_group_messages 
       SET is_deleted_for_everyone = TRUE, deleted_for_everyone_at = NOW()
       WHERE id = $1 AND sender_id = $2 AND is_deleted_for_everyone = FALSE
       RETURNING *`,
      [messageId, senderId]
    );
    return result.rows[0] || null;
  }

  async hideMessageForUser(messageId, userId) {
    await pool.query(
      `INSERT INTO chat_group_message_hidden (message_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT (message_id, user_id) DO NOTHING`,
      [messageId, userId]
    );
  }

  async leaveGroup(groupId, userId) {
    await pool.query(
      'DELETE FROM chat_group_members WHERE group_id = $1 AND user_id = $2',
      [groupId, userId]
    );
  }

  async addMember(groupId, userId) {
    await pool.query(
      'INSERT INTO chat_group_members (group_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [groupId, userId]
    );
  }

}

module.exports = new GroupService();
