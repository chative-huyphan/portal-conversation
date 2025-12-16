// IndexedDB wrapper for conversation annotations
class ConversationDB {
    constructor() {
        this.dbName = 'ConversationAnnotations';
        this.version = 1
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onerror = () => {
                console.error('❌ DB open error:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                console.log('✅ DB opened, version:', this.db.version);
                console.log('📦 Object stores:', Array.from(this.db.objectStoreNames));
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                console.log('🔧 onupgradeneeded triggered, oldVersion:', event.oldVersion, '→ newVersion:', event.newVersion);

                // Store for conversations with annotations
                if (!db.objectStoreNames.contains('conversations')) {
                    console.log('📝 Creating conversations store...');
                    const store = db.createObjectStore('conversations', { keyPath: 'conversation_id' });
                    store.createIndex('annotation', 'annotation', { unique: false });
                    store.createIndex('org_id', 'org_id', { unique: false });
                    store.createIndex('read', 'read', { unique: false });
                    // Removed 'reviewed' index - no longer needed
                }

                // Store for session metadata
                if (!db.objectStoreNames.contains('sessions')) {
                    console.log('📝 Creating sessions store...');
                    db.createObjectStore('sessions', { keyPath: 'id' });
                }
            };
        });
    }

    // Save or update conversation with annotation
    async saveConversation(conversation, annotation = null, notes = '') {
        const tx = this.db.transaction(['conversations'], 'readwrite');
        const store = tx.objectStore('conversations');

        const data = {
            ...conversation,
            annotation, // 'pick', 'banned', or null
            notes,
            labels: conversation.labels || [], // Array of custom labels
            annotation_at: new Date().toISOString()
        };

        return new Promise((resolve, reject) => {
            const request = store.put(data);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // Add a label to conversation
    async addLabel(conversationId, label) {
        const tx = this.db.transaction(['conversations'], 'readwrite');
        const store = tx.objectStore('conversations');

        return new Promise((resolve, reject) => {
            const getRequest = store.get(conversationId);

            getRequest.onsuccess = () => {
                const existing = getRequest.result;

                if (existing) {
                    // Initialize labels array if not exists
                    if (!existing.labels) {
                        existing.labels = [];
                    }
                    // Add label if not already present
                    if (!existing.labels.includes(label)) {
                        existing.labels.push(label);
                        existing.labels_updated_at = new Date().toISOString();
                    }

                    const putRequest = store.put(existing);
                    putRequest.onsuccess = () => resolve(existing);
                    putRequest.onerror = () => reject(putRequest.error);
                } else {
                    reject(new Error(`Conversation ${conversationId} not found`));
                }
            };

            getRequest.onerror = () => reject(getRequest.error);
        });
    }

    // Remove a label from conversation
    async removeLabel(conversationId, label) {
        const tx = this.db.transaction(['conversations'], 'readwrite');
        const store = tx.objectStore('conversations');

        return new Promise((resolve, reject) => {
            const getRequest = store.get(conversationId);

            getRequest.onsuccess = () => {
                const existing = getRequest.result;

                if (existing) {
                    if (existing.labels) {
                        existing.labels = existing.labels.filter(l => l !== label);
                        existing.labels_updated_at = new Date().toISOString();
                    }

                    const putRequest = store.put(existing);
                    putRequest.onsuccess = () => resolve(existing);
                    putRequest.onerror = () => reject(putRequest.error);
                } else {
                    reject(new Error(`Conversation ${conversationId} not found`));
                }
            };

            getRequest.onerror = () => reject(getRequest.error);
        });
    }

    // Get all unique labels
    async getAllLabels() {
        const tx = this.db.transaction(['conversations'], 'readonly');
        const store = tx.objectStore('conversations');

        return new Promise((resolve, reject) => {
            const getAllRequest = store.getAll();

            getAllRequest.onsuccess = () => {
                const allConversations = getAllRequest.result;
                const labelsSet = new Set();

                allConversations.forEach(conv => {
                    if (conv.labels && Array.isArray(conv.labels)) {
                        conv.labels.forEach(label => labelsSet.add(label));
                    }
                });

                resolve(Array.from(labelsSet).sort());
            };

            getAllRequest.onerror = () => reject(getAllRequest.error);
        });
    }

    // Get conversations by label
    async getByLabel(label) {
        const tx = this.db.transaction(['conversations'], 'readonly');
        const store = tx.objectStore('conversations');

        return new Promise((resolve, reject) => {
            const getAllRequest = store.getAll();

            getAllRequest.onsuccess = () => {
                const allConversations = getAllRequest.result;
                const filtered = allConversations.filter(conv =>
                    conv.labels && conv.labels.includes(label)
                );
                resolve(filtered);
            };

            getAllRequest.onerror = () => reject(getAllRequest.error);
        });
    }

    // Get conversation annotation
    async getConversation(conversationId) {
        const tx = this.db.transaction(['conversations'], 'readonly');
        const store = tx.objectStore('conversations');

        return new Promise((resolve, reject) => {
            const request = store.get(conversationId);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // Mark conversation as read
    async markConversationAsRead(conversation) {
        const tx = this.db.transaction(['conversations'], 'readwrite');
        const store = tx.objectStore('conversations');

        return new Promise((resolve, reject) => {
            const getRequest = store.get(conversation.conversation_id);

            getRequest.onsuccess = () => {
                const existing = getRequest.result;

                // Merge with existing or create new
                const dataToSave = existing ? {
                    ...existing,
                    read: true,
                    read_at: new Date().toISOString()
                } : {
                    ...conversation,
                    annotation: null,
                    notes: '',
                    read: true,
                    read_at: new Date().toISOString()
                };

                const putRequest = store.put(dataToSave);
                putRequest.onsuccess = () => {
                    console.log(`✅ Saved read status for: ${conversation.conversation_id}`);
                    resolve(dataToSave);
                };
                putRequest.onerror = () => reject(putRequest.error);
            };

            getRequest.onerror = () => reject(getRequest.error);
        });
    }

    // Mark conversation as unread (clear read status)
    async markConversationAsUnread(conversation) {
        const tx = this.db.transaction(['conversations'], 'readwrite');
        const store = tx.objectStore('conversations');

        return new Promise((resolve, reject) => {
            const getRequest = store.get(conversation.conversation_id);

            getRequest.onsuccess = () => {
                const existing = getRequest.result;

                if (existing) {
                    // Clear read status
                    existing.read = false;
                    existing.read_at = null;

                    const putRequest = store.put(existing);
                    putRequest.onsuccess = () => {
                        console.log(`✅ Marked ${conversation.conversation_id} as unread`);
                        resolve(existing);
                    };
                    putRequest.onerror = () => reject(putRequest.error);
                } else {
                    // If not in DB, nothing to do
                    resolve(null);
                }
            };

            getRequest.onerror = () => reject(getRequest.error);
        });
    }

    // Get all conversations with specific annotation
    async getByAnnotation(annotation) {
        const tx = this.db.transaction(['conversations'], 'readonly');
        const store = tx.objectStore('conversations');
        const index = store.index('annotation');

        return new Promise((resolve, reject) => {
            const request = index.getAll(annotation);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // Get review progress
    async getProgress() {
        const tx = this.db.transaction(['conversations'], 'readonly');
        const store = tx.objectStore('conversations');

        return new Promise((resolve, reject) => {
            const getAllRequest = store.getAll();

            getAllRequest.onsuccess = () => {
                const allConversations = getAllRequest.result;
                const total = allConversations.length;
                const picked = allConversations.filter(c => c.annotation === 'pick').length;
                const banned = allConversations.filter(c => c.annotation === 'banned').length;
                const read = allConversations.filter(c => c.read === true).length;
                const annotated = picked + banned;

                resolve({
                    total,
                    picked,
                    banned,
                    read,
                    annotated,
                    remaining: total - annotated - read
                });
            };

            getAllRequest.onerror = () => reject(getAllRequest.error);
        });
    }

    // Save session state (current position, filters, etc.)
    async saveSession(state) {
        const tx = this.db.transaction(['sessions'], 'readwrite');
        const store = tx.objectStore('sessions');

        const session = {
            id: 'current',
            ...state,
            updated_at: new Date().toISOString()
        };

        return new Promise((resolve, reject) => {
            const request = store.put(session);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // Load session state
    async loadSession() {
        const tx = this.db.transaction(['sessions'], 'readonly');
        const store = tx.objectStore('sessions');

        return new Promise((resolve, reject) => {
            const request = store.get('current');
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // Export annotations to JSON (returns full conversation data)
    async exportAnnotations() {
        const tx = this.db.transaction(['conversations'], 'readonly');
        const store = tx.objectStore('conversations');

        return new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => {
                // Return full conversation data
                resolve(request.result);
            };
            request.onerror = () => reject(request.error);
        });
    }

    // Import conversations in batches (for large datasets)
    async importConversations(conversations, batchSize = 1000) {
        console.log(`📥 Starting import of ${conversations.length} conversations...`);

        if (!this.db) {
            console.error('❌ DB not initialized!');
            return 0;
        }

        try {
            const tx = this.db.transaction(['conversations'], 'readwrite');
            const store = tx.objectStore('conversations');
            console.log('✅ Got conversations store');
        } catch (err) {
            console.error('❌ Cannot access conversations store:', err.message);
            return 0;
        }

        const batches = [];
        for (let i = 0; i < conversations.length; i += batchSize) {
            batches.push(conversations.slice(i, i + batchSize));
        }

        let imported = 0;

        for (const batch of batches) {
            // Wait for each batch to complete before moving to next
            await new Promise((batchResolve, batchReject) => {
                const tx = this.db.transaction(['conversations'], 'readwrite');
                const store = tx.objectStore('conversations');

                let completed = 0;
                let errors = [];

                batch.forEach(conv => {
                    // Check if conversation already exists
                    const getRequest = store.get(conv.conversation_id);

                    getRequest.onsuccess = () => {
                        const existing = getRequest.result;

                        // If exists, preserve annotation and read status
                        const dataToSave = {
                            ...conv,
                            annotation: existing?.annotation || conv.annotation || null,
                            notes: existing?.notes || conv.notes || '',
                            annotation_at: existing?.annotation_at || conv.annotation_at,
                            read: existing?.read || conv.read || false,
                            read_at: existing?.read_at || conv.read_at,
                            labels: existing?.labels || conv.labels || []
                        };

                        const putRequest = store.put(dataToSave);
                        putRequest.onsuccess = () => {
                            completed++;
                            if (completed === batch.length) {
                                imported += batch.length;
                                console.log(`📦 Imported ${imported}/${conversations.length} conversations`);
                            }
                        };
                        putRequest.onerror = () => {
                            errors.push(putRequest.error);
                            completed++;
                        };
                    };

                    getRequest.onerror = () => {
                        errors.push(getRequest.error);
                        completed++;
                    };
                });

                // Wait for transaction to complete
                tx.oncomplete = () => {
                    if (errors.length > 0) {
                        console.error(`⚠️ ${errors.length} errors during import`);
                    }
                    batchResolve();
                };

                tx.onerror = () => {
                    console.error('❌ Transaction error:', tx.error);
                    batchReject(tx.error);
                };
            });
        }

        console.log(`✅ Import complete: ${imported} conversations`);
        return imported;
    }

    // Clear all data
    async clearAll() {
        const tx = this.db.transaction(['conversations', 'sessions'], 'readwrite');
        await Promise.all([
            new Promise((resolve, reject) => {
                const request = tx.objectStore('conversations').clear();
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            }),
            new Promise((resolve, reject) => {
                const request = tx.objectStore('sessions').clear();
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            })
        ]);
    }
}

// Export singleton instance
const conversationDB = new ConversationDB();
window.conversationDB = conversationDB;
