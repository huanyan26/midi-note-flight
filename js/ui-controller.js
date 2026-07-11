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
			const songId = Date.now().toString(36) + Math.random().toString(36).slice(2);
			
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
				
				// 先关闭所有模态框（会同步设置 modalActive = false，但如果目标是 play 则延迟）
				closeModal('settings');
				closeModal('info');
				
			// 历史记录：仅对非模态页面做记录
			// 目标页或当前页为 settings/info 模态框时不记录，避免底层页（如 play）污染 history
			if (this.currentPage !== page && page !== 'settings' && page !== 'info' && this.currentPage !== 'settings' && this.currentPage !== 'info') {
				this.history.push(this.currentPage);
			}
				
				// 切换页面 active 状态
				this.pages.forEach(p => {
					document.getElementById(`page-${p}`).classList.remove('active');
				});
				
				document.getElementById(`page-${page}`).classList.add('active');
				this.updateURL(page, params);
				this.currentPage = page;
				
				// 如果目标页面不是 play，确保 modalActive 被重置
				// （closeModal 中对于 play 返回场景会延迟重置，这里处理非 play 场景）
				if (page !== 'play') {
					modalActive = false;
				}
				
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
						// 确保 Canvas 渲染恢复（从其他页面切回时 modalActive 可能处于不一致状态）
						modalActive = false;
						// 确保 Canvas 尺寸正确（从其他页面切回时）
						requestAnimationFrame(() => {
							invalidateCache();
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
			
			// 如果返回的是 play 页面，需要确保 page-play 保持 active 状态
			// 并且延迟恢复 Canvas 渲染，避免 DOM 更新和 Canvas 绘制的竞态
			if (wasReturnPage === 'play' && router.currentPage === 'play') {
				// 确保 page-play 保持 active（防止在 modal 关闭期间被意外移除）
				const playPage = document.getElementById('page-play');
				if (playPage && !playPage.classList.contains('active')) {
					playPage.classList.add('active');
				}
				// 延迟一帧恢复 Canvas 渲染，确保 DOM 更新先完成
				requestAnimationFrame(() => {
					modalActive = false;
					requestAnimationFrame(() => {
						invalidateCache();
						resize();
					});
				});
			} else {
				// 非 play 页面，直接恢复 Canvas 渲染
				modalActive = false;
			}
		}

		// 关闭模态框并返回到打开它时的底层页面（默认 home）。
		// 不能用 router.back()：history 中可能残留 play 等页面，
		// 会导致从 settings/info 返回时错误跳转到 play。
		function closeModalAndReturn(modalId) {
			const returnPage = modalReturnPage || 'home';
			closeModal(modalId);
			router.navigate(returnPage);
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
				// 回收池中多余对象，防止长时间运行后膨胀
				trianglePool.trim(200);
				particlePool.trim(500);
			}
			
			activeTriangles = [];
			activeParticles = [];
			nextNoteIndex = 0;
			
			// 释放旧的空间索引
			spatialIndex = null;
			densityHistogram = null;
			
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
			
			const corsProxyInput = document.getElementById('corsProxyInput');
			if (corsProxyInput) corsProxyInput.value = settings.corsProxy || '';
			
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
		
		function updateCorsProxy(value) {
			const proxy = value.trim();
			appStore.setState(state => { state.settings.corsProxy = proxy; });
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
					showProgress: true,
					corsProxy: ''
				};
			});
			// 持久化重置后的默认设置
			saveSettings(appStore.getState().settings);
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
				// 从内存列表中移除并释放 midiData
				const idx = songList.findIndex(s => s.id === songId);
				if (idx !== -1) {
					songList[idx].midiData = null;  // 先释放大对象
					songList.splice(idx, 1);
				}
				await saveSongList();
				renderSongList();
				
				if (currentSongId === songId) {
					currentSongId = null;
					midiData = null;
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
		
		async function importFromUrl() {
			const urlInput = document.getElementById('urlInput');
			let url = urlInput.value.trim();
			if (!url) {
				alert('请输入 MIDI 文件链接');
				return;
			}
			
			// 自动补全协议
			if (!/^https?:\/\//i.test(url)) {
				url = 'https://' + url;
			}
			
			router.navigate('loading');
			
			try {
				await audioEngine.init();
				await dbStorage.init();
				
				document.getElementById('loadingTitle').textContent = '解析链接来源...';
				document.getElementById('loadingSubtitle').textContent = '正在获取 MIDI 来源（支持直链与分享页）';
				
				// 智能解析：支持直链 + HTML 分享页提取
				const result = await fetchMidiWithFallback(url);
				
				// 拒绝过大的文件（>50MB）
				const fileSizeMB = result.buffer.byteLength / (1024 * 1024);
				if (fileSizeMB > 50) {
					throw new Error('文件过大（>50MB），请下载后使用本地导入');
				}
				
				const fileName = extractFileName(result.finalUrl);
				
				await processMidiBuffer(result.buffer, fileName, fileSizeMB);
				
			} catch (err) {
				console.error('URL 导入失败:', err);
				alert('导入失败: ' + err.message);
				router.navigate('import');
			}
		}
		
		// 智能解析 URL：支持直链与 HTML 分享页中的 MIDI 链接
		// 返回 { buffer: ArrayBuffer, finalUrl: string }
		async function fetchMidiWithFallback(url, depth = 0) {
			if (depth > 3) {
				throw new Error('链接层级过深或存在循环引用，无法解析');
			}
			
			const requestUrl = applyCorsProxy(url);
			
			let response;
			try {
				response = await fetch(requestUrl, { mode: 'cors' });
			} catch (corsErr) {
				throw new Error(
					'无法访问该链接（跨域限制 CORS 或网络错误）。\n\n' +
					'💡 解决方案：\n' +
					'1. 在「设置 → 网络」中配置 CORS 代理\n' +
					'2. 下载文件后使用「选择本地文件」导入'
				);
			}
			
			if (!response.ok) {
				throw new Error(`下载失败 (HTTP ${response.status}): ${response.statusText}`);
			}
			
			const contentType = (response.headers.get('content-type') || '').toLowerCase();
			
			// HTML 分享页 → 提取内嵌的 MIDI 链接并递归获取
			if (isHtmlContentType(contentType) || /\.(html?|php|aspx?|jsp)$/i.test(url)) {
				const html = await response.text();
				const midiUrl = extractMidiUrlFromHtml(html, url);
				if (!midiUrl) {
					throw new Error('该网页中未找到可用的 MIDI 文件链接');
				}
				document.getElementById('loadingSubtitle').textContent = '已从分享页提取 MIDI 链接，正在获取...';
				return await fetchMidiWithFallback(midiUrl, depth + 1);
			}
			
			// 直接作为二进制文件读取（直链场景）
			const buffer = await response.arrayBuffer();
			
			// 校验 MIDI 魔术字节，过滤掉伪装成文件的网页
			if (!verifyMidiMagic(buffer)) {
				const head = new TextDecoder('utf-8', { fatal: false }).decode(buffer.slice(0, 200));
				if (/^\s*<!DOCTYPE|<html/i.test(head)) {
					throw new Error('该链接返回的是网页而非 MIDI 文件，请尝试分享页的直接链接');
				}
			}
			
			return { buffer, finalUrl: url };
		}
		
		// 应用 CORS 代理前缀
		// 支持 {url} 占位符，否则默认拼接到末尾并对目标 URL 编码
		function applyCorsProxy(url) {
			const proxy = appStore.getState().settings.corsProxy;
			if (!proxy || !proxy.trim()) return url;
			const p = proxy.trim();
			if (p.includes('{url}')) {
				return p.replace('{url}', encodeURIComponent(url));
			}
			return p.replace(/\/?$/, '/') + encodeURIComponent(url);
		}
		
		// 判断是否为 HTML 内容类型
		function isHtmlContentType(contentType) {
			return /text\/html|application\/xhtml\+xml/i.test(contentType);
		}
		
		// 校验 MIDI 文件魔术字节 "MThd"
		function verifyMidiMagic(buffer) {
			if (!buffer || buffer.byteLength < 4) return false;
			const bytes = new Uint8Array(buffer, 0, 4);
			return bytes[0] === 0x4D && bytes[1] === 0x54 && bytes[2] === 0x68 && bytes[3] === 0x64;
		}
		
		// 从 HTML 中提取第一个 MIDI 链接
		function extractMidiUrlFromHtml(html, baseUrl) {
			// 1. 优先匹配明确的 .mid/.midi/.kar 链接
			const explicitRegex = /(?:href|src|data-src)\s*=\s*["']([^"']+\.(?:mid|midi|midi2|kar))["']/gi;
			let match = explicitRegex.exec(html);
			if (match) return resolveUrl(match[1], baseUrl);
			
			// 2. 其次匹配包含 midi/score/download 关键词的链接（排除静态资源）
			const keywordRegex = /(?:href|src|data-src)\s*=\s*["']([^"']+)["']/gi;
			const candidates = [];
			while ((match = keywordRegex.exec(html)) !== null) {
				const link = match[1];
				if (/midi|sheet|score|download|play/i.test(link) &&
					!/\.(css|js|png|jpg|jpeg|gif|svg|ico|webp|woff2?)$/i.test(link)) {
					candidates.push(link);
				}
			}
			if (candidates.length > 0) return resolveUrl(candidates[0], baseUrl);
			
			return null;
		}
		
		// 将相对 URL 解析为绝对 URL
		function resolveUrl(relativeUrl, baseUrl) {
			try {
				return new URL(relativeUrl, baseUrl).href;
			} catch (e) {
				return relativeUrl;
			}
		}
		
		// 从最终 URL 提取文件名
		function extractFileName(url) {
			try {
				const urlPath = new URL(url).pathname;
				const segments = urlPath.split('/').filter(s => s);
				if (segments.length > 0) {
					const last = decodeURIComponent(segments[segments.length - 1]);
					if (last) return last;
				}
			} catch (e) { /* URL 解析失败，使用默认名 */ }
			return 'imported';
		}
		
		// 公共 MIDI 解析流程（本地文件和 URL 共用）
		async function processMidiBuffer(buffer, fileName, fileSizeMB) {
			// 更新加载提示
			document.getElementById('loadingTitle').textContent = '解析 MIDI 数据...';
			document.getElementById('loadingSubtitle').textContent = 
				fileSizeMB > 0 ? `文件大小: ${fileSizeMB.toFixed(1)} MB` : '空间索引构建中 · 对象池预热';
			
			let parsedMidi;
			
			if (fileSizeMB > 0.5 || buffer.byteLength > 512 * 1024) {
				parsedMidi = await parseMidiInWorker(buffer);
			} else {
				parsedMidi = EnhancedMidiParser.parse(buffer);
			}
			
			if (parsedMidi.timeMap && !parsedMidi.timeMap.tickToSeconds) {
				const timeMap = new TimeMap(parsedMidi.ppq || 480);
				timeMap.tempos = parsedMidi.timeMap.tempos || [{ tick: 0, tempo: 500000 }];
				parsedMidi.timeMap = timeMap;
			}
			
			document.getElementById('loadingTitle').textContent = '保存乐曲...';
			document.getElementById('loadingSubtitle').textContent = '正在写入本地存储';
			
			const songId = await addSongToList(
				fileName.replace(/\.(mid|midi|midi2)$/i, ''),
				parsedMidi,
				fileName
			);
			currentSongId = songId;
			
			if (midiData && midiData !== parsedMidi) {
				midiData = null;
			}
			midiData = parsedMidi;
			prepareNotes();
			updateTrackList();
			
			setTimeout(() => {
				router.navigate('play', { id: songId });
			}, 500);
		}
		
		async function handleFileSelect(event) {
			const file = event.target.files[0];
			if (!file) return;
			
			router.navigate('loading');
			
			try {
				await audioEngine.init();
				await dbStorage.init();
				
				const buffer = await file.arrayBuffer();
				const fileSizeMB = buffer.byteLength / (1024 * 1024);
				
				await processMidiBuffer(buffer, file.name, fileSizeMB);
				
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
				
				// 释放旧 MIDI 数据
				if (midiData && midiData !== song.midiData) {
					midiData = null;
				}
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
			// 释放旧数据引用，帮助 GC
			allNotes.length = 0;
			allNotes = [];
			
			// 切歌时必须重置播放时钟与进度条，否则残留旧曲目时间
			visualClock.time = 0;
			visualClock.lastFrameTime = 0;
			document.getElementById('timeDisplay').textContent = '0.00';
			nextNoteIndex = 0;
			
			if (appStore.getState().settings.objectPool) {
				trianglePool.releaseAll();
				particlePool.releaseAll();
				trianglePool.trim(200);
				particlePool.trim(500);
			}
			
			activeTriangles = [];
			activeParticles = [];
			
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
				
				// 防护：空音轨跳过统计计算，避免除以零
				if (!track.notes || track.notes.length === 0) return;
				
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
				if (router.currentPage === 'settings') closeModalAndReturn('settings');
				else if (router.currentPage === 'info') closeModalAndReturn('info');
				else if (router.currentPage === 'play') router.navigate('songs');
			}
		});
