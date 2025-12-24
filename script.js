// State
let data = [];
let filtered = [];
let selected = null;
let page = 0;
const PAGE_SIZE = 50;

// DOM
const fileInput = document.getElementById('fileInput');
const empty = document.getElementById('empty');
const items = document.getElementById('items');
const detail = document.getElementById('detail');
const filters = document.getElementById('filters');
const stats = document.getElementById('stats');
const search = document.getElementById('search');
const sort = document.getElementById('sort');
const listHeader = document.getElementById('listHeader');
const listTitle = document.getElementById('listTitle');
const loadMore = document.getElementById('loadMore');
const btnLoad = document.getElementById('btnLoad');
const loading = document.getElementById('loading');
const exportBtn = document.getElementById('exportAnnotations');

// Filter elements
const filterAnnotationCheckboxes = document.querySelectorAll('.filter-annotation-checkbox');
const filterOrgId = document.getElementById('filterOrgId');
const filterPlatform = document.getElementById('filterPlatform');
const filterStatus = document.getElementById('filterStatus');
const filterLanguage = document.getElementById('filterLanguage');
const filterMessages = document.getElementById('filterMessages');
const filterDuration = document.getElementById('filterDuration');
const filterLabel = document.getElementById('filterLabel');
const clearFilters = document.getElementById('clearFilters');
const exportAnnotationsBtn = document.getElementById('exportAnnotations');

// Events
fileInput.addEventListener('change', handleFile);
search.addEventListener('input', debounce(applyFilters, 300));
sort.addEventListener('change', applySort);
btnLoad.addEventListener('click', loadMoreItems);

// Filter events
filterAnnotationCheckboxes.forEach(cb => cb.addEventListener('change', applyFilters));
filterOrgId.addEventListener('change', applyFilters);
filterPlatform.addEventListener('change', applyFilters);
filterStatus.addEventListener('change', applyFilters);
filterLanguage.addEventListener('change', applyFilters);
filterMessages.addEventListener('change', applyFilters);
filterDuration.addEventListener('change', applyFilters);
filterLabel.addEventListener('change', applyFilters);
clearFilters.addEventListener('click', resetFilters);

// Export button
if (exportAnnotationsBtn) {
    exportAnnotationsBtn.addEventListener('click', exportAnnotations);
}

// File Handler
async function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;

    showLoading();

    try {
        const text = await file.text();
        const json = JSON.parse(text);
        const rawData = Array.isArray(json) ? json : [json];

        // Merge conversations with same conversation_id
        const conversationMap = new Map();

        rawData.forEach(item => {
            const convId = item.conversation_id;

            if (conversationMap.has(convId)) {
                // Merge with existing conversation
                const existing = conversationMap.get(convId);

                // Merge messages (combine and sort by time)
                const allMessages = [...(existing.messages || []), ...(item.messages || [])];
                // Sort by time and deduplicate
                const uniqueMessages = Array.from(
                    new Map(allMessages.map(msg => [msg.time + msg.from + msg.text, msg])).values()
                ).sort((a, b) => new Date(a.time) - new Date(b.time));

                // Update conversation with merged data
                existing.messages = uniqueMessages;

                // Use earliest start_time and latest end_time
                if (item.start_time && (!existing.start_time || new Date(item.start_time) < new Date(existing.start_time))) {
                    existing.start_time = item.start_time;
                }
                if (item.end_time && (!existing.end_time || new Date(item.end_time) > new Date(existing.end_time))) {
                    existing.end_time = item.end_time;
                }

                // Keep other fields from the latest item (or merge as needed)
                existing.status = item.status || existing.status;
                existing.platform = item.platform || existing.platform;
                existing.language = item.language || existing.language;
                existing.org_id = item.org_id || existing.org_id;

            } else {
                // First occurrence of this conversation_id
                conversationMap.set(convId, { ...item });
            }
        });

        // Convert map back to array
        const mergedData = Array.from(conversationMap.values());

        console.log(`📊 Merged: ${rawData.length} items → ${mergedData.length} unique conversations`);
        if (rawData.length > mergedData.length) {
            console.log(`✓ Combined ${rawData.length - mergedData.length} duplicate conversation IDs`);
        }

        // Process
        data = mergedData.map((item, i) => ({
            ...item,
            _index: i,
            _duration: calcDuration(item.start_time, item.end_time),
            _count: (item.messages || []).length,
            _avgResponse: calcAvgResponse(item.messages || []),
            labels: item.labels || [] // Initialize empty labels array
        }));

        filtered = [...data];

        // UI first - show data immediately
        empty.style.display = 'none';
        filters.style.display = 'flex';
        listHeader.style.display = 'flex';

        if (exportBtn) {
            exportBtn.style.display = 'flex';
        }

        updateStats();
        populateFilters();
        page = 0;
        items.innerHTML = '';
        renderItems();

        // Import into IndexedDB in background (non-blocking)
        if (window.dbReady) {
            console.log('⏳ Background: Importing to DB...');
            conversationDB.importConversations(data).then(async () => {
                console.log('✅ Background: Import complete');
                await syncAllAnnotations();
                await updateLabelFilterOptions();

                const progressSection = document.getElementById('progressSection');
                if (progressSection) {
                    progressSection.style.display = 'block';
                }

                // Re-render to show annotations
                page = 0;
                items.innerHTML = '';
                renderItems();
            }).catch(err => {
                console.error('❌ Background import failed:', err);
            });
        }

        // Apply restored session if exists
        if (window.applyRestoredSession) {
            applyRestoredSession();
        }

    } catch (err) {
        alert('Error: ' + err.message);
    }

    hideLoading();
}

// Populate filter dropdowns
function populateFilters() {
    // Get unique values (including unknown)
    const orgIds = [...new Set(data.map(i => i.org_id || 'unknown').filter(o => o))].sort();
    const platforms = [...new Set(data.map(i => i.platform || 'unknown').filter(p => p))].sort();
    const statuses = [...new Set(data.map(i => i.status || 'unknown').filter(s => s))].sort();
    const languages = [...new Set(data.map(i => i.language || 'unknown').filter(l => l))].sort();

    // Populate org ID
    filterOrgId.innerHTML = '<option value="">All Organizations</option>';
    orgIds.forEach(o => {
        const label = o === 'unknown' ? 'Unknown' : o;
        filterOrgId.innerHTML += `<option value="${o}">${label}</option>`;
    });

    // Populate platform
    filterPlatform.innerHTML = '<option value="">All Platforms</option>';
    platforms.forEach(p => {
        const label = p === 'unknown' ? 'Unknown' : p;
        filterPlatform.innerHTML += `<option value="${p}">${label}</option>`;
    });

    // Populate status
    filterStatus.innerHTML = '<option value="">All Status</option>';
    statuses.forEach(s => {
        const label = s === 'unknown' ? 'Unknown' : s;
        filterStatus.innerHTML += `<option value="${s}">${label}</option>`;
    });

    // Populate language
    filterLanguage.innerHTML = '<option value="">All Languages</option>';
    languages.forEach(l => {
        const label = l === 'unknown' ? 'Unknown' : l;
        filterLanguage.innerHTML += `<option value="${l}">${label}</option>`;
    });
}

// Update filter button visibility
function updateFilterButton() {
    const hasAnnotationFilter = Array.from(filterAnnotationCheckboxes).some(cb => cb.checked);
    const hasFilters = hasAnnotationFilter || filterOrgId.value || filterPlatform.value || filterStatus.value ||
                       filterLanguage.value || filterMessages.value || filterDuration.value;
    clearFilters.style.display = hasFilters ? 'flex' : 'none';
}

// Filters
function applyFilters() {
    const term = search.value.toLowerCase();

    // Get selected annotations (multi-select)
    const selectedAnnotations = Array.from(filterAnnotationCheckboxes)
        .filter(cb => cb.checked)
        .map(cb => cb.value);

    const orgId = filterOrgId.value;
    const platform = filterPlatform.value;
    const status = filterStatus.value;
    const language = filterLanguage.value;
    const messages = filterMessages.value;
    const duration = filterDuration.value;
    const labelFilter = filterLabel.value;

    filtered = data.filter(item => {
        // Search filter
        if (term) {
            const matchSearch = (
                (item.org_id || '').toLowerCase().includes(term) ||
                (item.conversation_id || '').toLowerCase().includes(term) ||
                (item.messages || []).some(m => (m.text || '').toLowerCase().includes(term))
            );
            if (!matchSearch) return false;
        }

        // Org ID filter
        if (orgId) {
            const itemOrgId = item.org_id || 'unknown';
            if (itemOrgId !== orgId) return false;
        }

        // Platform filter
        if (platform) {
            const itemPlatform = item.platform || 'unknown';
            if (itemPlatform !== platform) return false;
        }

        // Status filter
        if (status) {
            const itemStatus = item.status || 'unknown';
            if (itemStatus !== status) return false;
        }

        // Language filter
        if (language) {
            const itemLanguage = item.language || 'unknown';
            if (itemLanguage !== language) return false;
        }

        // Message count filter
        if (messages) {
            const count = item._count;
            if (messages === '1-5' && (count < 1 || count > 5)) return false;
            if (messages === '6-10' && (count < 6 || count > 10)) return false;
            if (messages === '11-20' && (count < 11 || count > 20)) return false;
            if (messages === '21-50' && (count < 21 || count > 50)) return false;
            if (messages === '51+' && count < 51) return false;
        }

        // Duration filter
        if (duration) {
            const dur = item._duration;
            if (duration === '0-5' && (dur < 0 || dur > 5)) return false;
            if (duration === '5-15' && (dur < 5 || dur > 15)) return false;
            if (duration === '15-30' && (dur < 15 || dur > 30)) return false;
            if (duration === '30-60' && (dur < 30 || dur > 60)) return false;
            if (duration === '60+' && dur < 60) return false;
        }

        // Label filter
        if (labelFilter) {
            const itemLabels = item.labels || [];
            if (!itemLabels.includes(labelFilter)) return false;
        }

        // Annotation filter (uses cached annotation from item)
        // OR logic: match if item matches ANY selected annotation
        if (selectedAnnotations.length > 0) {
            let matchesAnnotation = false;

            for (const annotation of selectedAnnotations) {
                if (annotation === 'pick' && item._annotation === 'pick') {
                    matchesAnnotation = true;
                    break;
                }
                if (annotation === 'banned' && item._annotation === 'banned') {
                    matchesAnnotation = true;
                    break;
                }
                if (annotation === 'read' && item._read) {
                    matchesAnnotation = true;
                    break;
                }
                if (annotation === 'unread' && !item._read) {
                    matchesAnnotation = true;
                    break;
                }
            }

            if (!matchesAnnotation) return false;
        }

        return true;
    });

    updateStats();
    updateFilterButton();
    page = 0;
    items.innerHTML = '';
    renderItems();
}

function resetFilters() {
    // Uncheck all annotation checkboxes
    filterAnnotationCheckboxes.forEach(cb => cb.checked = false);

    filterOrgId.value = '';
    filterPlatform.value = '';
    filterStatus.value = '';
    filterLanguage.value = '';
    filterMessages.value = '';
    filterDuration.value = '';
    applyFilters();
}

function applySort() {
    const val = sort.value;

    filtered.sort((a, b) => {
        switch (val) {
            case 'date-desc': return new Date(b.start_time) - new Date(a.start_time);
            case 'date-asc': return new Date(a.start_time) - new Date(b.start_time);
            case 'messages-desc': return b._count - a._count;
            case 'duration-desc': return b._duration - a._duration;
            default: return 0;
        }
    });

    page = 0;
    items.innerHTML = '';
    renderItems();
}

// Render Items
function renderItems() {
    const start = page * PAGE_SIZE;
    const end = start + PAGE_SIZE;
    const slice = filtered.slice(start, end);

    slice.forEach(item => {
        const el = createItem(item);
        items.appendChild(el);
    });

    // Update load more button
    const loaded = Math.min(end, filtered.length);
    const total = filtered.length;

    if (end < filtered.length) {
        loadMore.style.display = 'block';
        btnLoad.disabled = false;
        btnLoad.innerHTML = `
            <i class="fas fa-chevron-down"></i>
            <span>Load More (${loaded.toLocaleString()} / ${total.toLocaleString()})</span>
        `;
    } else {
        if (end > PAGE_SIZE) {
            loadMore.style.display = 'block';
            btnLoad.disabled = true;
            btnLoad.innerHTML = `
                <i class="fas fa-check"></i>
                <span>All Loaded (${total.toLocaleString()} conversations)</span>
            `;
        } else {
            loadMore.style.display = 'none';
        }
    }

    updateTitle();

    // Load annotations for displayed items to apply visual states
    if (window.loadItemAnnotations) {
        loadItemAnnotations();
    }
}

function createItem(item) {
    const el = document.createElement('div');
    el.className = 'item';
    el.dataset.conversationId = item.conversation_id;

    // Add 'read' class if conversation has been read
    if (item._read) {
        el.classList.add('read');
        console.log(`✓ Item ${item.conversation_id} rendered with 'read' class`);
    }

    const msgs = item.messages || [];
    const last = msgs[msgs.length - 1];
    const preview = last ? (last.text || '').substring(0, 50) : '';

    // Get platform and status classes for color coding
    const platformClass = item.platform ? `platform-${item.platform.toLowerCase()}` : '';
    const statusClass = item.status ? `status-${item.status.toLowerCase()}` : '';

    el.innerHTML = `
        <div class="item-header">
            <div class="item-conv-id" title="${item.conversation_id}">
                <i class="fas fa-fingerprint"></i>
                ${item.conversation_id.substring(0, 12)}...
            </div>
            <div class="item-time">${formatTime(item.start_time)}</div>
        </div>
        <div class="item-meta">
            ${item.platform && item.platform !== 'unknown' ? `<span class="badge badge-platform ${platformClass}"><i class="fas fa-desktop"></i>${item.platform}</span>` : ''}
            ${item.status && item.status !== 'unknown' ? `<span class="badge badge-status ${statusClass}"><i class="fas fa-check-circle"></i>${item.status}</span>` : ''}
            <span class="badge"><i class="fas fa-comment"></i>${item._count} msgs</span>
            ${item._duration ? `<span class="badge"><i class="far fa-clock"></i>${formatDuration(item._duration)}</span>` : ''}
        </div>
        ${(item.labels && item.labels.length > 0) ? `
        <div class="item-labels">
            ${item.labels.map(label => `<span class="item-label-tag">${escape(label)}</span>`).join('')}
        </div>
        ` : ''}
        <div class="item-preview">${escape(preview)}</div>

        <div class="item-quick-actions">
            <button class="btn-quick btn-quick-pick" onclick="quickAnnotate(event, '${item.conversation_id}', 'pick')" title="Pick">
                <i class="fas fa-check"></i>
            </button>
            <button class="btn-quick btn-quick-ban" onclick="quickAnnotate(event, '${item.conversation_id}', 'banned')" title="Ban">
                <i class="fas fa-ban"></i>
            </button>
            <button class="btn-quick btn-quick-clear" onclick="quickAnnotate(event, '${item.conversation_id}', null)" title="Clear/Unread">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;

    el.addEventListener('click', () => selectItem(item, el));

    return el;
}


function selectItem(item, el) {
    console.log(`🔍 Selecting conversation: ${item.conversation_id}`);

    selected = item;

    document.querySelectorAll('.item').forEach(e => e.classList.remove('active'));
    el.classList.add('active');

    renderDetail(item);

    // Mark as read - pass the correct item
    if (window.markAsRead) {
        console.log(`📖 Calling markAsRead for: ${item.conversation_id}`);
        markAsRead(item);
    }
}

// Render Detail
function renderDetail(item) {
    const msgs = item.messages || [];

    // Calc response times
    const agentTimes = [];
    const botTimes = [];
    let lastUser = null;

    msgs.forEach(m => {
        if (m.from === 'user') {
            lastUser = new Date(m.time);
        } else if (lastUser) {
            const diff = (new Date(m.time) - lastUser) / 60000;
            if (diff >= 0) {
                if (m.from === 'agent') agentTimes.push(diff);
                if (m.from === 'bot') botTimes.push(diff);
            }
        }
    });

    const avgAgent = agentTimes.length ? avg(agentTimes) : null;
    const medAgent = agentTimes.length ? median(agentTimes) : null;
    const avgBot = botTimes.length ? avg(botTimes) : null;
    const medBot = botTimes.length ? median(botTimes) : null;

    detail.innerHTML = `
        <div class="detail-header" id="detailHeader">
            <div class="detail-title">
                <i class="fas fa-comments"></i>
                <span>Conversation Details</span>
            </div>

            <div class="detail-ids">
                ${item.org_id && item.org_id !== 'unknown' ? `
                    <div class="id-card">
                        <div class="id-card-label">
                            <i class="fas fa-building"></i>
                            <span>Organization ID</span>
                        </div>
                        <div class="id-card-value">
                            <code>${item.org_id}</code>
                            <button class="copy-btn" onclick="copy('${item.org_id}', this)" title="Copy Org ID">
                                <i class="far fa-copy"></i>
                            </button>
                        </div>
                    </div>
                ` : ''}

                <div class="id-card">
                    <div class="id-card-label">
                        <i class="fas fa-fingerprint"></i>
                        <span>Conversation ID</span>
                    </div>
                    <div class="id-card-value">
                        <code>${item.conversation_id}</code>
                        <button class="copy-btn" onclick="copy('${item.conversation_id}', this)" title="Copy Conversation ID">
                            <i class="far fa-copy"></i>
                        </button>
                    </div>
                </div>
            </div>

            <div class="detail-grid">
                <div class="detail-item">
                    <div class="detail-label"><i class="fas fa-desktop"></i> Platform</div>
                    <div class="detail-value">
                        ${item.platform && item.platform !== 'unknown' ?
                            `<span class="badge badge-platform platform-${item.platform.toLowerCase()}">${item.platform}</span>` :
                            '<span class="badge badge-platform">Unknown</span>'
                        }
                    </div>
                </div>

                <div class="detail-item">
                    <div class="detail-label"><i class="fas fa-info-circle"></i> Status</div>
                    <div class="detail-value">${item.status || 'Unknown'}</div>
                </div>

                <div class="detail-item">
                    <div class="detail-label"><i class="far fa-clock"></i> Duration</div>
                    <div class="detail-value">${formatDuration(item._duration)}</div>
                </div>

                <div class="detail-item">
                    <div class="detail-label"><i class="fas fa-comment"></i> Messages</div>
                    <div class="detail-value">${item._count}</div>
                </div>

                <div class="detail-item">
                    <div class="detail-label"><i class="fas fa-language"></i> Language</div>
                    <div class="detail-value">${item.language || 'Unknown'}</div>
                </div>

                ${avgAgent !== null ? `
                <div class="detail-item">
                    <div class="detail-label"><i class="fas fa-headset"></i> Agent Avg Response</div>
                    <div class="detail-value">${formatDuration(avgAgent)}</div>
                </div>
                ` : ''}

                ${medAgent !== null ? `
                <div class="detail-item">
                    <div class="detail-label"><i class="fas fa-headset"></i> Agent Median Response</div>
                    <div class="detail-value">${formatDuration(medAgent)}</div>
                </div>
                ` : ''}

                ${avgBot !== null ? `
                <div class="detail-item">
                    <div class="detail-label"><i class="fas fa-robot"></i> Bot Avg Response</div>
                    <div class="detail-value">${formatDuration(avgBot)}</div>
                </div>
                ` : ''}

                ${medBot !== null ? `
                <div class="detail-item">
                    <div class="detail-label"><i class="fas fa-robot"></i> Bot Median Response</div>
                    <div class="detail-value">${formatDuration(medBot)}</div>
                </div>
                ` : ''}
            </div>

            <div class="detail-labels-section">
                <div class="detail-label-title">
                    <span>Labels</span>
                    <button class="btn-add-label" id="btnAddLabel" onclick="toggleLabelInput()" title="Add label">
                        <i class="fas fa-plus"></i>
                    </button>
                </div>
                <div class="label-input-wrapper" id="labelInputWrapper" style="display: none;">
                    <input
                        type="text"
                        class="label-input"
                        id="labelInput"
                        placeholder="Enter label..."
                        data-conversation-id="${item.conversation_id}"
                    >
                </div>
                <div class="labels-display" id="labelsDisplay">
                    ${(item.labels || []).map(label => `
                        <span class="label-tag">
                            ${escape(label)}
                            <button class="label-remove" onclick="removeLabel('${item.conversation_id}', '${label}')">
                                <i class="fas fa-times"></i>
                            </button>
                        </span>
                    `).join('')}
                </div>
            </div>
        </div>

        <div class="messages">
            <div class="msg-list">
                ${msgs.map(m => {
                    // 1. EVENT - Display centered with faded text
                    if (m.event) {
                        return `
                            <div class="msg-event">
                                <div class="event-line"></div>
                                <div class="event-content">
                                    <i class="fas fa-sticky-note"></i>
                                    <span>${escape(m.text || m.event)}</span>
                                </div>
                                <div class="event-line"></div>
                            </div>
                        `;
                    }

                    const type = m.from === 'agent' ? 'agent' : (m.from === 'bot' ? 'bot' : 'user');
                    const senderIcon = m.from === 'agent' ? 'fa-headset' : (m.from === 'bot' ? 'fa-robot' : 'fa-user');
                    const senderText = m.from === 'agent' ? 'Agent' : (m.from === 'bot' ? 'Bot' : 'User');

                    // 2. REPLY-TO - Display quoted message
                    let replyToHtml = '';
                    if (m.reply_to) {
                        const replyFrom = m.reply_to.from_name || m.reply_to.from_type || 'Unknown';
                        let replyText = m.reply_to.text || '';

                        // If no text but has attachments, show "Sent an attachment"
                        if (!replyText && m.reply_to.attachments && m.reply_to.attachments.length > 0) {
                            replyText = 'Sent an attachment';
                        }

                        replyToHtml = `
                            <div class="msg-reply-to">
                                <div class="reply-to-indicator"></div>
                                <div class="reply-to-content">
                                    <div class="reply-to-header">
                                        <i class="fas fa-reply"></i>
                                        <span>${escape(replyFrom)}</span>
                                    </div>
                                    <div class="reply-to-text">${escape(replyText)}</div>
                                </div>
                            </div>
                        `;
                    }

                    // 3. ATTACHMENT - Display file/image/video (handle both object and array)
                    let attachmentHtml = '';
                    if (m.attachment) {
                        // Handle array of attachments (e.g., quick replies)
                        if (Array.isArray(m.attachment)) {
                            attachmentHtml = m.attachment.map(att => renderAttachment(att)).join('');
                        } else {
                            // Handle single attachment object
                            attachmentHtml = renderAttachment(m.attachment);
                        }
                    }

                    // 4. TEXT MESSAGE
                    // If no text but has attachment, show "Sent an attachment"
                    let textHtml = '';
                    if (m.text) {
                        textHtml = `<div class="msg-text">${escape(m.text)}</div>`;
                    } else if (m.attachment) {
                        textHtml = `<div class="msg-text msg-text-placeholder">Sent an attachment</div>`;
                    }

                    return `
                        <div class="msg ${type}">
                            <div class="msg-header">
                                <span class="msg-sender"><i class="fas ${senderIcon}"></i> ${senderText}</span>
                                <span>${formatTime(m.time)}</span>
                            </div>
                            ${replyToHtml}
                            ${textHtml}
                            ${attachmentHtml}
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}



// Update
function updateStats() {
    const convs = new Set(filtered.map(i => i.conversation_id)).size;
    const msgs = filtered.reduce((sum, i) => sum + i._count, 0);

    stats.innerHTML = `
        <div class="stat-row">
            <span>Items</span>
            <span class="stat-value">${filtered.length.toLocaleString()}</span>
        </div>
        <div class="stat-row">
            <span>Conversations</span>
            <span class="stat-value">${convs.toLocaleString()}</span>
        </div>
        <div class="stat-row">
            <span>Messages</span>
            <span class="stat-value">${msgs.toLocaleString()}</span>
        </div>
    `;
}

function updateTitle() {
    const text = `${filtered.length.toLocaleString()} conversations`;
    listTitle.innerHTML = `<i class="fas fa-list"></i><span>${text}</span>`;
}

function loadMoreItems() {
    page++;
    renderItems();
}

// Utils
function calcDuration(start, end) {
    if (!start || !end) return 0;
    return (new Date(end) - new Date(start)) / 60000;
}

function calcAvgResponse(msgs) {
    if (!msgs || msgs.length < 2) return null;

    const times = [];
    let lastUser = null;

    msgs.forEach(m => {
        if (m.from === 'user') {
            lastUser = new Date(m.time);
        } else if (m.from === 'agent' && lastUser) {
            const diff = (new Date(m.time) - lastUser) / 60000;
            if (diff >= 0) times.push(diff);
            lastUser = null;
        }
    });

    return times.length ? avg(times) : null;
}

function avg(arr) {
    return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function median(arr) {
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function formatTime(str) {
    if (!str) return '';
    const d = new Date(str);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(min) {
    if (min < 1) return '< 1m';
    if (min < 60) return `${Math.round(min)}m`;
    const h = Math.floor(min / 60);
    const m = Math.round(min % 60);
    return `${h}h ${m}m`;
}

function escape(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function debounce(fn, ms) {
    let timer;
    return function(...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), ms);
    };
}

function showLoading() {
    loading.style.display = 'flex';
}

function hideLoading() {
    loading.style.display = 'none';
}

// Format file size
function formatFileSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// Render attachment based on type
function renderAttachment(att) {
    if (!att || !att.type) return '';

    const type = att.type.toLowerCase();
    const filename = att.filename || 'Attachment';
    const size = att.size ? formatFileSize(att.size) : '';

    switch (type) {
        case 'image':
            return `
                <div class="msg-attachment msg-attachment-image">
                    ${att.url ? `
                        <a href="${att.url}" target="_blank" class="attachment-image-link">
                            <img src="${att.url}" alt="${escape(filename)}" class="attachment-image" loading="lazy">
                        </a>
                    ` : `
                        <div class="attachment-placeholder">
                            <i class="fas fa-image"></i>
                            <span>${escape(filename)}</span>
                        </div>
                    `}
                </div>
            `;

        case 'file':
            return `
                <div class="msg-attachment msg-attachment-file">
                    <div class="attachment-file-icon">
                        <i class="fas fa-file-alt"></i>
                    </div>
                    <div class="attachment-file-info">
                        <div class="attachment-file-name">${escape(filename)}</div>
                        ${size ? `<div class="attachment-file-size">${size}</div>` : ''}
                    </div>
                    ${att.url ? `
                        <a href="${att.url}" target="_blank" class="attachment-download-btn" title="Download">
                            <i class="fas fa-download"></i>
                        </a>
                    ` : ''}
                </div>
            `;

        case 'video':
            return `
                <div class="msg-attachment msg-attachment-video">
                    ${att.url ? `
                        <video controls class="attachment-video">
                            <source src="${att.url}" type="${att.mime_type || 'video/mp4'}">
                            Your browser does not support video playback.
                        </video>
                    ` : `
                        <div class="attachment-placeholder">
                            <i class="fas fa-video"></i>
                            <span>${escape(filename)}</span>
                        </div>
                    `}
                </div>
            `;

        case 'audio':
            return `
                <div class="msg-attachment msg-attachment-audio">
                    ${att.url ? `
                        <audio controls class="attachment-audio">
                            <source src="${att.url}" type="${att.mime_type || 'audio/mpeg'}">
                            Your browser does not support audio playback.
                        </audio>
                        <div class="attachment-audio-name">${escape(filename)}</div>
                    ` : `
                        <div class="attachment-placeholder">
                            <i class="fas fa-music"></i>
                            <span>${escape(filename)}</span>
                        </div>
                    `}
                </div>
            `;

        case 'template':
            return `
                <div class="msg-attachment msg-attachment-template">
                    <div class="attachment-template-icon">
                        <i class="fas fa-th-large"></i>
                    </div>
                    <div class="attachment-template-text">Template Message</div>
                </div>
            `;

        case 'quick_reply':
            return `
                <div class="msg-attachment msg-attachment-quick-reply">
                    <div class="quick-reply-icon">${att.icon || '💬'}</div>
                    <div class="quick-reply-title">${escape(att.title || 'Quick Reply')}</div>
                </div>
            `;

        default:
            return `
                <div class="msg-attachment msg-attachment-unknown">
                    <i class="fas fa-paperclip"></i>
                    <span>${escape(type)}: ${escape(filename)}</span>
                </div>
            `;
    }
}

// Copy
function copy(text, btn) {
    navigator.clipboard.writeText(text).then(() => {
        const orig = btn.textContent;
        btn.textContent = '✓';
        setTimeout(() => btn.textContent = orig, 1500);
    }).catch(() => alert('Failed to copy'));
}

window.copy = copy;
// Labels Management
async function addLabel(conversationId, label) {
    if (!label) return;

    const item = data.find(i => i.conversation_id === conversationId);
    if (!item) return;

    if (!item.labels.includes(label)) {
        item.labels.push(label);

        // Save to DB if available
        if (window.dbReady && window.conversationDB) {
            try {
                await conversationDB.addLabel(conversationId, label);
                console.log(`✅ Saved label "${label}" to DB for ${conversationId}`);
            } catch (err) {
                console.error('❌ Error saving label to DB:', err);
            }
        }

        updateLabelDisplay(conversationId);
        updateLabelFilterOptions();
    }
}

async function removeLabel(conversationId, label) {
    const item = data.find(i => i.conversation_id === conversationId);
    if (!item) return;

    item.labels = item.labels.filter(l => l !== label);

    // Save to DB if available
    if (window.dbReady && window.conversationDB) {
        try {
            await conversationDB.removeLabel(conversationId, label);
            console.log(`✅ Removed label "${label}" from DB for ${conversationId}`);
        } catch (err) {
            console.error('❌ Error removing label from DB:', err);
        }
    }

    updateLabelDisplay(conversationId);
    updateLabelFilterOptions();
}

function updateLabelDisplay(conversationId) {
    const item = data.find(i => i.conversation_id === conversationId);
    if (!item) return;

    // Update detail view labels
    const labelsDisplay = document.getElementById('labelsDisplay');
    if (labelsDisplay) {
        labelsDisplay.innerHTML = (item.labels || []).map(label => `
            <span class="label-tag">
                ${escape(label)}
                <button class="label-remove" onclick="removeLabel('${item.conversation_id}', '${label}')">
                    <i class="fas fa-times"></i>
                </button>
            </span>
        `).join('');
    }

    // Update list item labels
    const itemEl = document.querySelector(`[data-conversation-id="${conversationId}"]`);
    if (itemEl) {
        let labelsSection = itemEl.querySelector('.item-labels');
        if ((item.labels || []).length > 0) {
            if (!labelsSection) {
                labelsSection = document.createElement('div');
                labelsSection.className = 'item-labels';
                const previewEl = itemEl.querySelector('.item-preview');
                previewEl.parentNode.insertBefore(labelsSection, previewEl);
            }
            labelsSection.innerHTML = item.labels.map(label => `<span class="item-label-tag">${escape(label)}</span>`).join('');
        } else if (labelsSection) {
            labelsSection.remove();
        }
    }
}

async function updateLabelFilterOptions() {
    try {
        const allLabels = await conversationDB.getAllLabels();
        const filterLabelSelect = document.getElementById('filterLabel');

        if (filterLabelSelect) {
            const currentValue = filterLabelSelect.value;

            // Keep "All Labels" option
            filterLabelSelect.innerHTML = '<option value="">All Labels</option>';

            // Add all labels as options
            allLabels.forEach(label => {
                const option = document.createElement('option');
                option.value = label;
                option.textContent = label;
                filterLabelSelect.appendChild(option);
            });

            // Restore previous selection if still available
            if (currentValue && allLabels.includes(currentValue)) {
                filterLabelSelect.value = currentValue;
            }
        }
    } catch (error) {
        console.error('❌ Error updating label filter:', error);
    }
}

// Handle label input in detail view
document.addEventListener('keypress', async function(e) {
    const labelInput = document.getElementById('labelInput');
    if (e.target === labelInput && e.key === 'Enter') {
        e.preventDefault();
        const label = labelInput.value.trim();
        if (label) {
            const conversationId = labelInput.dataset.conversationId;
            await addLabel(conversationId, label);
            labelInput.value = '';
        }
    }
});

function toggleLabelInput() {
    const wrapper = document.getElementById('labelInputWrapper');
    if (wrapper) {
        wrapper.style.display = wrapper.style.display === 'none' ? 'block' : 'none';
        if (wrapper.style.display === 'block') {
            const input = wrapper.querySelector('.label-input');
            if (input) input.focus();
        }
    }
}

window.addLabel = addLabel;
window.removeLabel = removeLabel;
window.toggleLabelInput = toggleLabelInput;