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
		const appStore = new Store({
			isPlaying: false,
			currentTime: 0,
			bpm: 120,
			activeNotes: 0,
			audioDrift: 0,
			fps: 0,
			settings: {
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
			}
		});
