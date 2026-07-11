class Store {
			constructor(initialState = {}) {
				this.state = { ...initialState };
				this.listeners = new Set();
				this.proxy = new Proxy(this.state, {
					set: (target, prop, value) => {
						const oldValue = target[prop];
						target[prop] = value;
						if (oldValue !== value) {
							this.notify(prop, value, oldValue);
						}
						return true;
					}
				});
			}

			subscribe(listener) {
				this.listeners.add(listener);
				return () => this.listeners.delete(listener);
			}

			notify(key, newVal, oldVal) {
				this.listeners.forEach(fn => fn(key, newVal, oldVal, this.state));
			}

			getState() {
				return this.proxy;
			}

			setState(updater) {
				if (typeof updater === 'function') {
					updater(this.proxy);
				} else {
					Object.assign(this.proxy, updater);
				}
			}
		}

// 全局状态存储
const SETTINGS_STORAGE_KEY = 'note_flight_settings';

function loadSettings() {
	try {
		const saved = localStorage.getItem(SETTINGS_STORAGE_KEY);
		if (saved) {
			const parsed = JSON.parse(saved);
			// 合并已保存的设置与默认值，防止新增字段缺失
			return {
				volume: 60,
				autoPlay: false,
				highPrecision: true,
				spatialIndex: true,
				objectPool: true,
				showPerfPanel: false,
				showStatus: false,
				showTrack: false,
				showProgress: true,
				corsProxy: '',
				...parsed
			};
		}
	} catch (e) {
		console.error('加载设置失败:', e);
	}
	return null;
}

function saveSettings(settings) {
	try {
		localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
	} catch (e) {
		console.error('保存设置失败:', e);
	}
}

const defaultSettings = {
	volume: 60,
	autoPlay: false,
	highPrecision: true,
	spatialIndex: true,
	objectPool: true,
	showPerfPanel: false,
	showStatus: false,
	showTrack: false,
	showProgress: true,
	corsProxy: ''
};

const persistedSettings = loadSettings() || defaultSettings;

const appStore = new Store({
	isPlaying: false,
	currentTime: 0,
	bpm: 120,
	activeNotes: 0,
	audioDrift: 0,
	fps: 0,
	settings: persistedSettings
});

// 设置变更时自动持久化
let settingsSaveTimer = null;
appStore.subscribe((key) => {
	if (key === 'settings' || (typeof key === 'string' && key.startsWith('settings'))) {
		// 防抖保存，避免频繁写入
		if (settingsSaveTimer) clearTimeout(settingsSaveTimer);
		settingsSaveTimer = setTimeout(() => {
			saveSettings(appStore.getState().settings);
		}, 300);
	}
});
