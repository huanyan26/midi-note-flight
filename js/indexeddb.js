class IndexedDBStorage {
			constructor(dbName = 'NoteFlightDB', version = 1) {
				this.dbName = dbName;
				this.version = version;
				this.db = null;
				this.isReady = false;
			}

			async init() {
				return new Promise((resolve, reject) => {
					const request = indexedDB.open(this.dbName, this.version);
					
					request.onerror = () => reject(request.error);
					request.onsuccess = () => {
						this.db = request.result;
						this.isReady = true;
						resolve(this.db);
					};
					
					request.onupgradeneeded = (event) => {
						const db = event.target.result;
						if (!db.objectStoreNames.contains('songs')) {
							const store = db.createObjectStore('songs', { keyPath: 'id' });
							store.createIndex('name', 'name', { unique: false });
							store.createIndex('addedAt', 'addedAt', { unique: false });
						}
						if (!db.objectStoreNames.contains('settings')) {
							db.createObjectStore('settings', { keyPath: 'key' });
						}
					};
				});
			}

			async saveSong(song) {
				if (!this.isReady) await this.init();
				return new Promise((resolve, reject) => {
					const tx = this.db.transaction(['songs'], 'readwrite');
					const store = tx.objectStore('songs');
					const request = store.put(song);
					request.onsuccess = () => resolve();
					request.onerror = () => reject(request.error);
				});
			}

			async getAllSongs() {
				if (!this.isReady) await this.init();
				return new Promise((resolve, reject) => {
					const tx = this.db.transaction(['songs'], 'readonly');
					const store = tx.objectStore('songs');
					const request = store.getAll();
					request.onsuccess = () => resolve(request.result);
					request.onerror = () => reject(request.error);
				});
			}

			async deleteSong(id) {
				if (!this.isReady) await this.init();
				return new Promise((resolve, reject) => {
					const tx = this.db.transaction(['songs'], 'readwrite');
					const store = tx.objectStore('songs');
					const request = store.delete(id);
					request.onsuccess = () => resolve();
					request.onerror = () => reject(request.error);
				});
			}

			async saveSetting(key, value) {
				if (!this.isReady) await this.init();
				return new Promise((resolve, reject) => {
					const tx = this.db.transaction(['settings'], 'readwrite');
					const store = tx.objectStore('settings');
					const request = store.put({ key, value });
					request.onsuccess = () => resolve();
					request.onerror = () => reject(request.error);
				});
			}

			async getSetting(key) {
				if (!this.isReady) await this.init();
				return new Promise((resolve, reject) => {
					const tx = this.db.transaction(['settings'], 'readonly');
					const store = tx.objectStore('settings');
					const request = store.get(key);
					request.onsuccess = () => resolve(request.result?.value);
					request.onerror = () => reject(request.error);
				});
			}

			async migrateFromLocalStorage() {
				const saved = localStorage.getItem('note_flight_songs');
				if (saved) {
					try {
						const songs = JSON.parse(saved);
						for (const song of songs) {
							await this.saveSong(song);
						}
						localStorage.removeItem('note_flight_songs');
						console.log('Migration completed');
						return songs.length;
					} catch (e) {
						console.error('Migration failed:', e);
						return 0;
					}
				}
				return 0;
			}
		}

		const dbStorage = new IndexedDBStorage();
