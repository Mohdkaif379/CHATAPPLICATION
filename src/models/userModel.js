class UserModel {
  constructor({ username, socketId }) {
    this.username = username;
    this.socketId = socketId;
  }
}

module.exports = UserModel;
