const SONG_LIST_KEY = 'note_flight_songs';
		let currentSongId = null;
		let songList = [];
		
		async function loadSongList() {
			try {
				if (dbStorage.isReady) {
					songList = await dbStorage.getAllSongs();
				} else {
					const saved = localStorage.getItem(SONG_LIST_KEY);
					if (saved) {
						songList = JSON.parse(saved);
					}
				}
			} catch (e) {
				console.error('加载乐曲列表失败:', e);
				songList = [];
			}
		}
		
		async function saveSongList() {
			try {
				if (dbStorage.isReady) {
					for (const song of songList) {
						await dbStorage.saveSong(song);
					}
				} else {
					localStorage.setItem(SONG_LIST_KEY, JSON.stringify(songList));
				}
			} catch (e) {
				console.error('保存乐曲列表失败:', e);
			}
		}
		
		async function addSongToList(name, midiData, originalFileName) {
			const songId = Date.now().toString(36) + Math.random().toString(36).substr(2);
			
			let totalNotes = 0;
			let trackCount = midiData.tracks.length;
			let maxTime = 0;
			
			midiData.tracks.forEach(track => {
				totalNotes += track.notes.length;
				track.notes.forEach(note => {
					const hitTime = midiData.timeMap.tickToSeconds(note.tick);
					if (hitTime > maxTime) maxTime = hitTime;
				});
			});
			
			const song = {
				id: songId,
				name: name || originalFileName || '未命名乐曲',
				originalName: originalFileName || '',
				addedAt: Date.now(),
				totalNotes: totalNotes,
				trackCount: trackCount,
				duration: maxTime,
				midiData: midiData
			};
			
			songList.unshift(song);
			await saveSongList();
			
			return songId;
		}


		const router = {
			currentPage: 'home',
			history: [],
			
			pages: ['home', 'import', 'loading', 'songs', 'settings', 'play', 'info'],
			
			navigate(page, params = {}) {
				if (!this.pages.includes(page)) return;
				
				closeModal('settings');
				closeModal('info');
				
				if (this.currentPage !== page && this.currentPage !== 'settings' && this.currentPage !== 'info') {
					this.history.push(this.currentPage);
				}
				
				this.pages.forEach(p => {
					document.getElementById(`page-${p}`).classList.remove('active');
				});
				
				document.getElementById(`page-${page}`).classList.add('active');
				this.updateURL(page, params);
				this.currentPage = page;
				
				this.onPageEnter(page, params);
			},
			
			back() {
				if (this.history.length > 0) {
					const prevPage = this.history.pop();
					this.navigate(prevPage, {}, true);
				} else {
					this.navigate('home');
				}
			},
			
			updateURL(page, params) {
				let hash = `#/${page}`;
				if (params.id) {
					hash += `/${params.id}`;
				}
				window.location.hash = hash;
			},
			
			parseURL() {
				const hash = window.location.hash.slice(1) || '/home';
				const parts = hash.split('/').filter(p => p);
				const page = parts[0] || 'home';
				const id = parts[1];
				
				if (this.pages.includes(page)) {
					this.navigate(page, { id });
				}
			},
			
			onPageEnter(page, params) {
				switch(page) {
					case 'home':
						renderProjectInfo();
						break;
					case 'songs':
						loadSongList().then(() => renderSongList());
						break;
					case 'play':
						// 确保 Canvas 尺寸正确（从其他页面切回时）
						requestAnimationFrame(() => {
							resize();
						});
						if (params.id) {
							playSongFromList(params.id);
						}
						break;
					case 'settings':
						openModal('settings', params.returnTo || 'home');
						syncSettingsUI();
						renderProjectInfo();
						break;
					case 'info':
						openModal('info', params.returnTo || 'home');
						break;
				}
			}
		};


		let modalReturnPage = null;
		let modalActive = false;  // 追踪模态框是否打开，用于暂停 Canvas 渲染
		
		function openModal(modalId, returnTo) {
			modalReturnPage = returnTo || router.currentPage;
			modalActive = true;
			const modal = document.getElementById('page-' + modalId);
			if (modal) {
				modal.classList.add('active');
			}
		}
		
		function closeModal(modalId) {
			const modal = document.getElementById('page-' + modalId);
			if (modal) {
				modal.classList.remove('active');
			}
			const wasReturnPage = modalReturnPage;
			modalReturnPage = null;
			modalActive = false;
			
			// 如果返回的是 play 页面，强制刷新 Canvas
			if (wasReturnPage === 'play' && router.currentPage === 'play') {
				requestAnimationFrame(() => {
					invalidateCache();
					resize();
				});
			}
		}


		const ProjectInfo = {
			name: "NOTE FLIGHT",
			fullName: "MIDI 音符动画生成器",
			version: "1.3.2",
			buildDate: "2026-07-04",
			lastUpdate: "2026-07-04",
			codename: "Stable",
			
			author: {
				name: "huanyan26",
				email: "huanyan26@qq.com",
				role: "独立开发者",
				website: null
			},
			
			description: "NOTE FLIGHT 是一个基于 Web 的 MIDI 可视化工具，将 MIDI 文件转换为视觉化的音符飞行动画。",

			githubUrl: "https://github.com/huanyan26/midi-note-flight",
			demoUrl: "https://huanyan26.github.io/midi-note-flight/",
			
			techStack: [],
			
			changelog: [],
			
			getFormattedInfo() {
				return {
					shortVersion: `v${this.version}`,
					fullVersion: `${this.name} v${this.version} (${this.codename})`,
					copyright: `© ${new Date().getFullYear()} ${this.author.name}`,
					updateText: `最后更新于 ${this.lastUpdate}`,
					buildInfo: `Build: ${this.buildDate}`
				};
			},
			
			getVersionType() {
				return 'stable';
			},
			
			getVersionBadgeClass() {
				return 'bg-green-500';
			}
		};

		function renderProjectInfo() {
			const info = ProjectInfo;
			const formatted = info.getFormattedInfo();
			
			const homeBadge = document.getElementById('homeVersionBadge');
			if (homeBadge) {
				homeBadge.innerHTML = `<span class="version-badge ${info.getVersionBadgeClass()}">${formatted.shortVersion} ${info.getVersionType().toUpperCase()}</span>`;
			}
			
			const homeInfo = document.getElementById('homeProjectInfo');
			if (homeInfo) {
				homeInfo.innerHTML = `${formatted.updateText}<br>什么，你说你没有MIDI文件？<a href="https://www.midishow.com" target="_blank" style="color: blue; text-decoration: underline;">MIDIshow</a><br>联系我：<a href="mailto:${info.author.email}" style="color: blue; text-decoration: underline;">${info.author.name}</a>`;
			}
			
			document.getElementById('loadingVersionInfo').textContent = `${info.name} ${formatted.shortVersion}`;
			document.getElementById('songsPageVersion').textContent = `${info.name} ${formatted.shortVersion}`;
			
			const settingsBadge = document.getElementById('settingsVersionBadge');
			if (settingsBadge) {
				settingsBadge.innerHTML = `<span class="version-badge ${info.getVersionBadgeClass()} text-xs">${formatted.shortVersion}</span>`;
			}
			
			document.getElementById('playPageVersion').textContent = `${info.name} ${formatted.shortVersion}`;
			
			// 设置页项目信息卡片
			const settingsInfo = document.getElementById('settingsProjectInfo');
			if (settingsInfo) {
				settingsInfo.innerHTML = `${info.description}<br><br><a href="${info.githubUrl}" target="_blank" style="color: #4ecdc4; font-weight: bold;">GitHub →</a>`;
			}
			const settingsFooter = document.getElementById('settingsFooterVersion');
			if (settingsFooter) {
				settingsFooter.textContent = formatted.buildInfo;
			}
		}

		function showProjectInfo() {
			openModal('info', router.currentPage);
			const info = ProjectInfo;
			const formatted = info.getFormattedInfo();
			
			document.getElementById('infoVersionBadge').innerHTML = `<span class="version-badge ${info.getVersionBadgeClass()} text-xs">${formatted.shortVersion}</span>`;
			document.getElementById('infoBuildDate').textContent = formatted.buildInfo;
		}

		function togglePlay() {
			if (!isPlaying) {
				audioEngine.start();
				isPlaying = true;
				document.getElementById('playBtn').innerHTML = '<svg class="w-5 h-5 sm:w-6 sm:h-6" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg>';
				document.getElementById('playBtn').className = 'flat-btn yellow w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center p-0';
			} else {
				audioEngine.pause();
				isPlaying = false;
				document.getElementById('playBtn').innerHTML = '<svg class="w-5 h-5 sm:w-6 sm:h-6" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
				document.getElementById('playBtn').className = 'flat-btn blue w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center p-0';
			}
		}
		
		function stopPlayback() {
			if (!isPlaying) return;
			audioEngine.stop();
			isPlaying = false;
			document.getElementById('playBtn').innerHTML = '<svg class="w-5 h-5 sm:w-6 sm:h-6" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
			document.getElementById('playBtn').className = 'flat-btn blue w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center p-0';
		}
		
		function resetSim() {
			audioEngine.stop();
			isPlaying = false;
			visualClock.time = 0;
			visualClock.lastFrameTime = 0;
			
			// 立即同步 DOM 时间显示，避免残留旧值
			document.getElementById('timeDisplay').textContent = '0.00';
			document.getElementById('activeCount').textContent = '0';
			document.getElementById('bpmDisplay').textContent = '--';
			
			if (appStore.getState().settings.objectPool) {
				trianglePool.releaseAll();
				particlePool.releaseAll();
			}
			
			activeTriangles = [];
			activeParticles = [];
			nextNoteIndex = 0;
			
			document.getElementById('playBtn').innerHTML = '<svg class="w-5 h-5 sm:w-6 sm:h-6" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
			document.getElementById('playBtn').className = 'flat-btn blue w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center p-0';
			
			prepareNotes();
		}
		
		function updateSpeed(val) {
			playbackSpeed = parseFloat(val);
			Tone.Transport.playbackRate = playbackSpeed;
			document.getElementById('speedDisplay').textContent = playbackSpeed.toFixed(1) + 'x';
		}


		function syncSettingsUI() {
			const settings = appStore.getState().settings;
			document.getElementById('volumeSlider').value = settings.volume;
			document.getElementById('volumeDisplay').textContent = settings.volume + '%';
			document.getElementById('autoPlayToggle').checked = settings.autoPlay;
			document.getElementById('highPrecisionToggle').checked = settings.highPrecision;
			document.getElementById('spatialIndexToggle').checked = settings.spatialIndex;
			document.getElementById('objectPoolToggle').checked = settings.objectPool;
			document.getElementById('perfPanelToggle').checked = settings.showPerfPanel;
			document.getElementById('showStatusToggle').checked = settings.showStatus;
			document.getElementById('showTrackToggle').checked = settings.showTrack;
			document.getElementById('showProgressToggle').checked = settings.showProgress;
			
			// 同步实际 DOM 显示/隐藏状态（仅设置checkbox不触发onchange）
			document.getElementById('statsContainer').classList.toggle('hidden', !settings.showStatus);
			document.getElementById('trackPanel').classList.toggle('hidden', !settings.showTrack);
		}
		
		function updateVolume(value) {
			const vol = parseInt(value);
			appStore.setState(state => { state.settings.volume = vol; });
			document.getElementById('volumeDisplay').textContent = value + '%';
			audioEngine.setVolume(vol);
		}
		
		function toggleAutoPlay(enabled) {
			appStore.setState(state => { state.settings.autoPlay = enabled; });
		}
		
		function toggleHighPrecision(enabled) {
			appStore.setState(state => { state.settings.highPrecision = enabled; });
		}
		
		function toggleSpatialIndex(enabled) {
			appStore.setState(state => { state.settings.spatialIndex = enabled; });
		}
		
		function toggleObjectPool(enabled) {
			appStore.setState(state => { state.settings.objectPool = enabled; });
		}
		
		function togglePerfPanel(enabled) {
			appStore.setState(state => { state.settings.showPerfPanel = enabled; });
			document.getElementById('perfPanel').classList.toggle('active', enabled);
		}
		
		function toggleDisplay(type, show) {
			switch(type) {
				case 'status':
					appStore.setState(state => { state.settings.showStatus = show; });
					document.getElementById('statsContainer').classList.toggle('hidden', !show);
					break;
				case 'track':
					appStore.setState(state => { state.settings.showTrack = show; });
					document.getElementById('trackPanel').classList.toggle('hidden', !show);
					break;
				case 'progress':
					appStore.setState(state => { state.settings.showProgress = show; });
					break;
			}
		}
		
		function resetSettings() {
			appStore.setState(state => {
				state.settings = {
					volume: 60,
					autoPlay: false,
					highPrecision: true,
					spatialIndex: true,
					objectPool: true,
					showPerfPanel: false,
					showStatus: false,
					showTrack: false,
					showProgress: true
				};
			});
			syncSettingsUI();
		}
		
		async function migrateToIndexedDB() {
			try {
				const count = await dbStorage.migrateFromLocalStorage();
				alert(`成功迁移 ${count} 首乐曲到 IndexedDB`);
				loadSongList().then(() => renderSongList());
			} catch (e) {
				alert('迁移失败: ' + e.message);
			}
		}
		
		async function clearAllData() {
			if (!confirm('确定要清除所有数据吗？此操作不可恢复！')) return;
			try {
				if (dbStorage.isReady) {
					const songs = await dbStorage.getAllSongs();
					for (const song of songs) {
						await dbStorage.deleteSong(song.id);
					}
				}
				localStorage.clear();
				songList = [];
				renderSongList();
				alert('所有数据已清除');
			} catch (e) {
				alert('清除失败: ' + e.message);
			}
		}

		function renderSongList() {
			const container = document.getElementById('songListContainer');
			const countDisplay = document.getElementById('songCountDisplay');
			
			countDisplay.textContent = songList.length;
			
			if (songList.length === 0) {
				container.innerHTML = `
					<div class="empty-state">
						<div class="empty-state-icon">🎵</div>
						<p class="text-gray-500">暂无乐曲</p>
						<p class="text-xs text-gray-400 mt-2">点击"添加乐曲"导入MIDI文件</p>
					</div>
				`;
				return;
			}
			
			container.innerHTML = songList.map(song => {
				const isActive = song.id === currentSongId;
				const addedDate = new Date(song.addedAt).toLocaleDateString('zh-CN');
				
				return `
					<div class="song-list-item ${isActive ? 'active' : ''}" data-song-id="${song.id}">
						<div class="flex items-start justify-between gap-3">
							<div class="flex-1 min-w-0">
								<div class="font-bold text-base sm:text-lg truncate" id="song-name-${song.id}">${escapeHtml(song.name)}</div>
								<div class="song-stats">
									<span class="song-stat">⏱ ${formatDuration(song.duration)}</span>
									<span class="song-stat">🎵 ${song.totalNotes} 音符</span>
									<span class="song-stat">🎼 ${song.trackCount} 音轨</span>
									<span class="song-stat">📅 ${addedDate}</span>
								</div>
							</div>
						</div>
						<div class="song-actions">
							<button onclick="event.stopPropagation(); router.navigate('play', {id: '${song.id}'});" class="song-action-btn play">▶ 播放</button>
							<button onclick="event.stopPropagation(); startRenameSong('${song.id}');" class="song-action-btn rename">✎ 重命名</button>
							<button onclick="event.stopPropagation(); deleteSong('${song.id}');" class="song-action-btn delete">✕ 删除</button>
						</div>
					</div>
				`;
			}).join('');
			
			container.querySelectorAll('.song-list-item').forEach(item => {
				item.addEventListener('click', (e) => {
					if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;
					const songId = item.dataset.songId;
					router.navigate('play', { id: songId });
				});
			});
		}
		
		function escapeHtml(text) {
			const div = document.createElement('div');
			div.textContent = text;
			return div.innerHTML;
		}
		
		function formatDuration(seconds) {
			if (seconds < 60) {
				return Math.floor(seconds) + '秒';
			}
			const mins = Math.floor(seconds / 60);
			const secs = Math.floor(seconds % 60);
			return `${mins}分${secs.toString().padStart(2, '0')}秒`;
		}
		
		async function deleteSong(songId) {
			if (!confirm('确定要删除这首乐曲吗？')) return;
			
			try {
				if (dbStorage.isReady) {
					await dbStorage.deleteSong(songId);
				}
				songList = songList.filter(s => s.id !== songId);
				await saveSongList();
				renderSongList();
				
				if (currentSongId === songId) {
					currentSongId = null;
					resetSim();
				}
			} catch (e) {
				alert('删除失败: ' + e.message);
			}
		}
		
		function startRenameSong(songId) {
			const song = songList.find(s => s.id === songId);
			if (!song) return;
			
			const nameSpan = document.getElementById(`song-name-${songId}`);
			if (!nameSpan) return;
			
			const currentName = song.name;
			const input = document.createElement('input');
			input.type = 'text';
			input.className = 'song-name-input';
			input.value = currentName;
			
			input.onblur = () => finishRenameSong(songId, input.value);
			input.onkeydown = (e) => {
				if (e.key === 'Enter') {
					finishRenameSong(songId, input.value);
				} else if (e.key === 'Escape') {
					renderSongList();
				}
			};
			
			nameSpan.parentNode.replaceChild(input, nameSpan);
			input.focus();
			input.select();
		}
		
		async function finishRenameSong(songId, newName) {
			const song = songList.find(s => s.id === songId);
			if (song && newName.trim()) {
				song.name = newName.trim();
				await saveSongList();
			}
			renderSongList();
		}


		async function selectFile() {
			document.getElementById('fileInput').click();
		}
		
		async function handleFileSelect(event) {
			const file = event.target.files[0];
			if (!file) return;
			
			router.navigate('loading');
			
			try {
				await audioEngine.init();
				await dbStorage.init();
				
				const buffer = await file.arrayBuffer();
				
				// 使用 Web Worker 异步解析（大文件不阻塞主线程）
				let parsedMidi;
				const fileSizeMB = buffer.byteLength / (1024 * 1024);
				
				if (fileSizeMB > 0.5) {
					// 大于 0.5MB 的文件使用 Worker 解析
					parsedMidi = await parseMidiInWorker(buffer);
				} else {
					// 小文件直接同步解析（避免 Worker 通信开销）
					parsedMidi = EnhancedMidiParser.parse(buffer);
				}
				
				if (parsedMidi.timeMap && !parsedMidi.timeMap.tickToSeconds) {
					const timeMap = new TimeMap(parsedMidi.ppq || 480);
					timeMap.tempos = parsedMidi.timeMap.tempos || [{ tick: 0, tempo: 500000 }];
					parsedMidi.timeMap = timeMap;
				}
				
				const songId = await addSongToList(
					file.name.replace(/\.(mid|midi|midi2)$/i, ''), 
					parsedMidi, 
					file.name
				);
				currentSongId = songId;
				
				midiData = parsedMidi;
				prepareNotes();
				updateTrackList();
				
				setTimeout(() => {
					router.navigate('play', { id: songId });
				}, 500);
				
			} catch (err) {
				console.error(err);
				alert('解析失败: ' + err.message);
				router.navigate('import');
			}
		}
		
		async function playSongFromList(songId) {
			const song = songList.find(s => s.id === songId);
			if (!song || !song.midiData) {
				alert('乐曲数据已损坏');
				router.navigate('songs');
				return;
			}
			
			currentSongId = songId;
			
			try {
				await audioEngine.init();
				
				midiData = song.midiData;
				
				if (midiData.timeMap && !midiData.timeMap.tickToSeconds) {
					const timeMap = new TimeMap(midiData.ppq || 480);
					timeMap.tempos = midiData.timeMap.tempos || [{ tick: 0, tempo: 500000 }];
					midiData.timeMap = timeMap;
				}
				
				prepareNotes();
				updateTrackList();
				
				if (appStore.getState().settings.autoPlay) {
					setTimeout(() => togglePlay(), 100);
				}
				
			} catch (err) {
				console.error(err);
				alert('加载乐曲失败: ' + err.message);
				router.navigate('songs');
			}
		}
		
		function prepareNotes() {
			allNotes = [];
			
			if (appStore.getState().settings.objectPool) {
				trianglePool.releaseAll();
				particlePool.releaseAll();
			}
			
			activeTriangles = [];
			activeParticles = [];
			nextNoteIndex = 0;
			
			midiData.tracks.forEach((track, trackId) => {
				track.notes.forEach(note => {
					const hitTime = midiData.timeMap.tickToSeconds(note.tick);
					allNotes.push({
						note: note.note,
						velocity: note.velocity,
						trackId: trackId,
						trackName: track.name,
						hitTime: hitTime,
						spawnTime: hitTime - CONFIG.FLIGHT_TIME - CONFIG.SPAWN_DURATION
					});
				});
			});
			
			allNotes.sort((a, b) => a.spawnTime - b.spawnTime);
			
			document.getElementById('totalNotes').textContent = allNotes.length;
			
			const initialBPM = midiData.timeMap.getBPM(0);
			Tone.Transport.bpm.value = initialBPM;
			document.getElementById('bpmDisplay').textContent = initialBPM;
			
			// 初始化空间索引
			if (appStore.getState().settings.spatialIndex) {
				spatialIndex = new QuadTree(
					new Rectangle(0, 0, canvas.width, canvas.height),
					4,
					8
				);
			}
			
			// 预计算时间线密度直方图
			buildDensityHistogram();
		}
		
		function updateTrackList() {
			const container = document.getElementById('trackList');
			container.innerHTML = '';

			midiData.tracks.forEach((track, trackId) => {
				const boundaries = ['左', '右', '上', '下'];
				const boundary = boundaries[track.id % 4];
				
				const avgVelocity = track.notes.reduce((sum, n) => sum + n.velocity, 0) / track.notes.length;
				const minNote = Math.min(...track.notes.map(n => n.note));
				const maxNote = Math.max(...track.notes.map(n => n.note));
				
				const smallNotes = track.notes.filter(n => n.note > 80 && n.velocity < 50).length;
				const largeNotes = track.notes.filter(n => n.note < 50 && n.velocity > 90).length;
				const mediumNotes = track.notes.length - smallNotes - largeNotes;
				
				const div = document.createElement('div');
				div.className = 'flex flex-col p-1.5 sm:p-2 bg-gray-100 border-2 border-black gap-1';
				div.innerHTML = `
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-2">
							<div class="w-3 h-3 sm:w-4 sm:h-4 border-2 border-black flex-shrink-0" style="background: ${track.color}"></div>
							<div class="min-w-0">
								<div class="text-xs font-bold truncate max-w-[80px] sm:max-w-[100px]">${track.name}</div>
								<div class="text-xs text-gray-500">→ ${boundary}边界</div>
							</div>
						</div>
						<span class="text-xs font-bold bg-gray-200 border-2 border-black px-1.5 sm:px-2 flex-shrink-0">${track.notes.length}</span>
					</div>
					<div class="flex items-center gap-1 mt-1 text-xs text-gray-600">
						<span class="font-bold">音域:</span>
						<span>${getNoteName(minNote)}-${getNoteName(maxNote)}</span>
						<span class="mx-1">|</span>
						<span class="font-bold">力度:</span>
						<span>${Math.round(avgVelocity)}</span>
					</div>
					<div class="flex items-center gap-1 mt-1">
						<div class="flex-1 h-2 bg-gray-300 border border-black overflow-hidden">
							<div class="h-full flex">
								<div class="h-full bg-blue-400" style="width: ${(smallNotes/track.notes.length)*100}%"></div>
								<div class="h-full bg-green-400" style="width: ${(mediumNotes/track.notes.length)*100}%"></div>
								<div class="h-full bg-red-400" style="width: ${(largeNotes/track.notes.length)*100}%"></div>
							</div>
						</div>
					</div>
				`;
				container.appendChild(div);
			});
		}
		
		function getNoteName(noteNum) {
			const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
			const octave = Math.floor(noteNum / 12) - 1;
			const noteIndex = noteNum % 12;
			return noteNames[noteIndex] + octave;
		}


		document.addEventListener('keydown', (e) => {
			if (e.code === 'Space') {
				e.preventDefault();
				if (router.currentPage === 'play') togglePlay();
			} else if (e.code === 'KeyR') {
				if (router.currentPage === 'play') resetSim();
			} else if (e.code === 'Escape') {
				if (router.currentPage === 'settings' || router.currentPage === 'info') router.back();
				else if (router.currentPage === 'play') router.navigate('songs');
			}
		});
