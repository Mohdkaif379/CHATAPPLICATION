const STATUS_TTL_MS = 24 * 60 * 60 * 1000;

class StatusService {
  constructor() {
    this.nextId = 1;
    this.statusByUserId = new Map(); // userId -> status[] (24h story)
    this.viewedByStatusId = new Map(); // statusId -> Set(userId)
    this.likedByStatusId = new Map(); // statusId -> Set(userId)
  }

  pruneExpired() {
    const cutoff = Date.now() - STATUS_TTL_MS;
    for (const [userId, story] of this.statusByUserId.entries()) {
      const nextStory = Array.isArray(story) ? story.filter((s) => Number(s.createdAt) >= cutoff) : [];
      const removed = Array.isArray(story) ? story.filter((s) => Number(s.createdAt) < cutoff) : [];
      removed.forEach((s) => {
        if (!s || !s.id) return;
        this.viewedByStatusId.delete(s.id);
        this.likedByStatusId.delete(s.id);
      });

      if (!nextStory.length) {
        this.statusByUserId.delete(userId);
      } else {
        this.statusByUserId.set(userId, nextStory);
      }
    }
  }

  deleteByIdForUser(statusId, userId) {
    this.pruneExpired();
    const id = Number(statusId);
    const ownerId = Number(userId);
    if (!id || !ownerId) return false;

    const status = this.findById(id);
    if (!status) return false;
    if (Number(status.userId) !== ownerId) return false;

    const story = this.statusByUserId.get(ownerId);
    if (!Array.isArray(story) || !story.length) return false;

    const nextStory = story.filter((s) => Number(s.id) !== id);
    if (nextStory.length) this.statusByUserId.set(ownerId, nextStory);
    else this.statusByUserId.delete(ownerId);

    this.viewedByStatusId.delete(id);
    this.likedByStatusId.delete(id);
    return true;
  }

  findById(statusId) {
    const id = Number(statusId);
    if (!id) return null;
    for (const story of this.statusByUserId.values()) {
      if (!Array.isArray(story)) continue;
      const found = story.find((s) => s && Number(s.id) === id);
      if (found) return found;
    }
    return null;
  }

  create({ userId, username, type, text = '', mediaUrl = '' }) {
    this.pruneExpired();

    const cleanType = String(type || '').trim().toLowerCase();
    if (!['text', 'image', 'video'].includes(cleanType)) return null;

    const cleanText = String(text || '').trim();
    const cleanMediaUrl = String(mediaUrl || '').trim();
    if (cleanType === 'text' && !cleanText) return null;
    if (cleanType !== 'text' && !cleanMediaUrl) return null;

    const status = {
      id: this.nextId++,
      userId: Number(userId),
      username: String(username || '').toLowerCase(),
      type: cleanType,
      text: cleanType === 'text' ? cleanText : '',
      mediaUrl: cleanType === 'text' ? '' : cleanMediaUrl,
      createdAt: Date.now()
    };

    const story = this.statusByUserId.get(status.userId);
    const nextStory = Array.isArray(story) ? [...story, status] : [status];
    this.statusByUserId.set(status.userId, nextStory);
    this.viewedByStatusId.set(status.id, new Set());
    this.likedByStatusId.set(status.id, new Set());
    return status;
  }

  markViewed(statusId, userId) {
    this.pruneExpired();
    const id = Number(statusId);
    const viewerId = Number(userId);
    if (!id || !viewerId) return;
    const bucket = this.viewedByStatusId.get(id);
    if (!bucket) return;
    bucket.add(viewerId);
  }

  toggleLike(statusId, userId) {
    this.pruneExpired();
    const id = Number(statusId);
    const likerId = Number(userId);
    if (!id || !likerId) return null;

    const status = this.findById(id);
    if (!status) return null;
    if (Number(status.userId) === likerId) return null; // can't like own status

    let bucket = this.likedByStatusId.get(id);
    if (!bucket) {
      bucket = new Set();
      this.likedByStatusId.set(id, bucket);
    }

    if (bucket.has(likerId)) bucket.delete(likerId);
    else bucket.add(likerId);

    return { liked: bucket.has(likerId), count: bucket.size };
  }

  getViewedUserIds(statusId) {
    this.pruneExpired();
    const id = Number(statusId);
    if (!id) return [];
    const bucket = this.viewedByStatusId.get(id);
    if (!bucket) return [];
    return Array.from(bucket.values());
  }

  getLikedUserIds(statusId) {
    this.pruneExpired();
    const id = Number(statusId);
    if (!id) return [];
    const bucket = this.likedByStatusId.get(id);
    if (!bucket) return [];
    return Array.from(bucket.values());
  }

  listForUser(userId) {
    this.pruneExpired();
    const viewerId = Number(userId);
    const out = [];
    for (const story of this.statusByUserId.values()) {
      if (!Array.isArray(story) || !story.length) continue;

      const normalizedStory = story
        .slice()
        .sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0))
        .map((status) => {
          const viewed = this.viewedByStatusId.get(status.id)?.has(viewerId) || false;
          const likeBucket = this.likedByStatusId.get(status.id) || new Set();
          return {
            id: status.id,
            userId: status.userId,
            username: status.username,
            type: status.type,
            text: status.text,
            mediaUrl: status.mediaUrl,
            createdAt: status.createdAt,
            viewed,
            isMine: status.userId === viewerId,
            likeCount: likeBucket.size,
            likedByMe: likeBucket.has(viewerId)
          };
        });

      const latest = normalizedStory[normalizedStory.length - 1];
      out.push({
        userId: latest.userId,
        username: latest.username,
        latestId: latest.id,
        latestCreatedAt: latest.createdAt,
        allViewed: normalizedStory.every((s) => Boolean(s.viewed) || Boolean(s.isMine)),
        story: normalizedStory
      });
    }
    return out;
  }
}

module.exports = new StatusService();
