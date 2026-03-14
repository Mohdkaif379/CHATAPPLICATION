const { Server } = require('socket.io');
const userService = require('../services/userService');
const chatService = require('../services/chatService');
const authService = require('../services/authService');
const groupService = require('../services/groupService');
const statusService = require('../services/statusService');

const istTimeFormatter = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: true
});

function toIstTime(timestamp) {
  return istTimeFormatter.format(new Date(timestamp));
}

async function emitUsersUpdate(io, socket = null) {
  const allUsers = await authService.getAllUsers();
  const onlineUsers = userService.getOnlineUsers();
  const users = allUsers.map((user) => ({
    id: user.id,
    username: user.username,
    online: onlineUsers.some((ou) => ou.id === user.id),
    lastActiveAt: userService.getLastActiveAt(user.id)
  }));

  if (socket) {
    const user = userService.getBySocket(socket.id);
    if (user && user.id) {
       const groups = await groupService.getUserGroups(Number(user.id));
       socket.emit('users:update', { users, groups });
    } else {
       socket.emit('users:update', { users });
    }
  } else {
    // Update every online user personally
    const onlineMap = userService.usersById; // Map of {id -> {id, username, socketId}}
    for (const onlineUser of onlineMap.values()) {
        const groups = await groupService.getUserGroups(onlineUser.id);
        io.to(onlineUser.socketId).emit('users:update', { users, groups });
    }
  }
}

function emitStatusUpdate(io, socket = null) {
  if (socket) {
    const user = userService.getBySocket(socket.id);
    if (!user) return;
    socket.emit('status:list', { statuses: statusService.listForUser(user.id) });
    return;
  }

  // ensure expired statuses are removed periodically/consistently
  statusService.pruneExpired();

  const onlineMap = userService.usersById;
  for (const onlineUser of onlineMap.values()) {
    io.to(onlineUser.socketId).emit('status:list', { statuses: statusService.listForUser(onlineUser.id) });
  }
}

async function emitStatusDetailsToOwner(io, statusId) {
  const status = statusService.findById(statusId);
  if (!status) return;

  const ownerOnline = userService.getOnlineById(status.userId);
  if (!ownerOnline || !ownerOnline.socketId) return;

  const viewedIds = statusService.getViewedUserIds(statusId);
  const likedIds = statusService.getLikedUserIds(statusId);
  const uniqueIds = Array.from(new Set([...viewedIds, ...likedIds]));

  const users = await authService.getUsersByIds(uniqueIds);
  const userById = new Map(users.map((u) => [Number(u.id), u.username]));

  const viewedBy = viewedIds
    .map((id) => ({ id, username: userById.get(Number(id)) }))
    .filter((u) => u.username);
  const likedBy = likedIds
    .map((id) => ({ id, username: userById.get(Number(id)) }))
    .filter((u) => u.username);

  io.to(ownerOnline.socketId).emit('status:details', { statusId: Number(statusId), viewedBy, likedBy });
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

function formatGroupMessage(row, currentUserId) {
  return {
    id: row.id,
    groupId: row.group_id,
    fromId: row.sender_id,
    from: row.sender_id === currentUserId ? 'you' : row.sender_name || 'them',
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
    isDeleted: Boolean(row.is_deleted_for_everyone)
  };
}


function configureSocket(server, sessionMiddleware) {
  const io = new Server(server);

  // Keep status TTL (24h) pruning + live UI updates even when nobody interacts.
  setInterval(() => {
    try {
      emitStatusUpdate(io);
    } catch (e) {
      // ignore
    }
  }, 60_000);

  io.use((socket, next) => {
    console.log('[Socket.io] New connection attempt...');
    sessionMiddleware(socket.request, {}, () => {
      const user = socket.request.session && socket.request.session.user;
      if (!user) {
        console.warn('[Socket.io] Unauthorized connection attempt');
        return next(new Error('Unauthorized'));
      }
      console.log(`[Socket.io] User authorized: ${user.username}`);
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
    emitUsersUpdate(io, socket).catch(() => {
      socket.emit('chat:error', { message: 'Could not load users list.' });
    });
    emitUsersUpdate(io).catch(() => {});
    emitStatusUpdate(io, socket);

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

    socket.on('chat:typing', async ({ to, isTyping }) => {
      const fromUser = userService.getBySocket(socket.id);
      if (!fromUser) return;

      const targetOnline = userService.getOnlineByUsername(to);
      if (targetOnline && targetOnline.socketId) {
        io.to(targetOnline.socketId).emit('chat:typing', {
          from: fromUser.username,
          isTyping
        });
      }
    });

    socket.on('status:create', ({ type, text, mediaUrl }) => {
      const fromUser = userService.getBySocket(socket.id);
      if (!fromUser) return;

      const created = statusService.create({
        userId: fromUser.id,
        username: fromUser.username,
        type,
        text,
        mediaUrl
      });

      if (!created) {
        socket.emit('chat:error', { message: 'Could not create status.' });
        return;
      }

      emitStatusUpdate(io);
    });

    socket.on('status:view', ({ statusId }) => {
      const viewer = userService.getBySocket(socket.id);
      if (!viewer) return;
      statusService.markViewed(statusId, viewer.id);
      emitStatusUpdate(io, socket);
      emitStatusDetailsToOwner(io, statusId).catch(() => {});
    });

    socket.on('status:like', ({ statusId }) => {
      const liker = userService.getBySocket(socket.id);
      if (!liker) return;
      const result = statusService.toggleLike(statusId, liker.id);
      if (!result) return;
      emitStatusUpdate(io);
      emitStatusDetailsToOwner(io, statusId).catch(() => {});
    });

    socket.on('status:delete', ({ statusId }) => {
      const requester = userService.getBySocket(socket.id);
      if (!requester) return;

      const ok = statusService.deleteByIdForUser(statusId, requester.id);
      if (!ok) return;

      emitStatusUpdate(io);
      socket.emit('status:deleted', { statusId: Number(statusId) });
    });

    socket.on('status:details', async ({ statusId }) => {
      try {
        const requester = userService.getBySocket(socket.id);
        if (!requester) return;

        const status = statusService.findById(statusId);
        if (!status) return;
        if (Number(status.userId) !== Number(requester.id)) return;

        const viewedIds = statusService.getViewedUserIds(statusId);
        const likedIds = statusService.getLikedUserIds(statusId);

        const uniqueIds = Array.from(new Set([...viewedIds, ...likedIds]));
        const users = await authService.getUsersByIds(uniqueIds);
        const userById = new Map(users.map((u) => [Number(u.id), u.username]));

        const viewedBy = viewedIds
          .map((id) => ({ id, username: userById.get(Number(id)) }))
          .filter((u) => u.username);
        const likedBy = likedIds
          .map((id) => ({ id, username: userById.get(Number(id)) }))
          .filter((u) => u.username);

        socket.emit('status:details', { statusId: Number(statusId), viewedBy, likedBy });
      } catch (error) {
        // ignore
      }
    });

    socket.on('group:typing', async ({ groupId, isTyping }) => {
      const fromUser = userService.getBySocket(socket.id);
      if (!fromUser) return;

      const members = await groupService.getGroupMembers(groupId);
      members.forEach((member) => {
        if (member.id === fromUser.id) return;
        const onlineMember = userService.getOnlineById(member.id);
        if (onlineMember && onlineMember.socketId) {
          io.to(onlineMember.socketId).emit('group:typing', {
            groupId,
            from: fromUser.username,
            isTyping
          });
        }
      });
    });

    socket.on('group:create', async ({ name, memberIds }) => {
      try {
        const currentUser = userService.getBySocket(socket.id);
        if (!currentUser) return;

        const group = await groupService.createGroup(name, currentUser.id, memberIds);
        
        // Save and broadcast creation system message
        const systemMsg = await groupService.saveGroupMessage({
          groupId: group.id,
          senderId: currentUser.id,
          text: `${currentUser.username} created the group "${name}"`,
          messageType: 'system'
        });

        // Notify all online members to refresh their groups list
        const members = await groupService.getGroupMembers(group.id);
        const payload = systemMsg ? formatGroupMessage({ ...systemMsg, sender_name: 'System' }, 0) : null;

        members.forEach(member => {
          const onlineMember = userService.getOnlineById(member.id);
          if (onlineMember) {
            if (payload) {
              io.to(onlineMember.socketId).emit('group:message', payload);
            }
            emitUsersUpdate(io, io.sockets.sockets.get(onlineMember.socketId)).catch(() => {});
          }
        });

      } catch (error) {
        socket.emit('chat:error', { message: 'Could not create group.' });
      }
    });

    socket.on('group:members:get', async ({ groupId }) => {
      try {
        const members = await groupService.getGroupMembers(groupId);
        socket.emit('group:members:list', { members });
      } catch (error) {
        socket.emit('chat:error', { message: 'Could not load group members.' });
      }
    });

    socket.on('group:history', async ({ groupId }) => {

      try {
        const currentUser = userService.getBySocket(socket.id);
        if (!currentUser) return;

        const rows = await groupService.getGroupHistory(groupId, currentUser.id);
        const messages = rows.map((row) => formatGroupMessage(row, currentUser.id));


        socket.emit('group:history', {
          groupId,
          messages
        });
      } catch (error) {
        socket.emit('chat:error', { message: 'Could not load group history.' });
      }
    });

    socket.on('group:message', async ({ groupId, text, messageType, file, location }) => {
      try {
        const fromUser = userService.getBySocket(socket.id);
        if (!fromUser) return;

        // Verify membership
        const members = await groupService.getGroupMembers(groupId);
        if (!members.some(m => m.id === fromUser.id)) {
          socket.emit('chat:error', { message: 'You are no longer a member of this group.' });
          return;
        }

        // Check Admin-Only Messaging setting
        const group = await groupService.getGroupById(groupId);
        const isAdmin = await groupService.isUserAdmin(groupId, fromUser.id);
        if (group && group.admins_only_messages && !isAdmin) {
          socket.emit('chat:error', { message: 'Only admin can send messages in this group.' });
          return;
        }

        const saved = await groupService.saveGroupMessage({
          groupId,
          senderId: fromUser.id,
          text,
          messageType,
          file,
          location
        });

        if (!saved) return;

        // Get members to send message to
        const payload = formatGroupMessage({ ...saved, sender_name: fromUser.username }, fromUser.id);

        members.forEach(member => {
          const onlineMember = userService.getOnlineById(member.id);
          if (onlineMember) {
            io.to(onlineMember.socketId).emit('group:message', payload);
          }
        });
      } catch (error) {
        socket.emit('chat:error', { message: 'Could not send group message.' });
      }
    });

    socket.on('group:leave', async ({ groupId }) => {
      try {
        const currentUser = userService.getBySocket(socket.id);
        if (!currentUser) return;

        // Verify membership before allowing leave
        const membersBefore = await groupService.getGroupMembers(groupId);
        const isMember = membersBefore.some(m => m.id === currentUser.id);
        if (!isMember) {
          socket.emit('chat:error', { message: 'You are already not a member of this group.' });
          return;
        }

        // Save system message
        const systemMsg = await groupService.saveGroupMessage({
          groupId,
          senderId: currentUser.id,
          text: `${currentUser.username} left the group`,
          messageType: 'system'
        });

        // Remove user from group
        await groupService.leaveGroup(groupId, currentUser.id);

        // Notify remaining members
        const members = await groupService.getGroupMembers(groupId);
        if (systemMsg) {
          const payload = formatGroupMessage({ ...systemMsg, sender_name: 'System' }, 0);
          members.forEach(member => {
            const onlineMember = userService.getOnlineById(member.id);
            if (onlineMember) {
              io.to(onlineMember.socketId).emit('group:message', payload);
            }
          });
        }

        // Send refresh signal to the user who left
        emitUsersUpdate(io, socket).catch(() => {});

      } catch (error) {
        socket.emit('chat:error', { message: 'Could not leave group.' });
      }
    });

    socket.on('group:member:add', async ({ groupId, targetUserId }) => {
      try {
        const requester = userService.getBySocket(socket.id);
        if (!requester) return;

        // Verify requester membership
        const membersBefore = await groupService.getGroupMembers(groupId);
        if (!membersBefore.some(m => m.id === requester.id)) {
          return socket.emit('chat:error', { message: 'Unauthorized' });
        }

        const targetUser = await authService.getAllUsers().then(users => users.find(u => u.id === Number(targetUserId)));
        if (!targetUser) return;

        await groupService.addMember(groupId, targetUserId);

        const systemMsg = await groupService.saveGroupMessage({
          groupId,
          senderId: requester.id,
          text: `${requester.username} added ${targetUser.username}`,
          messageType: 'system'
        });

        const updatedMembers = await groupService.getGroupMembers(groupId);
        const payload = formatGroupMessage({ ...systemMsg, sender_name: 'System' }, 0);

        updatedMembers.forEach(member => {
          const onlineMember = userService.getOnlineById(member.id);
          if (onlineMember) {
            io.to(onlineMember.socketId).emit('group:message', payload);
            // Refresh sidebar for all members (including both adder and added)
            emitUsersUpdate(io, io.sockets.sockets.get(onlineMember.socketId)).catch(() => {});
          }
        });

      } catch (error) {
        socket.emit('chat:error', { message: 'Could not add member.' });
      }
    });

    socket.on('group:member:remove', async ({ groupId, targetUserId }) => {
      try {
        const currentUser = userService.getBySocket(socket.id);
        if (!currentUser) return;

        const isAdmin = await groupService.isUserAdmin(groupId, currentUser.id);
        if (!isAdmin) {
          return socket.emit('chat:error', { message: 'Only admin can remove members.' });
        }

        const group = await groupService.getGroupById(groupId);
        if (!group) return;

        if (Number(targetUserId) === Number(group.creator_id)) {
          return socket.emit('chat:error', { message: 'Group creator cannot be removed.' });
        }

        const targetUser = await authService.getAllUsers().then(users => users.find(u => u.id === Number(targetUserId)));
        
        await groupService.leaveGroup(groupId, targetUserId);

        const systemMsg = await groupService.saveGroupMessage({
          groupId,
          senderId: currentUser.id,
          text: `Admin removed ${targetUser ? targetUser.username : 'a member'}`,
          messageType: 'system'
        });

        const members = await groupService.getGroupMembers(groupId);
        const payload = systemMsg ? formatGroupMessage({ ...systemMsg, sender_name: 'System' }, 0) : null;
        
        // Notify the restricted user first
        const onlineTarget = userService.getOnlineById(targetUserId);
        if (onlineTarget) {
            io.to(onlineTarget.socketId).emit('group:member:removed', { groupId });
            emitUsersUpdate(io, io.sockets.sockets.get(onlineTarget.socketId)).catch(() => {});
        }

        // Notify remaining members
        members.forEach(member => {
          const onlineMember = userService.getOnlineById(member.id);
          if (onlineMember) {
            if (payload) {
              io.to(onlineMember.socketId).emit('group:message', payload);
            }
            emitUsersUpdate(io, io.sockets.sockets.get(onlineMember.socketId)).catch(() => {});
          }
        });

      } catch (error) {
        socket.emit('chat:error', { message: 'Could not remove member.' });
      }
    });

    socket.on('group:member:promote', async ({ groupId, targetUserId }) => {
      try {
        const currentUser = userService.getBySocket(socket.id);
        if (!currentUser) return;

        const isAdmin = await groupService.isUserAdmin(groupId, currentUser.id);
        if (!isAdmin) {
          return socket.emit('chat:error', { message: 'Only admin can promote members.' });
        }

        await groupService.promoteMember(groupId, targetUserId);

        const targetUser = await authService.getAllUsers().then(users => users.find(u => u.id === Number(targetUserId)));
        
        const systemMsg = await groupService.saveGroupMessage({
          groupId,
          senderId: currentUser.id,
          text: `Admin promoted ${targetUser ? targetUser.username : 'a member'} to Admin`,
          messageType: 'system'
        });

        const members = await groupService.getGroupMembers(groupId);
        const payload = systemMsg ? formatGroupMessage({ ...systemMsg, sender_name: 'System' }, 0) : null;
        
        members.forEach(member => {
          const onlineMember = userService.getOnlineById(member.id);
          if (onlineMember) {
            if (payload) {
              io.to(onlineMember.socketId).emit('group:message', payload);
            }
            // Notify all members of the promotion to update UI
            io.to(onlineMember.socketId).emit('group:member:promoted', { groupId, targetUserId });
          }
        });

      } catch (error) {
        socket.emit('chat:error', { message: 'Could not promote member.' });
      }
    });

    socket.on('group:settings:update', async ({ groupId, adminsOnlyMessages }) => {
      try {
        const currentUser = userService.getBySocket(socket.id);
        if (!currentUser) return;

        const isAdmin = await groupService.isUserAdmin(groupId, currentUser.id);
        if (!isAdmin) {
          return socket.emit('chat:error', { message: 'Only admin can change settings.' });
        }

        await groupService.updateGroupSettings(groupId, adminsOnlyMessages);

        const systemMsg = await groupService.saveGroupMessage({
          groupId,
          senderId: currentUser.id,
          text: `Admin ${adminsOnlyMessages ? 'enabled' : 'disabled'} "Admins only can message" setting`,
          messageType: 'system'
        });

        const members = await groupService.getGroupMembers(groupId);
        const payload = systemMsg ? formatGroupMessage({ ...systemMsg, sender_name: 'System' }, 0) : null;
        
        // Broadcast the setting change notification and refresh sidebar/UI for all members
        members.forEach(member => {
          const onlineMember = userService.getOnlineById(member.id);
          if (onlineMember) {
            if (payload) {
              io.to(onlineMember.socketId).emit('group:message', payload);
            }
            io.to(onlineMember.socketId).emit('group:settings:updated', { groupId, adminsOnlyMessages });
          }
        });

      } catch (error) {
        socket.emit('chat:error', { message: 'Could not update group settings.' });
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

    socket.on('group:delete', async ({ messageId, scope }) => {
      try {
        const currentUser = userService.getBySocket(socket.id);
        if (!currentUser) return;

        const id = Number(messageId);
        if (!id) return;
        const deleteScope = scope === 'everyone' ? 'everyone' : 'me';

        const message = await groupService.getMessageById(id);
        if (!message) {
          socket.emit('chat:error', { message: 'Message not found.' });
          return;
        }

        // Check if user is a member of the group
        const members = await groupService.getGroupMembers(message.group_id);
        const isMember = members.some(m => m.id === currentUser.id);
        if (!isMember) {
            socket.emit('chat:error', { message: 'Not allowed to delete this message.' });
            return;
        }

        if (deleteScope === 'everyone') {
          if (message.sender_id !== currentUser.id) {
            socket.emit('chat:error', { message: 'Only sender can delete for everyone.' });
            return;
          }

          const deleted = await groupService.deleteMessageForEveryone(id, currentUser.id);
          if (!deleted) return;

          members.forEach(member => {
            const onlineMember = userService.getOnlineById(member.id);
            if (onlineMember && onlineMember.socketId) {
              io.to(onlineMember.socketId).emit('group:deleted', {
                messageId: deleted.id,
                groupId: deleted.group_id,
                scope: 'everyone'
              });
            }
          });
        } else {
          await groupService.hideMessageForUser(id, currentUser.id);
          socket.emit('group:deleted', { messageId: id, scope: 'me' });
        }
      } catch (error) {
        socket.emit('chat:error', { message: 'Could not delete group message.' });
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


