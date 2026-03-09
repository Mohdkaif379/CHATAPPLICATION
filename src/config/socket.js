const { Server } = require('socket.io');
const userService = require('../services/userService');
const chatService = require('../services/chatService');
const authService = require('../services/authService');

const istTimeFormatter = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',  hour12: true
});

function toIstTime(timestamp) {
  return istTimeFormatter.format(new Date(timestamp));
}

async function emitUsersUpdate(io) {
  const allUsers = await authService.getAllUsers();
  const users = allUsers.map((user) => ({
    id: user.id,
    username: user.username,
    online: Boolean(userService.getOnlineById(user.id))
  }));

  io.emit('users:update', { users });
}

function formatMessage(row, currentUserId, targetUserId) {
  return {
    id: row.id,
    fromId: row.sender_id,
    toId: row.receiver_id,
    from: row.sender_id === currentUserId ? 'you' : 'them',
    to: row.receiver_id === targetUserId ? 'them' : 'you',
    text: row.text,
    messageType: row.message_type || 'text',
    fileUrl: row.file_url || null,
    fileName: row.file_name || null,
    fileSize: row.file_size || null,
    fileMime: row.file_mime || null,
    locationLat: row.location_lat || null,
    locationLng: row.location_lng || null,
    locationMode: row.location_mode || 'current',
    locationUrl: row.message_type === 'location' ? row.text : null,
    timestamp: row.created_at,
    displayTime: row.display_time || toIstTime(row.created_at),
    isDeleted: Boolean(row.is_deleted_for_everyone),
    readAt: row.read_at || null
  };
}

function configureSocket(server, sessionMiddleware) {
  const io = new Server(server);

  io.use((socket, next) => {
    sessionMiddleware(socket.request, {}, () => {
      const user = socket.request.session && socket.request.session.user;
      if (!user) {
        return next(new Error('Unauthorized'));
      }

      return next();
    });
  });

  io.on('connection', (socket) => {
    const sessionUser = socket.request.session.user;
    const register = userService.registerSocket(sessionUser, socket.id);

    if (!register.ok) {
      socket.emit('chat:error', { message: register.error });
      socket.disconnect();
      return;
    }

    socket.emit('session:ready', { username: register.user.username });
    emitUsersUpdate(io).catch(() => {
      socket.emit('chat:error', { message: 'Could not load users list.' });
    });

    socket.on('chat:history', async ({ withUser }) => {
      try {
        const currentUser = userService.getBySocket(socket.id);
        if (!currentUser) return;

        const target = await authService.findByUsername(withUser);
        if (!target) {
          socket.emit('chat:error', { message: 'User not found.' });
          return;
        }

        const rows = await chatService.getConversation(currentUser.id, target.id);
        const messages = rows.map((row) => formatMessage(row, currentUser.id, target.id));

        socket.emit('chat:history', {
          withUser: target.username,
          messages
        });
      } catch (error) {
        socket.emit('chat:error', { message: 'Could not load conversation.' });
      }
    });

    socket.on('chat:private', async ({ to, text, messageType, file, location }) => {
      try {
        const fromUser = userService.getBySocket(socket.id);
        if (!fromUser) return;

        const targetDbUser = await authService.findByUsername(to);
        if (!targetDbUser) {
          socket.emit('chat:error', { message: 'Target user does not exist.' });
          return;
        }

        const saved = await chatService.savePrivateMessage({
          senderId: fromUser.id,
          receiverId: targetDbUser.id,
          text,
          messageType,
          file,
          location
        });

        if (!saved) return;

        const payloadForSender = {
          id: saved.id,
          fromId: fromUser.id,
          toId: targetDbUser.id,
          from: fromUser.username,
          to: targetDbUser.username,
          text: saved.text,
          messageType: saved.message_type || 'text',
          fileUrl: saved.file_url || null,
          fileName: saved.file_name || null,
          fileSize: saved.file_size || null,
          fileMime: saved.file_mime || null,
          locationLat: saved.location_lat || null,
          locationLng: saved.location_lng || null,
          locationMode: saved.location_mode || 'current',
          locationUrl: saved.message_type === 'location' ? saved.text : null,
          timestamp: saved.created_at,
          displayTime: saved.display_time || toIstTime(saved.created_at),
          isDeleted: false,
          readAt: saved.read_at || null
        };

        const targetOnline = userService.getOnlineByUsername(targetDbUser.username);
        io.to(fromUser.socketId).emit('chat:private', payloadForSender);
        if (targetOnline && targetOnline.socketId) {
          io.to(targetOnline.socketId).emit('chat:private', payloadForSender);
        }
      } catch (error) {
        socket.emit('chat:error', { message: 'Could not send message.' });
      }
    });

    socket.on('chat:seen', async ({ withUser }) => {
      try {
        const currentUser = userService.getBySocket(socket.id);
        if (!currentUser) return;

        const target = await authService.findByUsername(withUser);
        if (!target) return;

        const readRows = await chatService.markConversationAsRead(target.id, currentUser.id);
        if (!readRows.length) return;

        const targetOnline = userService.getOnlineById(target.id);
        if (targetOnline && targetOnline.socketId) {
          io.to(targetOnline.socketId).emit('chat:read', {
            byUserId: currentUser.id,
            messageIds: readRows.map((row) => row.id)
          });
        }
      } catch (error) {
        socket.emit('chat:error', { message: 'Could not update read status.' });
      }
    });

    socket.on('chat:delete', async ({ messageId, scope }) => {
      try {
        const currentUser = userService.getBySocket(socket.id);
        if (!currentUser) return;

        const id = Number(messageId);
        if (!id) return;
        const deleteScope = scope === 'everyone' ? 'everyone' : 'me';

        const message = await chatService.getMessageById(id);
        if (!message) {
          socket.emit('chat:error', { message: 'Message not found.' });
          return;
        }

        const isParticipant =
          message.sender_id === currentUser.id || message.receiver_id === currentUser.id;
        if (!isParticipant) {
          socket.emit('chat:error', { message: 'Not allowed to delete this message.' });
          return;
        }

        if (deleteScope === 'everyone') {
          if (message.sender_id !== currentUser.id) {
            socket.emit('chat:error', { message: 'Only sender can delete for everyone.' });
            return;
          }

          if (message.is_deleted_for_everyone) {
            return;
          }

          const deleted = await chatService.deleteMessageForEveryone(id, currentUser.id);
          if (!deleted) return;

          const senderOnline = userService.getOnlineById(deleted.sender_id);
          const receiverOnline = userService.getOnlineById(deleted.receiver_id);

          if (senderOnline && senderOnline.socketId) {
            io.to(senderOnline.socketId).emit('chat:deleted', {
              messageId: deleted.id,
              scope: 'everyone'
            });
          } else {
            socket.emit('chat:deleted', { messageId: deleted.id, scope: 'everyone' });
          }

          if (receiverOnline && receiverOnline.socketId) {
            io.to(receiverOnline.socketId).emit('chat:deleted', {
              messageId: deleted.id,
              scope: 'everyone'
            });
          }
        } else {
          await chatService.hideMessageForUser(id, currentUser.id);
          socket.emit('chat:deleted', { messageId: id, scope: 'me' });
        }
      } catch (error) {
        socket.emit('chat:error', { message: 'Could not delete message.' });
      }
    });

    socket.on('disconnect', () => {
      const removed = userService.removeBySocket(socket.id);
      if (!removed) return;

      emitUsersUpdate(io).catch(() => {});
    });
  });
}

module.exports = configureSocket;

