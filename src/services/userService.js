class UserService {
  constructor() {
    this.usersById = new Map();
    this.usersBySocket = new Map();
  }

  registerSocket(user, socketId) {
    if (!user || !user.id) {
      return { ok: false, error: 'Invalid authenticated user.' };
    }

    const mappedUser = {
      id: Number(user.id),
      username: String(user.username).toLowerCase(),
      socketId
    };

    this.usersById.set(mappedUser.id, mappedUser);
    this.usersBySocket.set(socketId, mappedUser);

    return { ok: true, user: mappedUser };
  }

  removeBySocket(socketId) {
    const user = this.usersBySocket.get(socketId);
    if (!user) return null;

    this.usersBySocket.delete(socketId);

    const current = this.usersById.get(user.id);
    if (current && current.socketId === socketId) {
      this.usersById.delete(user.id);
    }

    return user;
  }

  getBySocket(socketId) {
    return this.usersBySocket.get(socketId);
  }

  getOnlineUsers() {
    return Array.from(this.usersById.values()).map((u) => ({ id: u.id, username: u.username }));
  }

  getOnlineByUsername(username) {
    const normalized = String(username || '').trim().toLowerCase();
    return Array.from(this.usersById.values()).find((u) => u.username === normalized) || null;
  }

  getOnlineById(userId) {
    return this.usersById.get(Number(userId)) || null;
  }
}

module.exports = new UserService();
