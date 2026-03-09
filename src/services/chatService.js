const pool = require('../config/database');

class ChatService {
  async savePrivateMessage({
    senderId,
    receiverId,
    text,
    messageType = 'text',
    file = null,
    location = null
  }) {
    const type = ['file', 'location', 'audio'].includes(messageType) ? messageType : 'text';
    const cleanText = type === 'text' ? String(text || '').trim() : '';
    const locationUrl = type === 'location' ? String((location && location.url) || '').trim() : '';

    if (type === 'text' && !cleanText) return null;
    if ((type === 'file' || type === 'audio') && (!file || !file.fileUrl || !file.fileName)) return null;
    if (type === 'location' && !locationUrl) return null;

    const result = await pool.query(
      `
      INSERT INTO chat_private_messages (
        sender_id,
        receiver_id,
        text,
        message_type,
        file_url,
        file_name,
        file_size,
        file_mime,
        location_lat,
        location_lng,
        location_mode
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING
        id,
        sender_id,
        receiver_id,
        text,
        message_type,
        file_url,
        file_name,
        file_size,
        file_mime,
        location_lat,
        location_lng,
        location_mode,
        read_at,
        created_at,
        TO_CHAR(created_at AT TIME ZONE 'Asia/Kolkata', 'HH12:MI:SS AM') AS display_time
      `,
      [
        senderId,
        receiverId,
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

  async getConversation(userAId, userBId) {
    const result = await pool.query(
      `
      SELECT
        m.id,
        m.sender_id,
        m.receiver_id,
        m.text,
        m.message_type,
        m.file_url,
        m.file_name,
        m.file_size,
        m.file_mime,
        m.location_lat,
        m.location_lng,
        m.location_mode,
        m.read_at,
        m.is_deleted_for_everyone,
        m.created_at,
        TO_CHAR(m.created_at AT TIME ZONE 'Asia/Kolkata', 'HH12:MI:SS AM') AS display_time
      FROM chat_private_messages m
      LEFT JOIN chat_message_hidden_for_user h
        ON h.message_id = m.id AND h.user_id = $1
      WHERE (
        (m.sender_id = $1 AND m.receiver_id = $2)
        OR (m.sender_id = $2 AND m.receiver_id = $1)
      )
      AND h.id IS NULL
      ORDER BY m.created_at ASC
      `,
      [userAId, userBId]
    );

    return result.rows;
  }

  async getMessageById(messageId) {
    const result = await pool.query(
      `
      SELECT id, sender_id, receiver_id, is_deleted_for_everyone
      FROM chat_private_messages
      WHERE id = $1
      `,
      [messageId]
    );

    return result.rows[0] || null;
  }

  async deleteMessageForEveryone(messageId, senderId) {
    const result = await pool.query(
      `
      UPDATE chat_private_messages
      SET is_deleted_for_everyone = TRUE, deleted_for_everyone_at = NOW()
      WHERE id = $1 AND sender_id = $2 AND is_deleted_for_everyone = FALSE
      RETURNING id, sender_id, receiver_id
      `,
      [messageId, senderId]
    );

    return result.rows[0] || null;
  }

  async hideMessageForUser(messageId, userId) {
    await pool.query(
      `
      INSERT INTO chat_message_hidden_for_user (message_id, user_id)
      VALUES ($1, $2)
      ON CONFLICT (message_id, user_id) DO NOTHING
      `,
      [messageId, userId]
    );
  }

  async markConversationAsRead(senderId, receiverId) {
    const result = await pool.query(
      `
      UPDATE chat_private_messages
      SET read_at = NOW()
      WHERE sender_id = $1
      AND receiver_id = $2
      AND read_at IS NULL
      AND is_deleted_for_everyone = FALSE
      RETURNING id, sender_id
      `,
      [senderId, receiverId]
    );

    return result.rows;
  }
}

module.exports = new ChatService();
