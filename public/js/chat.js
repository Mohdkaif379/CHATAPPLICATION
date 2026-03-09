const socket = io();

const messageForm = document.getElementById('messageForm');
const statusText = document.getElementById('statusText');
const usersList = document.getElementById('usersList');
const usersSearch = document.getElementById('usersSearch');
const messages = document.getElementById('messages');
const chatTitle = document.getElementById('chatTitle');
const selectedUserAvatar = document.getElementById('selectedUserAvatar');
const messageInput = document.getElementById('message');
const fileInput = document.getElementById('fileInput');
const voiceToggle = document.getElementById('voiceToggle');
const locationToggle = document.getElementById('locationToggle');
const emojiToggle = document.getElementById('emojiToggle');
const emojiPicker = document.getElementById('emojiPicker');
const deleteModal = document.getElementById('deleteModal');
const deleteEveryoneBtn = document.getElementById('deleteEveryoneBtn');
const deleteMeBtn = document.getElementById('deleteMeBtn');
const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
const filePreviewModal = document.getElementById('filePreviewModal');
const previewImage = document.getElementById('previewImage');
const previewFileName = document.getElementById('previewFileName');
const previewFileMeta = document.getElementById('previewFileMeta');
const previewSendBtn = document.getElementById('previewSendBtn');
const previewCancelBtn = document.getElementById('previewCancelBtn');
const locationModal = document.getElementById('locationModal');
const sendCurrentLocationBtn = document.getElementById('sendCurrentLocationBtn');
const toggleLiveLocationBtn = document.getElementById('toggleLiveLocationBtn');
const cancelLocationBtn = document.getElementById('cancelLocationBtn');
const voiceModal = document.getElementById('voiceModal');
const voiceStatusText = document.getElementById('voiceStatusText');
const startVoiceBtn = document.getElementById('startVoiceBtn');
const stopVoiceBtn = document.getElementById('stopVoiceBtn');
const sendVoiceBtn = document.getElementById('sendVoiceBtn');
const cancelVoiceBtn = document.getElementById('cancelVoiceBtn');

const myUserId = Number(window.APP_USER.id || 0);
const myUsername = String(window.APP_USER.username || '').toLowerCase();
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

let selectedUser = '';
let selectedUserAvatarUrl = '';
let pendingDelete = null;
let cachedUsers = [];
let pendingFile = null;
let pendingPreviewUrl = '';
const pendingUploadTempIds = [];
let liveLocationWatchId = null;
let lastLiveLocationSentAt = 0;
let mediaRecorder = null;
let voiceChunks = [];
let voiceBlob = null;
let voiceStream = null;

const istTimeFormatter = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: true
});

function setStatus(text) {
  if (statusText) statusText.textContent = text;
}

function setVoiceStatus(text) {
  if (voiceStatusText) voiceStatusText.textContent = text;
}

function initEmojiPicker() {
  if (!emojiToggle || !emojiPicker) return;

  emojiToggle.addEventListener('click', (event) => {
    event.preventDefault();
    emojiPicker.classList.toggle('hidden');
  });

  emojiPicker.addEventListener('emoji-click', (event) => {
    const emoji = event && event.detail ? event.detail.unicode : '';
    if (!emoji) return;

    const start = messageInput.selectionStart ?? messageInput.value.length;
    const end = messageInput.selectionEnd ?? messageInput.value.length;
    const current = messageInput.value;
    messageInput.value = `${current.slice(0, start)}${emoji}${current.slice(end)}`;
    const pos = start + emoji.length;
    messageInput.setSelectionRange(pos, pos);
    messageInput.focus();
  });

  document.addEventListener('click', (event) => {
    const clickedInside = event.target.closest('.input-shell');
    if (!clickedInside) {
      emojiPicker.classList.add('hidden');
    }
  });
}

function parseTimestamp(timestamp) {
  if (typeof timestamp === 'string') {
    const hasTimezone = /([zZ]|[+\-]\d{2}:\d{2})$/.test(timestamp);
    return new Date(hasTimezone ? timestamp : `${timestamp}Z`);
  }

  return new Date(timestamp);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatBytes(bytes) {
  if (!bytes || Number.isNaN(Number(bytes))) return '';
  const size = Number(bytes);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function openVoiceModal() {
  if (!voiceModal) return;
  voiceModal.classList.remove('hidden');
}

function resetVoiceRecorderState() {
  voiceChunks = [];
  voiceBlob = null;
  if (startVoiceBtn) startVoiceBtn.disabled = false;
  if (stopVoiceBtn) stopVoiceBtn.disabled = true;
  if (sendVoiceBtn) sendVoiceBtn.disabled = true;
  setVoiceStatus('Press Start to record voice message.');
}

function stopVoiceTracks() {
  if (voiceStream) {
    voiceStream.getTracks().forEach((track) => track.stop());
    voiceStream = null;
  }
}

function closeVoiceModal() {
  if (!voiceModal) return;
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
  }
  mediaRecorder = null;
  stopVoiceTracks();
  resetVoiceRecorderState();
  voiceModal.classList.add('hidden');
}

async function startVoiceRecording() {
  try {
    voiceStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(voiceStream);
    voiceChunks = [];

    mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        voiceChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = () => {
      voiceBlob = new Blob(voiceChunks, { type: 'audio/webm' });
      if (sendVoiceBtn) sendVoiceBtn.disabled = !voiceBlob || voiceBlob.size === 0;
      stopVoiceTracks();
      setVoiceStatus('Recording stopped. Send voice message.');
    };

    mediaRecorder.start();
    if (startVoiceBtn) startVoiceBtn.disabled = true;
    if (stopVoiceBtn) stopVoiceBtn.disabled = false;
    if (sendVoiceBtn) sendVoiceBtn.disabled = true;
    setVoiceStatus('Recording...');
  } catch (error) {
    setVoiceStatus('Microphone permission denied or unavailable.');
  }
}

function stopVoiceRecording() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
    if (stopVoiceBtn) stopVoiceBtn.disabled = true;
  }
}

async function sendVoiceMessage() {
  if (!selectedUser) {
    setStatus('Status: Select a user first, then send voice.');
    return;
  }

  if (!voiceBlob || voiceBlob.size === 0) {
    setVoiceStatus('Record voice first.');
    return;
  }

  const fileName = `voice-${Date.now()}.webm`;
  const file = new File([voiceBlob], fileName, { type: 'audio/webm' });
  const tempId = appendUploadingFileMessage(fileName, file.size);
  closeVoiceModal();

  try {
    const uploaded = await uploadFileWithProgress(file, (percent) => {
      updateUploadingMessage(tempId, percent);
    });

    pendingUploadTempIds.push(tempId);
    socket.emit('chat:private', {
      to: selectedUser,
      messageType: 'audio',
      file: {
        fileUrl: uploaded.fileUrl,
        fileName: uploaded.fileName || fileName,
        fileSize: uploaded.fileSize || file.size,
        fileMime: uploaded.fileMime || file.type
      }
    });
    setStatus('Status: Voice sent');
  } catch (error) {
    removeUploadingMessage(tempId);
    setStatus(`Status: ${error.message || 'Voice upload failed.'}`);
  }
}

function sendLocationMessage(position, mode) {
  const lat = Number(position.coords.latitude);
  const lng = Number(position.coords.longitude);
  const url = `https://www.google.com/maps?q=${lat},${lng}`;

  socket.emit('chat:private', {
    to: selectedUser,
    messageType: 'location',
    location: { lat, lng, url, mode }
  });
}

function sendCurrentLocation() {
  if (!selectedUser) {
    setStatus('Status: Select a user first, then share location.');
    return;
  }

  if (!navigator.geolocation) {
    setStatus('Status: Geolocation is not supported on this device.');
    return;
  }

  setStatus('Status: Fetching location...');
  navigator.geolocation.getCurrentPosition(
    (position) => {
      sendLocationMessage(position, 'current');
      setStatus('Status: Location sent');
    },
    () => {
      setStatus('Status: Unable to fetch location.');
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

function startLiveLocation() {
  if (!selectedUser) {
    setStatus('Status: Select a user first, then share location.');
    return;
  }

  if (!navigator.geolocation) {
    setStatus('Status: Geolocation is not supported on this device.');
    return;
  }

  if (liveLocationWatchId !== null) return;

  setStatus('Status: Live location started');
  liveLocationWatchId = navigator.geolocation.watchPosition(
    (position) => {
      const now = Date.now();
      if (now - lastLiveLocationSentAt < 10000) return;
      lastLiveLocationSentAt = now;
      sendLocationMessage(position, 'live');
    },
    () => {
      setStatus('Status: Live location unavailable.');
      stopLiveLocation();
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
  );
}

function stopLiveLocation() {
  if (liveLocationWatchId !== null) {
    navigator.geolocation.clearWatch(liveLocationWatchId);
    liveLocationWatchId = null;
    lastLiveLocationSentAt = 0;
    setStatus('Status: Live location stopped');
  }
}

function openLocationModal() {
  if (!locationModal) return;
  if (toggleLiveLocationBtn) {
    toggleLiveLocationBtn.textContent =
      liveLocationWatchId !== null ? 'Stop Live Location' : 'Start Live Location';
  }
  locationModal.classList.remove('hidden');
}

function closeLocationModal() {
  if (!locationModal) return;
  locationModal.classList.add('hidden');
}

function toDisplayName(name) {
  const value = String(name || '').trim();
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function setSelectedUserDisplay(username, avatarUrl = '') {
  const displayName = username ? toDisplayName(username) : '';
  if (chatTitle) chatTitle.textContent = displayName || 'Select a user';
  selectedUserAvatarUrl = avatarUrl || '';

  if (!username) {
    selectedUserAvatar.innerHTML = '?';
    return;
  }

  if (selectedUserAvatarUrl) {
    selectedUserAvatar.innerHTML = `<img src="${escapeHtml(selectedUserAvatarUrl)}" alt="${escapeHtml(
      username
    )}" />`;
    return;
  }

  selectedUserAvatar.textContent = username.charAt(0).toUpperCase();
}

messageForm.addEventListener('submit', (e) => {
  e.preventDefault();

  const to = selectedUser;
  const text = messageInput.value.trim();

  if (!to) {
    setStatus('Status: Select a user from online list first.');
    return;
  }

  if (!text) return;

  socket.emit('chat:private', { to, text, messageType: 'text' });
  messageInput.value = '';
  if (emojiPicker) emojiPicker.classList.add('hidden');
});

initEmojiPicker();

if (locationToggle) {
  locationToggle.addEventListener('click', (event) => {
    event.preventDefault();
    openLocationModal();
  });
}

if (voiceToggle) {
  voiceToggle.addEventListener('click', (event) => {
    event.preventDefault();
    if (!selectedUser) {
      setStatus('Status: Select a user first, then record voice.');
      return;
    }
    openVoiceModal();
  });
}

if (startVoiceBtn) {
  startVoiceBtn.addEventListener('click', startVoiceRecording);
}

if (stopVoiceBtn) {
  stopVoiceBtn.addEventListener('click', stopVoiceRecording);
}

if (sendVoiceBtn) {
  sendVoiceBtn.addEventListener('click', sendVoiceMessage);
}

if (cancelVoiceBtn) {
  cancelVoiceBtn.addEventListener('click', closeVoiceModal);
}

if (voiceModal) {
  voiceModal.addEventListener('click', (event) => {
    if (event.target === voiceModal) {
      closeVoiceModal();
    }
  });
}

if (sendCurrentLocationBtn) {
  sendCurrentLocationBtn.addEventListener('click', () => {
    closeLocationModal();
    sendCurrentLocation();
  });
}

if (toggleLiveLocationBtn) {
  toggleLiveLocationBtn.addEventListener('click', () => {
    if (liveLocationWatchId !== null) {
      stopLiveLocation();
    } else {
      startLiveLocation();
    }
    closeLocationModal();
  });
}

if (cancelLocationBtn) {
  cancelLocationBtn.addEventListener('click', closeLocationModal);
}

if (locationModal) {
  locationModal.addEventListener('click', (event) => {
    if (event.target === locationModal) {
      closeLocationModal();
    }
  });
}

fileInput.addEventListener('change', () => {
  const file = fileInput.files && fileInput.files[0];
  if (!file) return;

  if (!selectedUser) {
    setStatus('Status: Select a user first, then choose file.');
    fileInput.value = '';
    return;
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    setStatus('Status: Max file size is 10MB.');
    fileInput.value = '';
    return;
  }

  openFilePreview(file);
});

previewSendBtn.addEventListener('click', async () => {
  if (!pendingFile) return;
  if (!selectedUser) {
    setStatus('Status: Select a user first, then send file.');
    closeFilePreview();
    return;
  }

  const fileToSend = pendingFile;
  const tempId = appendUploadingFileMessage(fileToSend.name, fileToSend.size);
  closeFilePreview();

  try {
    const uploaded = await uploadFileWithProgress(fileToSend, (percent) => {
      updateUploadingMessage(tempId, percent);
    });

    pendingUploadTempIds.push(tempId);
    socket.emit('chat:private', {
      to: selectedUser,
      messageType: 'file',
      file: {
        fileUrl: uploaded.fileUrl,
        fileName: uploaded.fileName,
        fileSize: uploaded.fileSize,
        fileMime: uploaded.fileMime
      }
    });

    setStatus('Status: File sent');
  } catch (error) {
    removeUploadingMessage(tempId);
    setStatus(`Status: ${error.message || 'File upload failed.'}`);
  }
});

previewCancelBtn.addEventListener('click', closeFilePreview);
filePreviewModal.addEventListener('click', (event) => {
  if (event.target === filePreviewModal) {
    closeFilePreview();
  }
});

socket.on('connect', () => {
  setStatus('Status: Connected');
});

socket.on('session:ready', ({ username }) => {
  setStatus(`Status: Connected as ${username}`);
});

function renderUsers(users) {
  usersList.innerHTML = '';
  const query = String(usersSearch ? usersSearch.value : '').trim().toLowerCase();

  users.forEach((user) => {
    if (String(user.username || '').toLowerCase().startsWith('debuguser')) {
      return;
    }
    if (Number(user.id) === myUserId || user.username === myUsername) {
      return;
    }
    if (query && !String(user.username || '').toLowerCase().includes(query)) {
      return;
    }

    const li = document.createElement('li');
    const label = user.username;
    const statusLabel = user.online ? 'online' : 'offline';
    li.innerHTML = `<span class="user-name">${escapeHtml(label)}</span><span class="user-status">${statusLabel}</span>`;
    li.classList.add(user.online ? 'user-online' : 'user-offline');

    if (user.username === selectedUser) {
      li.classList.add('active');
    }

    li.style.cursor = 'pointer';
    li.addEventListener('click', () => {
      selectedUser = user.username;
      setSelectedUserDisplay(selectedUser, user.avatarUrl || user.profileImage || '');
      Array.from(usersList.children).forEach((item) => item.classList.remove('active'));
      li.classList.add('active');
      socket.emit('chat:history', { withUser: selectedUser });
      socket.emit('chat:seen', { withUser: selectedUser });
    });

    usersList.appendChild(li);
  });
}

socket.on('users:update', ({ users }) => {
  cachedUsers = Array.isArray(users) ? users : [];
  renderUsers(cachedUsers);
});

if (usersSearch) {
  usersSearch.addEventListener('input', () => renderUsers(cachedUsers));
}

socket.on('chat:private', (message) => {
  const target = selectedUser;
  const isCurrentConversation =
    target &&
    ((message.from === myUsername && message.to === target) ||
      (message.from === target && message.to === myUsername));

  if (!isCurrentConversation) return;

  if ((message.messageType === 'file' || message.messageType === 'audio') && Number(message.fromId) === myUserId && pendingUploadTempIds.length) {
    const tempId = pendingUploadTempIds.shift();
    removeUploadingMessage(tempId);
  }

  appendMessage(message);

  const isIncomingFromSelected = Number(message.fromId) !== myUserId && message.from === target;
  if (isIncomingFromSelected) {
    socket.emit('chat:seen', { withUser: selectedUser });
  }
});

socket.on('chat:history', ({ messages: history }) => {
  messages.innerHTML = '';
  history.forEach(appendMessage);
  if (selectedUser) {
    socket.emit('chat:seen', { withUser: selectedUser });
  }
});

socket.on('chat:error', ({ message }) => {
  setStatus(`Status: ${message}`);
});

socket.on('chat:deleted', ({ messageId, scope }) => {
  const row = messages.querySelector(`li[data-message-id="${messageId}"]`);
  if (!row) return;

  if (scope === 'everyone') {
    markMessageAsDeleted(row);
  } else {
    row.remove();
  }
});

socket.on('chat:read', ({ messageIds }) => {
  if (!Array.isArray(messageIds) || !messageIds.length) return;

  messageIds.forEach((id) => {
    const row = messages.querySelector(`li[data-message-id="${id}"]`);
    if (!row) return;
    row.dataset.read = 'true';
    const tick = row.querySelector('.msg-tick');
    if (tick) {
      tick.textContent = '✓✓';
      tick.classList.add('read');
    }
  });
});

socket.on('connect_error', () => {
  setStatus('Status: Unauthorized socket session. Please login again.');
});

messages.addEventListener('click', (event) => {
  const deleteBtn = event.target.closest('.delete-btn');
  if (!deleteBtn) return;

  const messageId = Number(deleteBtn.dataset.messageId);
  if (!messageId) return;

  const row = deleteBtn.closest('li');
  const isDeletedMarker = row && row.dataset.deleted === 'true';

  if (isDeletedMarker) {
    socket.emit('chat:delete', { messageId, scope: 'me' });
    return;
  }

  const isOwnMessage = deleteBtn.dataset.isOwn === 'true';
  openDeleteModal({ messageId, isOwnMessage });
});

function appendMessage(message) {
  const li = document.createElement('li');
  const time = message.displayTime || istTimeFormatter.format(parseTimestamp(message.timestamp));
  const isOwnMessage = Number(message.fromId) === myUserId || message.from === 'you';
  li.className = isOwnMessage ? 'sent' : 'received';
  li.dataset.messageId = String(message.id);
  li.dataset.isOwn = String(isOwnMessage);
  li.dataset.time = time;
  li.dataset.read = String(Boolean(message.readAt));

  if (message.isDeleted) {
    markMessageAsDeleted(li);
  } else {
    const tickMarkup = isOwnMessage
      ? `<span class="msg-tick${message.readAt ? ' read' : ''}">${message.readAt ? '✓✓' : '✓'}</span>`
      : '';

    const bodyMarkup = message.messageType === 'file'
      ? `<a class="file-link" href="${escapeHtml(message.fileUrl)}" target="_blank" rel="noopener noreferrer" download="${escapeHtml(message.fileName || 'file')}">📎 ${escapeHtml(message.fileName || 'File')}</a><div class="file-meta">${escapeHtml(formatBytes(message.fileSize))}</div>`
      : message.messageType === 'audio'
        ? `<audio class="voice-player" controls src="${escapeHtml(message.fileUrl || '')}"></audio><div class="file-meta">🎤 Voice message</div>`
      : message.messageType === 'location'
        ? `<a class="file-link" href="${escapeHtml(
            message.locationUrl || message.text
          )}" target="_blank" rel="noopener noreferrer">📍 ${escapeHtml(
            message.locationMode === 'live' ? 'Live location' : 'Current location'
          )}</a><div class="file-meta">${escapeHtml(
            (message.locationLat && message.locationLng)
              ? `${message.locationLat.toFixed(5)}, ${message.locationLng.toFixed(5)}`
              : ''
          )}</div>`
      : `<div class="msg-text">${escapeHtml(message.text)}</div>`;

    li.innerHTML =
      `${bodyMarkup}` +
      `<div class="msg-meta"><span class="msg-time">${time}</span>${tickMarkup}` +
      `<button type="button" class="delete-btn" data-message-id="${message.id}" data-is-own="${isOwnMessage}" aria-label="Message options">..</button></div>`;
  }

  messages.appendChild(li);
  messages.scrollTop = messages.scrollHeight;
}

function appendUploadingFileMessage(fileName, fileSize) {
  const tempId = `temp-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const li = document.createElement('li');
  li.className = 'sent uploading';
  li.dataset.tempId = tempId;
  li.innerHTML =
    `<div class="msg-text">📎 ${escapeHtml(fileName)}</div>` +
    `<div class="uploading-text">Uploading ${escapeHtml(formatBytes(fileSize))}</div>` +
    `<div class="file-progress"><span style="width:0%"></span></div>`;

  messages.appendChild(li);
  messages.scrollTop = messages.scrollHeight;
  return tempId;
}

function updateUploadingMessage(tempId, percent) {
  const row = messages.querySelector(`li[data-temp-id="${tempId}"]`);
  if (!row) return;
  const bar = row.querySelector('.file-progress > span');
  if (bar) {
    bar.style.width = `${Math.min(100, Math.max(0, percent))}%`;
  }
}

function removeUploadingMessage(tempId) {
  const row = messages.querySelector(`li[data-temp-id="${tempId}"]`);
  if (row) row.remove();
}

function openFilePreview(file) {
  pendingFile = file;
  previewFileName.textContent = file.name;
  previewFileMeta.textContent = `${formatBytes(file.size)} • ${file.type || 'Unknown type'}`;

  if (file.type && file.type.startsWith('image/')) {
    pendingPreviewUrl = URL.createObjectURL(file);
    previewImage.src = pendingPreviewUrl;
    previewImage.classList.remove('hidden');
  } else {
    previewImage.src = '';
    previewImage.classList.add('hidden');
  }

  filePreviewModal.classList.remove('hidden');
}

function closeFilePreview() {
  pendingFile = null;
  if (pendingPreviewUrl) {
    URL.revokeObjectURL(pendingPreviewUrl);
    pendingPreviewUrl = '';
  }
  previewImage.src = '';
  previewImage.classList.add('hidden');
  fileInput.value = '';
  filePreviewModal.classList.add('hidden');
}

function uploadFileWithProgress(file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload', true);

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const percent = Math.round((event.loaded / event.total) * 100);
      onProgress(percent);
    };

    xhr.onload = () => {
      let payload = {};
      try {
        payload = JSON.parse(xhr.responseText || '{}');
      } catch (error) {
        payload = {};
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(payload);
      } else {
        reject(new Error(payload.message || 'File upload failed.'));
      }
    };

    xhr.onerror = () => reject(new Error('Network error during file upload.'));

    const formData = new FormData();
    formData.append('file', file);
    xhr.send(formData);
  });
}

function markMessageAsDeleted(li) {
  const isOwnMessage = li.dataset.isOwn === 'true';
  const time = li.dataset.time || '';
  const messageId = li.dataset.messageId;
  li.dataset.deleted = 'true';
  li.classList.add('deleted');
  li.innerHTML =
    `<div class="msg-text deleted-text">This message was deleted</div>` +
    `<div class="msg-meta"><span class="msg-time">${time}</span>` +
    `<button type="button" class="delete-btn" data-message-id="${messageId}" data-is-own="${isOwnMessage}" aria-label="Delete deleted marker">..</button></div>`;
  li.classList.remove('sent', 'received');
  li.classList.add(isOwnMessage ? 'sent' : 'received');
}

function openDeleteModal(data) {
  pendingDelete = data;
  deleteEveryoneBtn.disabled = !data.isOwnMessage;
  deleteModal.classList.remove('hidden');
}

function closeDeleteModal() {
  pendingDelete = null;
  deleteModal.classList.add('hidden');
}

deleteEveryoneBtn.addEventListener('click', () => {
  if (!pendingDelete) return;
  socket.emit('chat:delete', { messageId: pendingDelete.messageId, scope: 'everyone' });
  closeDeleteModal();
});

deleteMeBtn.addEventListener('click', () => {
  if (!pendingDelete) return;
  socket.emit('chat:delete', { messageId: pendingDelete.messageId, scope: 'me' });
  closeDeleteModal();
});

cancelDeleteBtn.addEventListener('click', closeDeleteModal);

deleteModal.addEventListener('click', (event) => {
  if (event.target === deleteModal) {
    closeDeleteModal();
  }
});

window.addEventListener('beforeunload', () => {
  stopLiveLocation();
  stopVoiceTracks();
});
