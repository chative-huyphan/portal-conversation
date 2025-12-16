// Annotation System Integration

// Initialize DB on page load
let     dbReady = false;

(async function initAnnotationSystem() {
    try {
        await conversationDB.init();
        dbReady = true;
        window.dbReady = dbReady;  // Expose to global
        console.log('✅ Annotation system ready');

        // Restore session if exists
        await restoreSession();
    } catch (error) {
        console.error('❌ Failed to initialize annotation system:', error);
    }
})();

// Quick annotate from sidebar (without opening detail)
async function quickAnnotate(event, conversationId, annotation) {
    // Prevent all event propagation and default behavior
    if (event) {
        event.stopPropagation();
        event.preventDefault();
        event.stopImmediatePropagation();
    }

    if (!dbReady) {
        alert('Database not ready. Please wait...');
        return false;
    }

    try {
        // Find conversation in data by ID (not using selected variable)
        const conversation = data.find(c => c.conversation_id === conversationId);
        if (!conversation) {
            console.warn(`Conversation ${conversationId} not found`);
            return false;
        }

        console.log(`💾 Saving annotation for ${conversationId}...`);

        if (annotation === null) {
            // Clear annotation AND mark as unread
            await conversationDB.saveConversation(conversation, null);
            await conversationDB.markConversationAsUnread(conversation);

            // Sync to data object
            conversation._annotation = null;
            conversation._read = false;

            console.log(`✅ Cleared annotation and marked as unread`);
        } else {
            // Save annotation (pick/banned) - IMMEDIATE SAVE
            await conversationDB.saveConversation(conversation, annotation);

            // Sync annotation data into data object for filtering
            conversation._annotation = annotation;

            console.log(`✅ Saved to IndexedDB immediately`);
        }

        // Update UI for this specific item
        const itemEl = document.querySelector(`[data-conversation-id="${conversationId}"]`);
        if (itemEl) {
            updateItemAnnotationState(itemEl, annotation);

            // Update read class
            if (annotation === null) {
                itemEl.classList.remove('read');
            }
        }

        const action = annotation === 'pick' ? 'Picked' : annotation === 'banned' ? 'Banned' : 'Cleared';
        console.log(`✓ ${action}: ${conversationId} (persisted to IndexedDB)`);

        return false; // Prevent any further event handling
    } catch (error) {
        console.error('❌ Failed to annotate:', error);
        alert('Failed to save annotation');
        return false;
    }
}

// Update item visual state based on annotation
function updateItemAnnotationState(itemEl, annotation) {
    // Remove existing annotation classes
    itemEl.classList.remove('annotation-pick', 'annotation-banned', 'reviewed');

    // Add new state
    if (annotation) {
        itemEl.classList.add('reviewed');
        if (annotation === 'pick') {
            itemEl.classList.add('annotation-pick');
        } else if (annotation === 'banned') {
            itemEl.classList.add('annotation-banned');
        }
    }
}

// Mark conversation as read when selected
async function markAsRead(conversation) {
    if (!dbReady) return;

    try {
        console.log(`💾 Marking as read: ${conversation.conversation_id}`);

        // Pass full conversation object to save
        await conversationDB.markConversationAsRead(conversation);

        // Sync to data object
        conversation._read = true;

        // Update item UI - add 'read' class
        const itemEl = document.querySelector(`[data-conversation-id="${conversation.conversation_id}"]`);
        if (itemEl && !itemEl.classList.contains('read')) {
            itemEl.classList.add('read');
            console.log(`✅ Added 'read' class to item: ${conversation.conversation_id}`);
        }
    } catch (error) {
        console.error('Failed to mark as read:', error);
    }
}

// Show export modal
async function exportAnnotations() {
    if (!dbReady) {
        alert('Database not ready');
        return;
    }

    try {
        // Get progress to show counts
        const progress = await conversationDB.getProgress();

        // Update counts in modal
        document.getElementById('pickedCount').textContent = `${progress.picked} conversations`;
        document.getElementById('bannedCount').textContent = `${progress.banned} conversations`;

        // Show modal
        document.getElementById('exportModal').style.display = 'flex';
    } catch (error) {
        console.error('Failed to prepare export:', error);
        alert('Failed to prepare export');
    }
}

// Close export modal
function closeExportModal() {
    document.getElementById('exportModal').style.display = 'none';
}

// Confirm and execute export
async function confirmExport() {
    const exportPicked = document.getElementById('exportPicked').checked;
    const exportBanned = document.getElementById('exportBanned').checked;

    // Close modal
    closeExportModal();

    try {
        showLoading();

        const annotations = await conversationDB.exportAnnotations();
        const progress = await conversationDB.getProgress();

        // Separate by annotation type
        const picked = annotations.filter(a => a.annotation === 'pick');
        const banned = annotations.filter(a => a.annotation === 'banned');

        // Create summary report (always exported)
        const report = {
            exported_at: new Date().toISOString(),
            progress,
            total_annotations: annotations.length,
            picked: picked.length,
            banned: banned.length,
            read: progress.read,
            annotations: annotations.map(a => ({
                conversation_id: a.conversation_id,
                org_id: a.org_id,
                annotation: a.annotation,
                notes: a.notes,
                annotation_at: a.annotation_at,
                read: a.read,
                read_at: a.read_at
            }))
        };

        const timestamp = new Date().toISOString().split('T')[0];
        const exportedFiles = [];

        // Always export summary
        downloadJSON(report, `annotations_summary_${timestamp}.json`);
        exportedFiles.push('annotations_summary');

        // Export picked if selected
        if (exportPicked && picked.length > 0) {
            downloadJSON(picked, `picked_conversations_${timestamp}.json`);
            exportedFiles.push(`picked (${picked.length})`);
        }

        // Export banned if selected
        if (exportBanned && banned.length > 0) {
            downloadJSON(banned, `banned_conversations_${timestamp}.json`);
            exportedFiles.push(`banned (${banned.length})`);
        }

        hideLoading();
        alert(`✅ Exported successfully!\n\nFiles downloaded:\n${exportedFiles.map(f => `- ${f}`).join('\n')}`);
    } catch (error) {
        hideLoading();
        console.error('Failed to export:', error);
        alert('Failed to export annotations');
    }
}

// Make functions globally available
window.closeExportModal = closeExportModal;
window.confirmExport = confirmExport;

// Helper function to download JSON
function downloadJSON(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

// Save session state
async function saveSession() {
    if (!dbReady) return;

    try {
        // Get selected annotations from checkboxes
        const selectedAnnotations = Array.from(document.querySelectorAll('.filter-annotation-checkbox'))
            .filter(cb => cb.checked)
            .map(cb => cb.value);

        await conversationDB.saveSession({
            currentConversationId: selected?.conversation_id,
            filters: {
                annotations: selectedAnnotations,
                orgId: filterOrgId?.value || '',
                platform: filterPlatform?.value || '',
                status: filterStatus?.value || '',
                language: filterLanguage?.value || '',
                messages: filterMessages?.value || '',
                duration: filterDuration?.value || ''
            },
            search: search?.value || '',
            sort: sort?.value || 'date-desc',
            page: page
        });
    } catch (error) {
        console.error('Failed to save session:', error);
    }
}

// Restore session
async function restoreSession() {
    if (!dbReady) return;

    try {
        const session = await conversationDB.loadSession();
        if (!session) return;

        console.log('Restoring session...', session);

        // Restore filters (will be applied after data loads)
        window.sessionToRestore = session;
    } catch (error) {
        console.error('Failed to restore session:', error);
    }
}

// Apply restored session after data loads
function applyRestoredSession() {
    if (!window.sessionToRestore) return;

    const session = window.sessionToRestore;

    // Restore filters
    if (session.filters) {
        // Restore annotation checkboxes
        if (session.filters.annotations && Array.isArray(session.filters.annotations)) {
            const checkboxes = document.querySelectorAll('.filter-annotation-checkbox');
            checkboxes.forEach(cb => {
                cb.checked = session.filters.annotations.includes(cb.value);
            });
        }

        // The original line for single annotation filter is removed as it's replaced by the checkbox array logic
        // if (filterAnnotation && session.filters.annotation) filterAnnotation.value = session.filters.annotation;
        if (filterOrgId && session.filters.orgId) filterOrgId.value = session.filters.orgId;
        if (filterPlatform && session.filters.platform) filterPlatform.value = session.filters.platform;
        if (filterStatus && session.filters.status) filterStatus.value = session.filters.status;
        if (filterLanguage && session.filters.language) filterLanguage.value = session.filters.language;
        if (filterMessages && session.filters.messages) filterMessages.value = session.filters.messages;
        if (filterDuration && session.filters.duration) filterDuration.value = session.filters.duration;
    }

    // Restore search
    if (session.search && search) search.value = session.search;

    // Restore sort
    if (session.sort && sort) sort.value = session.sort;

    // Apply filters
    applyFilters();

    // Clear restored session
    delete window.sessionToRestore;

    console.log('✓ Session restored');
}

// Auto-save session every 30 seconds
setInterval(() => {
    saveSession();
}, 30000);

// Save session before page unload
window.addEventListener('beforeunload', () => {
    saveSession();
});

// Load annotations for displayed items
async function loadItemAnnotations() {
    if (!dbReady) return;

    const itemElements = document.querySelectorAll('.item[data-conversation-id]');

    for (const itemEl of itemElements) {
        const convId = itemEl.dataset.conversationId;
        try {
            const conv = await conversationDB.getConversation(convId);
            if (conv) {
                updateItemAnnotationState(itemEl, conv.annotation);

                // Apply read state
                if (conv.read) {
                    itemEl.classList.add('read');
                }

                // Sync annotation data into the data object for filtering
                const dataItem = data.find(d => d.conversation_id === convId);
                if (dataItem) {
                    dataItem._annotation = conv.annotation;
                    dataItem._read = conv.read || false;
                }
            }
        } catch (error) {
            console.error(`Failed to load annotation for ${convId}:`, error);
        }
    }
}

// Sync all annotations from DB to data objects (for filtering)
async function syncAllAnnotations() {
    if (!dbReady || !data || data.length === 0) return;

    console.log('Syncing annotations from DB...');

    try {
        // Get all conversations from DB
        const tx = conversationDB.db.transaction(['conversations'], 'readonly');
        const store = tx.objectStore('conversations');

        const allAnnotations = await new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });

        // Create a map for quick lookup
        const annotationMap = new Map();
        allAnnotations.forEach(conv => {
            annotationMap.set(conv.conversation_id, {
                annotation: conv.annotation,
                read: conv.read || false,
                labels: conv.labels || []
            });
        });

        // Sync to data objects
        let readCount = 0;
        data.forEach(item => {
            const annot = annotationMap.get(item.conversation_id);
            if (annot) {
                item._annotation = annot.annotation;
                item._read = annot.read;
                item.labels = annot.labels;
                if (annot.read) readCount++;
            } else {
                item._annotation = null;
                item._read = false;
                item.labels = [];
            }
        });

        console.log(`✓ Synced ${allAnnotations.length} annotations (${readCount} read conversations)`);
    } catch (error) {
        console.error('Failed to sync annotations:', error);
    }
}


// Make functions globally available
window.quickAnnotate = quickAnnotate;
window.exportAnnotations = exportAnnotations;
window.markAsRead = markAsRead;
window.loadItemAnnotations = loadItemAnnotations;
window.syncAllAnnotations = syncAllAnnotations;
window.applyRestoredSession = applyRestoredSession;
window.closeExportModal = closeExportModal;
window.confirmExport = confirmExport;
