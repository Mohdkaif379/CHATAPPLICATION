const socket = io();

const messageForm = document.getElementById('messageForm');
const statusText = document.getElementById('statusText');
const usersList = document.getElementById('usersList');
const usersSearch = document.getElementById('usersSearch');
const messages = document.getElementById('messages');
const chatTitle = document.getElementById('chatTitle');
const selectedUserText = document.getElementById('selectedUserText');
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

const createGroupModal = document.getElementById('createGroupModal');
const groupNameInput = document.getElementById('groupNameInput');
const groupMembersList = document.getElementById('groupMembersList');
const submitCreateGroupBtn = document.getElementById('submitCreateGroupBtn');
const cancelCreateGroupBtn = document.getElementById('cancelCreateGroupBtn');
const groupsList = document.getElementById('groupsList');
const chatHeaderInfo = document.getElementById('chatHeaderInfo');
const groupInfoModal = document.getElementById('groupInfoModal');

const infoGroupName = document.getElementById('infoGroupName');
const infoGroupMembersList = document.getElementById('infoGroupMembersList');
const exitGroupBtn = document.getElementById('exitGroupBtn');
const addMemberBtn = document.getElementById('addMemberBtn');
const addMemberModal = document.getElementById('addMemberModal');
const addMemberUsersList = document.getElementById('addMemberUsersList');
const cancelAddMemberBtn = document.getElementById('cancelAddMemberBtn');
const closeInfoBtn = document.getElementById('closeInfoBtn');
const adminControls = document.getElementById('adminControls');
const adminOnlyMsgCheck = document.getElementById('adminOnlyMsgCheck');



const myUserId = Number(window.APP_USER.id || 0);
const myUsername = String(window.APP_USER.username || '').toLowerCase();
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

let selectedUser = '';
let selectedGroup = null;
let selectedUserAvatarUrl = '';
let pendingDelete = null;
let cachedUsers = [];
let cachedGroups = [];

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

function initProfileDropdown() {
  const profileToggle = document.getElementById('profileToggle');
  const profileDropdown = document.getElementById('profileDropdown');
  const openSettingsBtn = document.getElementById('openSettingsBtn');
  const createGroupBtn = document.getElementById('createGroupBtn');

  if (!profileToggle || !profileDropdown) return;

  profileToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    profileDropdown.classList.toggle('hidden');
    profileToggle.classList.toggle('active');
  });

  document.addEventListener('click', (e) => {
    if (!profileToggle.contains(e.target)) {
      profileDropdown.classList.add('hidden');
      profileToggle.classList.remove('active');
    }
  });

  if (openSettingsBtn) {
    openSettingsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      profileDropdown.classList.add('hidden');
      profileToggle.classList.remove('active');
      alert('Settings clicked');
    });
  }

  if (createGroupBtn) {
    createGroupBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      profileDropdown.classList.add('hidden');
      profileToggle.classList.remove('active');
      openCreateGroupModal();
    });
  }


  const dropdownLogoutBtn = document.getElementById('dropdownLogoutBtn');
  const logoutForm = document.getElementById('logoutForm');
  if (dropdownLogoutBtn && logoutForm) {
    dropdownLogoutBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      logoutForm.submit();
    });
  }
}
function openCreateGroupModal() {
  groupMembersList.innerHTML = '';
  cachedUsers.forEach(user => {
    if (Number(user.id) === myUserId) return;
    if (String(user.username || '').toLowerCase().startsWith('debuguser')) return;
    const li = document.createElement('li');
    li.innerHTML = `
      <input type="checkbox" id="user-${user.id}" value="${user.id}">
      <label for="user-${user.id}">${escapeHtml(user.username)}</label>
    `;
    groupMembersList.appendChild(li);
  });
  createGroupModal.classList.remove('hidden');
}


function closeCreateGroupModal() {
  createGroupModal.classList.add('hidden');
  groupNameInput.value = '';
}

if (cancelCreateGroupBtn) {
  cancelCreateGroupBtn.addEventListener('click', closeCreateGroupModal);
}

if (submitCreateGroupBtn) {
  submitCreateGroupBtn.addEventListener('click', () => {
    const name = groupNameInput.value.trim();
    const selectedCheckboxes = groupMembersList.querySelectorAll('input[type="checkbox"]:checked');
    const memberIds = Array.from(selectedCheckboxes).map(cb => Number(cb.value));

    if (!name) {
      alert('Please enter a group name.');
      return;
    }

    if (memberIds.length === 0) {
      alert('Please select at least one member.');
      return;
    }

    socket.emit('group:create', { name, memberIds });
    closeCreateGroupModal();
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
  if (!selectedUser && !selectedGroup) {
    setStatus('Status: Select a chat first, then send voice.');
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
    if (selectedGroup) {
        socket.emit('group:message', {
            groupId: selectedGroup.id,
            messageType: 'audio',
            file: {
              fileUrl: uploaded.fileUrl,
              fileName: uploaded.fileName || fileName,
              fileSize: uploaded.fileSize || file.size,
              fileMime: uploaded.fileMime || file.type
            }
        });
    } else {
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
    }
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

  if (selectedGroup) {
      socket.emit('group:message', {
          groupId: selectedGroup.id,
          messageType: 'location',
          location: { lat, lng, url, mode }
      });
  } else {
      socket.emit('chat:private', {
        to: selectedUser,
        messageType: 'location',
        location: { lat, lng, url, mode }
      });
  }
}

function sendCurrentLocation() {
  if (!selectedUser && !selectedGroup) {
    setStatus('Status: Select a chat first, then share location.');
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
  if (!selectedUser && !selectedGroup) {
    setStatus('Status: Select a chat first, then share location.');
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

function updateSelectedUserStatusText() {
  if (!selectedUserText) return;

  if (selectedGroup || !selectedUser) {
    selectedUserText.textContent = '';
    return;
  }

  const match = cachedUsers.find(
    (user) => String(user.username || '').toLowerCase() === String(selectedUser || '').toLowerCase()
  );

  if (!match) {
    selectedUserText.textContent = '';
    return;
  }

  selectedUserText.textContent = match.online ? 'online' : 'offline';
}

function setSelectedChatDisplay(name, isGroup = false, avatarUrl = '') {
  const displayName = name ? toDisplayName(name) : '';
  if (chatTitle) chatTitle.textContent = displayName || 'Select a chat';
  selectedUserAvatarUrl = avatarUrl || '';

  if (chatHeaderInfo) {
    if (isGroup) chatHeaderInfo.classList.add('interactive');
    else chatHeaderInfo.classList.remove('interactive');
  }

  // Check group membership and Admin-Only Messaging setting for UI lockdown
  const isMember = isGroup ? cachedGroups.some(g => g.id === selectedGroup.id) : true;
  const isAdminOnly = isGroup && selectedGroup.admins_only_messages;
  const groupInCache = isGroup ? cachedGroups.find(g => g.id === selectedGroup.id) : null;
  const isAdmin = isGroup && groupInCache && groupInCache.is_admin;

  if (messageInput) {
      if (!isMember) {
          messageInput.disabled = true;
          messageInput.placeholder = "You are no longer a member of this group.";
      } else if (isAdminOnly && !isAdmin) {
          messageInput.disabled = true;
          messageInput.placeholder = "Only admin can send messages.";
      } else {
          messageInput.disabled = false;
          messageInput.placeholder = "Write a message...";
      }
  }

  // Update media buttons
  const mediaButtons = [locationToggle, voiceToggle, emojiToggle, fileInput];
  mediaButtons.forEach(btn => {
      if (btn) {
          if (!isMember || (isAdminOnly && !isAdmin)) {
              btn.style.pointerEvents = 'none';
              btn.style.opacity = '0.5';
              if (btn.tagName === 'INPUT') btn.disabled = true;
          } else {
              btn.style.pointerEvents = 'auto';
              btn.style.opacity = '1';
              if (btn.tagName === 'INPUT') btn.disabled = false;
          }
      }
  });

  if (!name) {
    selectedUserAvatar.innerHTML = '?';
    updateSelectedUserStatusText();
    return;
  }

  if (isGroup) {
    selectedUserAvatar.innerHTML = `<div class="group-icon"><i class="fa-solid fa-user-group"></i></div>`;
    updateSelectedUserStatusText();
    return;
  }

  if (selectedUserAvatarUrl) {
    selectedUserAvatar.innerHTML = `<img src="${escapeHtml(selectedUserAvatarUrl)}" alt="${escapeHtml(
      name
    )}" />`;
    updateSelectedUserStatusText();
    return;
  }

  selectedUserAvatar.textContent = name.charAt(0).toUpperCase();
  updateSelectedUserStatusText();
}

messageForm.addEventListener('submit', (e) => {
  e.preventDefault();

  const text = messageInput.value.trim();

  if (!selectedUser && !selectedGroup) {
    setStatus('Status: Select a user or group from sidebar first.');
    return;
  }

  if (!text) return;

  if (selectedGroup) {
      socket.emit('group:message', { groupId: selectedGroup.id, text, messageType: 'text' });
  } else {
      socket.emit('chat:private', { to: selectedUser, text, messageType: 'text' });
  }
  
  messageInput.value = '';
  socket.emit(selectedGroup ? 'group:typing' : 'chat:typing', {
      to: selectedUser,
      groupId: selectedGroup ? selectedGroup.id : null,
      isTyping: false
  });
  if (emojiPicker) emojiPicker.classList.add('hidden');
});

let typingTimeout = null;
messageInput.addEventListener('input', () => {
    if (!selectedUser && !selectedGroup) return;

    socket.emit(selectedGroup ? 'group:typing' : 'chat:typing', {
        to: selectedUser,
        groupId: selectedGroup ? selectedGroup.id : null,
        isTyping: true
    });

    if (typingTimeout) clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        socket.emit(selectedGroup ? 'group:typing' : 'chat:typing', {
            to: selectedUser,
            groupId: selectedGroup ? selectedGroup.id : null,
            isTyping: false
        });
    }, 2000);
});


initEmojiPicker();
initProfileDropdown();

if (locationToggle) {
  locationToggle.addEventListener('click', (event) => {
    event.preventDefault();
    openLocationModal();
  });
}

if (voiceToggle) {
  voiceToggle.addEventListener('click', (event) => {
    event.preventDefault();
    if (!selectedUser && !selectedGroup) {
      setStatus('Status: Select a chat first, then record voice.');
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

  if (!selectedUser && !selectedGroup) {
    setStatus('Status: Select a chat first, then choose file.');
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
  if (!selectedUser && !selectedGroup) {
    setStatus('Status: Select a chat first, then send file.');
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
    if (selectedGroup) {
        socket.emit('group:message', {
          groupId: selectedGroup.id,
          messageType: 'file',
          file: {
            fileUrl: uploaded.fileUrl,
            fileName: uploaded.fileName || fileToSend.name,
            fileSize: uploaded.fileSize || fileToSend.size,
            fileMime: uploaded.fileMime || fileToSend.type
          }
        });
    } else {
        socket.emit('chat:private', {
          to: selectedUser,
          messageType: 'file',
          file: {
            fileUrl: uploaded.fileUrl,
            fileName: uploaded.fileName || fileToSend.name,
            fileSize: uploaded.fileSize || fileToSend.size,
            fileMime: uploaded.fileMime || fileToSend.type
          }
        });
    }

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

socket.on('chat:typing', ({ from, isTyping }) => {
    if (from !== selectedUser) return;
    updateTypingStatusUI(from, isTyping);
});

socket.on('group:typing', ({ groupId, from, isTyping }) => {
    if (!selectedGroup || selectedGroup.id !== groupId) return;
    updateTypingStatusUI(from, isTyping, true);
});

function updateTypingStatusUI(from, isTyping, isGroup = false) {
    if (!selectedUserText) return;

    if (isTyping) {
        selectedUserText.textContent = isGroup ? `${toDisplayName(from)} typing...` : 'typing...';
        return;
    }

    // Typing stopped -> show normal "online/offline" again (or blank for groups)
    updateSelectedUserStatusText();
}

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
      selectedGroup = null;
      setSelectedChatDisplay(selectedUser, false, user.avatarUrl || user.profileImage || '');
      Array.from(usersList.children).forEach((item) => item.classList.remove('active'));
      if (groupsList) Array.from(groupsList.children).forEach((item) => item.classList.remove('active'));
      li.classList.add('active');
      updateSelectedUserStatusText();
      socket.emit('chat:history', { withUser: selectedUser });
      socket.emit('chat:seen', { withUser: selectedUser });
    });

    usersList.appendChild(li);
  });
}

function renderGroups(groups) {
  if (!groupsList) return;
  groupsList.innerHTML = '';
  groups.forEach((group) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <div class="group-icon"><i class="fa-solid fa-user-group"></i></div>
      <span class="user-name">${escapeHtml(group.name)}</span>
    `;
    if (selectedGroup && selectedGroup.id === group.id) {
      li.classList.add('active');
    }
    li.addEventListener('click', () => {
      selectedUser = '';
      selectedGroup = group;
      setSelectedChatDisplay(group.name, true);
      Array.from(usersList.children).forEach((item) => item.classList.remove('active'));
      Array.from(groupsList.children).forEach((item) => item.classList.remove('active'));
      li.classList.add('active');
      updateSelectedUserStatusText();
      socket.emit('group:history', { groupId: group.id });
    });
    groupsList.appendChild(li);
  });
}


socket.on('users:update', ({ users, groups }) => {
  cachedUsers = Array.isArray(users) ? users : [];
  renderUsers(cachedUsers);
  updateSelectedUserStatusText();
  if (groups) {
      cachedGroups = Array.isArray(groups) ? groups : [];
      renderGroups(cachedGroups);
      
      if (selectedGroup) {
          const groupStillExists = cachedGroups.some(g => g.id === selectedGroup.id);
          if (!groupStillExists) {
              selectedGroup = null;
              setSelectedChatDisplay('', false);
              messages.innerHTML = '';
          } else {
              setSelectedChatDisplay(selectedGroup.name, true);
          }
      }
  }
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

socket.on('group:message', (message) => {
    if (!selectedGroup || selectedGroup.id !== message.groupId) return;

    if ((message.messageType === 'file' || message.messageType === 'audio') && Number(message.fromId) === myUserId && pendingUploadTempIds.length) {
        const tempId = pendingUploadTempIds.shift();
        removeUploadingMessage(tempId);
    }

    appendMessage(message);
});


socket.on('chat:history', ({ messages: history }) => {
  messages.innerHTML = '';
  history.forEach(appendMessage);
  if (selectedUser) {
    socket.emit('chat:seen', { withUser: selectedUser });
  }
});

socket.on('group:history', ({ messages: history }) => {
    messages.innerHTML = '';
    history.forEach(appendMessage);
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

socket.on('group:deleted', ({ messageId, scope }) => {
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
    if (selectedGroup) {
        socket.emit('group:delete', { messageId, scope: 'me' });
    } else {
        socket.emit('chat:delete', { messageId, scope: 'me' });
    }
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
    const tickMarkup = (isOwnMessage && !selectedGroup)
      ? `<span class="msg-tick${message.readAt ? ' read' : ''}">${message.readAt ? '✓✓' : '✓'}</span>`
      : '';

    const senderMarkup = (selectedGroup && !isOwnMessage)
      ? `<div class="msg-sender">${escapeHtml(message.from)}</div>`
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
      (message.messageType === 'system')
      ? `<div class="msg-system">${escapeHtml(message.text)}</div>`
      : `${senderMarkup}${bodyMarkup}` +
        `<div class="msg-meta"><span class="msg-time">${time}</span>${tickMarkup}` +
        `<button type="button" class="delete-btn" data-message-id="${message.id}" data-is-own="${isOwnMessage}" aria-label="Message options">..</button></div>`;
    
    if (message.messageType === 'system') {
        li.className = 'msg-system-wrap';
    }
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
  if (selectedGroup) {
      socket.emit('group:delete', { messageId: pendingDelete.messageId, scope: 'everyone' });
  } else {
      socket.emit('chat:delete', { messageId: pendingDelete.messageId, scope: 'everyone' });
  }
  closeDeleteModal();
});

deleteMeBtn.addEventListener('click', () => {
  if (!pendingDelete) return;
  if (selectedGroup) {
      socket.emit('group:delete', { messageId: pendingDelete.messageId, scope: 'me' });
  } else {
      socket.emit('chat:delete', { messageId: pendingDelete.messageId, scope: 'me' });
  }
  closeDeleteModal();
});


cancelDeleteBtn.addEventListener('click', closeDeleteModal);

function openGroupInfoModal() {
  if (!selectedGroup) return;
  infoGroupName.textContent = selectedGroup.name;
  infoGroupMembersList.innerHTML = '<li class="muted">Loading members...</li>';
  
  socket.emit('group:members:get', { groupId: selectedGroup.id });
  
  // Only show exit button if user is still a member
  const isMember = cachedGroups.some(g => g.id === selectedGroup.id);
  if (exitGroupBtn) {
      if (isMember) exitGroupBtn.classList.remove('hidden');
      else exitGroupBtn.classList.add('hidden');
  }

  // Show admin controls if current user is an admin
  if (adminControls) {
      const groupInCache = cachedGroups.find(g => g.id === selectedGroup.id);
      if (groupInCache && groupInCache.is_admin) {
          adminControls.classList.remove('hidden');
          if (adminOnlyMsgCheck) {
              adminOnlyMsgCheck.checked = !!selectedGroup.admins_only_messages;
          }
      } else {
          adminControls.classList.add('hidden');
      }
  }

  createGroupModal.classList.add('hidden');
  groupInfoModal.classList.remove('hidden');
  
  // Update avatar icon if available
  const infoGroupAvatar = document.getElementById('infoGroupAvatar');
  if (infoGroupAvatar) {
      infoGroupAvatar.innerHTML = `<i class="fa-solid fa-user-group"></i>`;
  }
}

socket.on('group:members:list', ({ members }) => {
    infoGroupMembersList.innerHTML = '';
    // Store current members for filtering later
    if (selectedGroup) {
        selectedGroup.members = members;
    }
    const groupInCache = cachedGroups.find(g => g.id === selectedGroup.id);
    const isAdmin = groupInCache && groupInCache.is_admin;

    members.forEach(member => {
        if (String(member.username || '').toLowerCase().startsWith('debuguser')) return;
        const li = document.createElement('li');
        li.className = 'member-item';
        
        let actionButtonsHtml = '<div class="member-actions">';
        if (isAdmin && Number(member.id) !== myUserId) {
            if (!member.is_admin) {
                actionButtonsHtml += `<button type="button" class="promote-member-btn" data-user-id="${member.id}" title="Make Admin"><i class="fa-solid fa-user-shield"></i></button>`;
            }
            actionButtonsHtml += `<button type="button" class="remove-member-btn" data-user-id="${member.id}" title="Remove Member"><i class="fa-solid fa-user-minus"></i></button>`;
        } else if (member.is_admin) {
            actionButtonsHtml += `<span class="admin-badge">Admin</span>`;
        }
        actionButtonsHtml += '</div>';

        li.innerHTML = `
            <span class="user-name">${escapeHtml(member.username)}</span>
            ${actionButtonsHtml}
        `;
        infoGroupMembersList.appendChild(li);
    });
});

function closeGroupInfoModal() {
  groupInfoModal.classList.add('hidden');
}

function openAddMemberModal() {
  if (!selectedGroup) return;
  addMemberUsersList.innerHTML = '';
  
  const currentMemberIds = (selectedGroup.members || []).map(m => Number(m.id));
  
  cachedUsers.forEach(user => {
    if (Number(user.id) === myUserId) return;
    if (String(user.username || '').toLowerCase().startsWith('debuguser')) return;
    if (currentMemberIds.includes(Number(user.id))) return;
    
    const li = document.createElement('li');
    li.innerHTML = `
      <span class="user-name">${escapeHtml(user.username)}</span>
      <button type="button" class="modal-btn small-btn add-this-user" data-user-id="${user.id}">Add</button>
    `;
    li.style.display = 'flex';
    li.style.justifyContent = 'space-between';
    li.style.alignItems = 'center';
    
    const addBtn = li.querySelector('.add-this-user');
    addBtn.onclick = () => {
        socket.emit('group:member:add', { groupId: selectedGroup.id, targetUserId: user.id });
        closeAddMemberModal();
    };
    
    addMemberUsersList.appendChild(li);
  });
  
  addMemberModal.classList.remove('hidden');
}

function closeAddMemberModal() {
    addMemberModal.classList.add('hidden');
}

if (chatHeaderInfo) {
  chatHeaderInfo.addEventListener('click', () => {
    if (selectedGroup) openGroupInfoModal();
  });
}


if (closeInfoBtn) {
  closeInfoBtn.addEventListener('click', closeGroupInfoModal);
}

if (addMemberBtn) {
    addMemberBtn.onclick = openAddMemberModal;
}

if (cancelAddMemberBtn) {
    cancelAddMemberBtn.onclick = closeAddMemberModal;
}

if (exitGroupBtn) {
  exitGroupBtn.addEventListener('click', () => {
    if (!selectedGroup) return;
    if (confirm(`Are you sure you want to leave ${selectedGroup.name}?`)) {
      socket.emit('group:leave', { groupId: selectedGroup.id });
      closeGroupInfoModal();
      selectedGroup = null;
      setSelectedChatDisplay('', false);
      messages.innerHTML = '';
    }
  });
}

deleteModal.addEventListener('click', (event) => {

  if (event.target === deleteModal) {
    closeDeleteModal();
  }
});

window.addEventListener('beforeunload', () => {
  stopLiveLocation();
  stopVoiceTracks();
});

if (adminOnlyMsgCheck) {
    adminOnlyMsgCheck.addEventListener('change', () => {
        if (!selectedGroup) return;
        const adminsOnlyMessages = adminOnlyMsgCheck.checked;
        socket.emit('group:settings:update', { 
            groupId: selectedGroup.id, 
            adminsOnlyMessages 
        });
    });
}

socket.on('group:settings:updated', ({ groupId, adminsOnlyMessages }) => {
    // Update cached groups
    const group = cachedGroups.find(g => g.id === groupId);
    if (group) {
        group.admins_only_messages = adminsOnlyMessages;
    }
    
    // If currently viewing this group, refresh UI
    if (selectedGroup && selectedGroup.id === groupId) {
        selectedGroup.admins_only_messages = adminsOnlyMessages;
        setSelectedChatDisplay(selectedGroup.name, true);
        
        // Also update info modal state if open
        if (!groupInfoModal.classList.contains('hidden')) {
            if (adminOnlyMsgCheck) {
                adminOnlyMsgCheck.checked = adminsOnlyMessages;
            }
        }
    }
});

socket.on('group:member:removed', ({ groupId }) => {
    if (selectedGroup && selectedGroup.id === groupId) {
        selectedGroup = null;
        setSelectedChatDisplay('', false);
        messages.innerHTML = '';
        alert('You have been removed from this group.');
    }
});

if (infoGroupMembersList) {
    infoGroupMembersList.addEventListener('click', (e) => {
        const removeBtn = e.target.closest('.remove-member-btn');
        const promoteBtn = e.target.closest('.promote-member-btn');
        
        if (removeBtn) {
            const targetUserId = removeBtn.dataset.userId;
            if (!selectedGroup || !targetUserId) return;
            
            if (confirm(`Are you sure you want to remove this member?`)) {
                socket.emit('group:member:remove', { 
                    groupId: selectedGroup.id, 
                    targetUserId: Number(targetUserId) 
                });
            }
        } else if (promoteBtn) {
            const targetUserId = promoteBtn.dataset.userId;
            if (!selectedGroup || !targetUserId) return;
            
            if (confirm(`Make this user an Admin? they will have full control over settings and members.`)) {
                socket.emit('group:member:promote', { 
                    groupId: selectedGroup.id, 
                    targetUserId: Number(targetUserId) 
                });
            }
        }
    });
}

socket.on('group:member:promoted', ({ groupId, targetUserId }) => {
    // Update local cache
    if (Number(targetUserId) === myUserId) {
        const group = cachedGroups.find(g => g.id === groupId);
        if (group) group.is_admin = true;
    }
    
    // Refresh UI if viewing this group
    if (selectedGroup && selectedGroup.id === groupId) {
        setSelectedChatDisplay(selectedGroup.name, true);
        if (!groupInfoModal.classList.contains('hidden')) {
            openGroupInfoModal();
        }
    }
});
