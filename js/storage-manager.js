/**
 * Storage Manager
 *
 * Responsible for: Providing a Promise-based wrapper around IndexedDB for
 *   persisting coloring projects (canvas state, metadata, thumbnails).
 * NOT responsible for: Deciding when to save — ProgressManager orchestrates
 *   auto-save timing and project lifecycle.
 *
 * Key functions:
 *   - initialize: Opens (or creates) the IndexedDB database and object stores
 *   - saveProject: Upserts a project record (metadata + blobs)
 *   - loadProject: Retrieves a single project by ID
 *   - getInProgressProject: Returns the most recently updated in-progress project
 *   - listProjects: Returns all projects sorted by updatedAt descending
 *   - deleteProject: Removes a project by ID
 *   - isAvailable: Returns whether the database opened successfully
 *
 * Dependencies: None (foundational persistence module)
 *
 * Notes: All write failures are swallowed with console.warn (ADR-001) so the
 *   app continues working without persistence. IndexedDB may be unavailable
 *   in private/incognito mode on some browsers — isAvailable() guards all
 *   operations gracefully.
 */

const StorageManager = (() => {
    const DB_NAME = 'coloring-book-db';
    const DB_VERSION = 1;
    const PROJECTS_STORE = 'projects';

    let db = null;

    // Opens the IndexedDB database, creating the projects object
    // store on first run. Resolves even on failure so the app
    // can boot without persistence.
    function initialize() {
        return new Promise((resolve) => {
            if (!window.indexedDB) {
                console.warn('IndexedDB not available — persistence disabled');
                resolve();
                return;
            }

            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (event) => {
                const database = event.target.result;
                if (!database.objectStoreNames.contains(PROJECTS_STORE)) {
                    const store = database.createObjectStore(PROJECTS_STORE, { keyPath: 'id' });
                    store.createIndex('updatedAt', 'updatedAt', { unique: false });
                    store.createIndex('status', 'status', { unique: false });
                }
            };

            request.onsuccess = (event) => {
                db = event.target.result;
                resolve();
            };

            request.onerror = (event) => {
                console.warn('Failed to open IndexedDB:', event.target.error);
                resolve();
            };
        });
    }

    // Inserts or updates a project record. The project object
    // must include an 'id' field (the keyPath). Blobs (coloring
    // canvas, thumbnail) are stored directly — IndexedDB handles
    // binary data natively.
    function saveProject(project) {
        return new Promise((resolve) => {
            if (!db) { resolve(); return; }

            const transaction = db.transaction(PROJECTS_STORE, 'readwrite');
            const store = transaction.objectStore(PROJECTS_STORE);
            const request = store.put(project);

            request.onsuccess = () => resolve();
            request.onerror = (event) => {
                console.warn('Failed to save project:', event.target.error);
                resolve();
            };
        });
    }

    function loadProject(id) {
        return new Promise((resolve) => {
            if (!db) { resolve(null); return; }

            const transaction = db.transaction(PROJECTS_STORE, 'readonly');
            const store = transaction.objectStore(PROJECTS_STORE);
            const request = store.get(id);

            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => resolve(null);
        });
    }

    // Returns the most recently updated project with status
    // 'in-progress', or null if none exists. Fetches all projects
    // and filters — acceptable since the total count is small.
    function getInProgressProject() {
        return listProjects().then((projects) => {
            return projects.find((p) => p.status === 'in-progress') || null;
        });
    }

    // Returns all projects sorted by updatedAt descending
    // (newest first). Uses an index cursor for efficient
    // reverse-chronological ordering.
    function listProjects() {
        return new Promise((resolve) => {
            if (!db) { resolve([]); return; }

            const transaction = db.transaction(PROJECTS_STORE, 'readonly');
            const store = transaction.objectStore(PROJECTS_STORE);
            const index = store.index('updatedAt');
            const request = index.openCursor(null, 'prev');
            const projects = [];

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    projects.push(cursor.value);
                    cursor.continue();
                } else {
                    resolve(projects);
                }
            };

            request.onerror = () => resolve([]);
        });
    }

    function deleteProject(id) {
        return new Promise((resolve) => {
            if (!db) { resolve(); return; }

            const transaction = db.transaction(PROJECTS_STORE, 'readwrite');
            const store = transaction.objectStore(PROJECTS_STORE);
            const request = store.delete(id);

            request.onsuccess = () => resolve();
            request.onerror = () => resolve();
        });
    }

    function isAvailable() {
        return db !== null;
    }

    return {
        initialize,
        saveProject,
        loadProject,
        getInProgressProject,
        listProjects,
        deleteProject,
        isAvailable
    };
})();
