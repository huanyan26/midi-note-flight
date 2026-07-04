class HighPrecisionAudioEngine {
			constructor() {
				this.ready = false;
				this.synths = new Map();
				this.volumeNode = null;
				this.reverb = null;
				this.lastTransportTime = 0;
				this.driftAccumulator = 0;
				this.syncInterval = null;
				this.noteThrottle = 0;       // 分帧调度计数器
				this.maxNotesPerFrame = 8;   // 每帧最多触发8个音符
				this.globalPolyphony = 32;   // 全局最大复音数
				this.activeVoices = 0;       // 当前活跃发音数
			}

			async init() {
				if (this.ready) return;
				await Tone.start();
				
				Tone.Transport.bpm.value = 120;
				
				this.volumeNode = new Tone.Volume(appStore.getState().settings.volume / 100).toDestination();
				this.reverb = new Tone.Reverb({ decay: 1.2, wet: 0.15 }).connect(this.volumeNode);
				
				this.ready = true;
				document.getElementById('syncStatus').classList.remove('hidden');
				
				this.startSyncMonitor();
			}

			startSyncMonitor() {
				this.syncInterval = setInterval(() => {
					const transportTime = Tone.Transport.seconds;
					const visualTime = visualClock.time;
					const drift = Math.abs(transportTime - visualTime) * 1000;
					
					appStore.setState(state => {
						state.audioDrift = drift;
					});
					
					if (drift > 100 && appStore.getState().settings.highPrecision) {
						visualClock.time = transportTime;
					}
				}, 100);
			}

			setVolume(value) {
				if (this.volumeNode) {
					this.volumeNode.volume.value = Tone.gainToDb(value / 100);
				}
			}

			getSynth(trackId) {
				if (!this.synths.has(trackId)) {
					const synth = new Tone.PolySynth(Tone.Synth, {
						maxPolyphony: 6,  // 降低单轨复音数防止爆音
						oscillator: { type: trackId % 2 === 0 ? 'triangle' : 'square' },
						envelope: { attack: 0.005, decay: 0.08, sustain: 0.15, release: 0.3 } // 更短包络
					});
					synth.connect(this.reverb);
					this.synths.set(trackId, synth);
				}
				return this.synths.get(trackId);
			}

			playNote(frequency, velocity, trackId) {
				if (!this.ready) return;
				
				// 分帧调度：每帧限制触发音符数
				this.noteThrottle++;
				if (this.noteThrottle > this.maxNotesPerFrame) return;
				
				// 全局复音限制：超过时跳过最安静的音符
				if (this.activeVoices >= this.globalPolyphony) {
					if (velocity < 0.3) return; // 跳过弱音符
				}
				
				const synth = this.getSynth(trackId);
				synth.triggerAttackRelease(frequency, "16n", Tone.now(), Math.min(velocity, 0.8));
			}

			resetFrameCounter() {
				this.noteThrottle = 0;
			}

			start() { 
				Tone.Transport.start();
				appStore.setState(state => { state.isPlaying = true; });
			}
			
			pause() { 
				Tone.Transport.pause();
				appStore.setState(state => { state.isPlaying = false; });
			}
			
			stop() { 
				Tone.Transport.stop();
				// 释放所有合成器，防止切换歌曲后内存泄漏
				this.synths.forEach(synth => {
					synth.disconnect();
					synth.dispose();
				});
				this.synths.clear();
				appStore.setState(state => { state.isPlaying = false; });
			}
			
			seek(time) { Tone.Transport.seconds = time; }
			getTime() { return Tone.Transport.seconds; }
		}

		const audioEngine = new HighPrecisionAudioEngine();
