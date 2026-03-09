class MessageModel {
  constructor({ from, to, text, timestamp = new Date() }) {
    this.from = from;
    this.to = to;
    this.text = text;
    this.timestamp = timestamp;
  }
}

module.exports = MessageModel;
