// Quick test script - paste this into browser console to check DB

(async function testDB() {
    console.log('=== Testing IndexedDB ===');

    // Check if DB exists
    const dbs = await indexedDB.databases();
    console.log('Available DBs:', dbs);

    // Check conversationDB
    if (window.conversationDB) {
        console.log('✅ conversationDB exists');
        console.log('DB instance:', conversationDB.db);

        if (conversationDB.db) {
            console.log('✅ DB is initialized');
            console.log('Version:', conversationDB.db.version);
            console.log('Object stores:', Array.from(conversationDB.db.objectStoreNames));

            // Try to get all conversations
            try {
                const tx = conversationDB.db.transaction(['conversations'], 'readonly');
                const store = tx.objectStore('conversations');
                const all = await new Promise((resolve, reject) => {
                    const req = store.getAll();
                    req.onsuccess = () => resolve(req.result);
                    req.onerror = () => reject(req.error);
                });

                console.log(`📦 Total conversations in DB: ${all.length}`);
                console.log('Sample conversation:', all[0]);

                // Count annotations
                const picked = all.filter(c => c.annotation === 'pick').length;
                const banned = all.filter(c => c.annotation === 'banned').length;
                const read = all.filter(c => c.read === true).length;

                console.log(`✓ Picked: ${picked}`);
                console.log(`✗ Banned: ${banned}`);
                console.log(`📖 Read: ${read}`);

            } catch (err) {
                console.error('❌ Error reading DB:', err);
            }
        } else {
            console.error('❌ DB not initialized!');
        }
    } else {
        console.error('❌ conversationDB not found!');
    }

    // Check dbReady flag
    console.log('dbReady flag:', window.dbReady);
})();
