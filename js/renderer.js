const colorCache = new Map();
		function cachedHexToRgb(hex) {
			let cached = colorCache.get(hex);
			if (cached) return cached;
			const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
			cached = result ? {
				r: parseInt(result[1], 16),
				g: parseInt(result[2], 16),
				b: parseInt(result[3], 16)
			} : { r: 255, g: 255, b: 255 };
			colorCache.set(hex, cached);
			return cached;
		}


		function buildBackgroundCache() {
			const w = canvas.width, h = canvas.height;
			
			// 构建背景网格缓存
			if (!bgGridCache || bgGridCache.width !== w || bgGridCache.height !== h) {
				bgGridCache = document.createElement('canvas');
				bgGridCache.width = w;
				bgGridCache.height = h;
			}
			const gctx = bgGridCache.getContext('2d');
			gctx.fillStyle = '#fafafa';
			gctx.fillRect(0, 0, w, h);
			
			const gridSize = Math.max(40, Math.min(w, h) / 10);
			gctx.fillStyle = '#e5e5e5';
			for (let x = gridSize; x < w; x += gridSize) {
				for (let y = gridSize; y < h; y += gridSize) {
					gctx.beginPath();
					gctx.arc(x, y, Math.max(1, gridSize / 40), 0, Math.PI * 2);
					gctx.fill();
				}
			}
			
			// 构建边界缓存
			if (!boundaryCache || boundaryCache.width !== w || boundaryCache.height !== h) {
				boundaryCache = document.createElement('canvas');
				boundaryCache.width = w;
				boundaryCache.height = h;
			}
			const bctx = boundaryCache.getContext('2d');
			bctx.clearRect(0, 0, w, h);
			
			const m = CONFIG.MARGIN;
			const colors = ['#ff6b6b', '#4ecdc4', '#ffe66d', '#f38181'];
			const boundaries = ['left', 'right', 'top', 'bottom'];
			
			for (let i = 0; i < 4; i++) {
				const boundary = boundaries[i];
				bctx.fillStyle = colors[i];
				bctx.strokeStyle = '#000';
				bctx.lineWidth = Math.max(2, m / 30);
				
				switch(boundary) {
					case 'left':
						bctx.fillRect(0, 0, m, h);
						bctx.strokeRect(0, 0, m, h);
						break;
					case 'right':
						bctx.fillRect(w - m, 0, m, h);
						bctx.strokeRect(w - m, 0, m, h);
						break;
					case 'top':
						bctx.fillRect(m, 0, w - 2*m, m);
						bctx.strokeRect(m, 0, w - 2*m, m);
						break;
					case 'bottom':
						bctx.fillRect(m, h - m, w - 2*m, m);
						bctx.strokeRect(m, h - m, w - 2*m, m);
						break;
				}
			}
			
			cacheValid = true;
		}
		
		function invalidateCache() {
			cacheValid = false;
			densityHistogram = null;
		}
		
		// 预计算时间线密度直方图（prepareNotes 时调用一次，避免每帧 O(n²)）
		function buildDensityHistogram() {
			if (allNotes.length === 0) {
				densityHistogram = null;
				return;
			}
			const maxTime = allNotes[allNotes.length - 1].hitTime + 2;
			const barW = canvas.width - 2 * CONFIG.MARGIN;
			const binWidth = Math.max(3, barW / 100);
			const bins = Math.floor(barW / binWidth);
			densityBinDuration = maxTime / bins;
			densityHistogram = new Uint16Array(bins);
			
			for (const note of allNotes) {
				const bin = Math.floor(note.hitTime / densityBinDuration);
				if (bin >= 0 && bin < bins) {
					densityHistogram[bin]++;
				}
			}
		}


		// swap-remove 辅助：O(1) 删除数组元素（不保持顺序）
		function swapRemove(arr, i) {
			const last = arr.length - 1;
			if (i < last) arr[i] = arr[last];
			arr.length = last;
		}

		function renderLoop(timestamp) {
			if (!visualClock.lastFrameTime) visualClock.lastFrameTime = timestamp;
			const frameDt = Math.min((timestamp - visualClock.lastFrameTime) / 1000, 0.1); // 上限100ms防止跳帧
			visualClock.lastFrameTime = timestamp;
			
			// 性能降级记录
			PerfDegrader.recordFrame(frameDt);
			
			// FPS 计算（每秒更新一次）
			frameCount++;
			if (timestamp - lastFpsTime >= 1000) {
				currentFps = frameCount;
				frameCount = 0;
				lastFpsTime = timestamp;
				PerfDegrader.update(); // 更新降级级别
				
				// 节流 DOM 更新（每 200ms 更新一次，从500ms降低）
				if (timestamp - lastDomUpdateTime >= 200) {
					lastDomUpdateTime = timestamp;
					if (appStore.getState().settings.showPerfPanel) {
						document.getElementById('fpsDisplay').textContent = currentFps;
						document.getElementById('objDisplay').textContent = activeTriangles.length + activeParticles.length;
						const tStats = trianglePool.getStats();
						const pStats = particlePool.getStats();
						document.getElementById('poolDisplay').textContent = 
							`T:${tStats.available}/${tStats.inUse} P:${pStats.available}/${pStats.inUse}`;
						document.getElementById('driftDisplay').textContent = appStore.getState().audioDrift.toFixed(1);
					}
				}
			}
			
			const audioTime = audioEngine.getTime();
			
			// 高精度同步模式：仅在播放时同步，停止时保持 visualClock 不变
			if (isPlaying) {
				if (appStore.getState().settings.highPrecision) {
					const drift = Math.abs(audioTime - visualClock.time) * 1000;
					if (drift > 50) {
						visualClock.time = audioTime;
					} else {
						visualClock.time += (audioTime - visualClock.time) * 0.1;
					}
				} else {
					visualClock.time = audioTime;
				}
			}
			
			// 时间显示降频更新（每200ms，reset后立即更新）
			if (timestamp - lastDomUpdateTime >= 200 || visualClock.time === 0) {
				document.getElementById('timeDisplay').textContent = visualClock.time.toFixed(2);
			}
			
			if (isPlaying) {
				const settings = appStore.getState().settings;
				const poolEnabled = settings.objectPool;
				
				// 重置每帧音频计数器
				audioEngine.resetFrameCounter();
				
				// === 分帧生成音符（限制每帧生成数量） ===
				let spawnsThisFrame = 0;
				const maxSpawns = CONFIG.MAX_SPAWNS_PER_FRAME;
				
				if (poolEnabled) {
					trianglePool.ensureCapacity(maxSpawns + 10);
				}
				
				while (nextNoteIndex < allNotes.length && 
					   allNotes[nextNoteIndex].spawnTime <= visualClock.time &&
					   activeTriangles.length < CONFIG.MAX_ACTIVE_NOTES &&
					   spawnsThisFrame < maxSpawns) {
					
					if (poolEnabled) {
						const triangle = trianglePool.acquire();
						triangle.init(allNotes[nextNoteIndex]);
						activeTriangles.push(triangle);
					} else {
						const noteData = allNotes[nextNoteIndex];
						const t = new PooledFlyingTriangle();
						t.init(noteData);
						activeTriangles.push(t);
					}
					
					nextNoteIndex++;
					spawnsThisFrame++;
				}
				
				// === swap-remove 更新三角形（消除 splice O(n)） ===
				if (poolEnabled) {
					for (let i = activeTriangles.length - 1; i >= 0; i--) {
						const t = activeTriangles[i];
						const alive = t.update(visualClock.time, frameDt);
						if (!alive) {
							trianglePool.release(t);
							swapRemove(activeTriangles, i);
						}
					}
				} else {
					for (let i = activeTriangles.length - 1; i >= 0; i--) {
						if (!activeTriangles[i].update(visualClock.time, frameDt)) {
							swapRemove(activeTriangles, i);
						}
					}
				}
				
				// === swap-remove 更新粒子 ===
				if (poolEnabled) {
					for (let i = activeParticles.length - 1; i >= 0; i--) {
						const p = activeParticles[i];
						const alive = p.update();
						if (!alive) {
							particlePool.release(p);
							swapRemove(activeParticles, i);
						}
					}
				} else {
					for (let i = activeParticles.length - 1; i >= 0; i--) {
						activeParticles[i].update();
						if (!activeParticles[i].active && activeParticles[i].life <= 0) {
							swapRemove(activeParticles, i);
						}
					}
				}
				
				// 节流 activeCount 更新
				if (timestamp - lastDomUpdateTime >= 200) {
					document.getElementById('activeCount').textContent = activeTriangles.length;
				}
				
				// 自动停止检测
				if (allNotes.length > 0 && nextNoteIndex >= allNotes.length && activeTriangles.length === 0) {
					const lastNoteTime = allNotes[allNotes.length - 1].hitTime;
					if (visualClock.time >= lastNoteTime + 2) {
						stopPlayback();
					}
				}
			}
			
			draw();
			requestAnimationFrame(renderLoop);
		}
		
		function draw() {
			// 使用预渲染的背景缓存（包含网格 + 背景色）
			if (!cacheValid) buildBackgroundCache();
			ctx.drawImage(bgGridCache, 0, 0);
			
			// 边界覆盖层（半透明叠加）
			ctx.drawImage(boundaryCache, 0, 0);
			
			// === 绘制粒子（性能降级时可跳过） ===
			if (!PerfDegrader.shouldSkipParticles()) {
				for (let i = 0, len = activeParticles.length; i < len; i++) {
					activeParticles[i].draw(ctx);
				}
			}
			
			// === 绘制三角形（含LOD策略） ===
			const skipFar = PerfDegrader.shouldSkipFarNotes();
			for (let i = 0, len = activeTriangles.length; i < len; i++) {
				const t = activeTriangles[i];
				// LOD: 性能紧急时跳过飞行的远距离三角形
				if (skipFar && t.state === 'flying') {
					const dx = t.x - t.targetX;
					const dy = t.y - t.targetY;
					const dist = dx * dx + dy * dy; // 平方距离，避免 sqrt
					const farThreshold = canvas.width * canvas.width * 0.25;
					if (dist > farThreshold) continue;
				}
				t.draw(ctx);
			}
			
			if ((isPlaying || visualClock.time > 0) && appStore.getState().settings.showProgress) {
				drawTimeline();
			}
		}
		
		function drawBoundaries() {
			const m = CONFIG.MARGIN;
			const colors = ['#ff6b6b', '#4ecdc4', '#ffe66d', '#f38181'];
			const boundaries = ['left', 'right', 'top', 'bottom'];
			
			boundaries.forEach((boundary, i) => {
				ctx.fillStyle = colors[i];
				ctx.strokeStyle = '#000';
				ctx.lineWidth = Math.max(2, m / 30);
				
				switch(boundary) {
					case 'left':
						ctx.fillRect(0, 0, m, canvas.height);
						ctx.strokeRect(0, 0, m, canvas.height);
						break;
					case 'right':
						ctx.fillRect(canvas.width - m, 0, m, canvas.height);
						ctx.strokeRect(canvas.width - m, 0, m, canvas.height);
						break;
					case 'top':
						ctx.fillRect(m, 0, canvas.width - 2*m, m);
						ctx.strokeRect(m, 0, canvas.width - 2*m, m);
						break;
					case 'bottom':
						ctx.fillRect(m, canvas.height - m, canvas.width - 2*m, m);
						ctx.strokeRect(m, canvas.height - m, canvas.width - 2*m, m);
						break;
				}
			});
		}
		
		function drawTimeline() {
			const maxTime = allNotes.length > 0 
				? allNotes[allNotes.length - 1].hitTime + 2
				: 10;
			const progress = Math.min(visualClock.time / maxTime, 1);
			
			const barY = canvas.height - CONFIG.MARGIN / 2;
			const barX = CONFIG.MARGIN;
			const barW = canvas.width - 2 * CONFIG.MARGIN;
			const barH = Math.max(8, CONFIG.MARGIN / 7);
			
			ctx.fillStyle = '#ddd';
			ctx.fillRect(barX, barY - barH/2, barW, barH);
			ctx.strokeStyle = '#000';
			ctx.lineWidth = Math.max(1, barH / 6);
			ctx.strokeRect(barX, barY - barH/2, barW, barH);
			
			ctx.fillStyle = '#4ecdc4';
			ctx.fillRect(barX, barY - barH/2, barW * progress, barH);
			
			// 使用预计算密度直方图（O(bins) 代替 O(n²)）
			if (densityHistogram) {
				const densityHeight = CONFIG.MARGIN / 2;
				const binWidth = Math.max(3, barW / 100);
				const bins = densityHistogram.length;
				
				for (let i = 0; i < bins; i++) {
					const count = densityHistogram[i];
					if (count > 0) {
						const height = Math.min(count * 3, densityHeight);
						ctx.fillStyle = count > 5 ? '#ff6b6b' : '#4ecdc4';
						ctx.fillRect(barX + i * binWidth, barY - barH/2 - height - 2, binWidth - 1, height);
					}
				}
			}
		}


		function resize() {
			canvas.width = window.innerWidth;
			canvas.height = window.innerHeight;
			
			CONFIG = getAdaptiveConfig();
			
			// 缓存失效，下次 draw 时重建
			invalidateCache();
			
			const currentSize = { w: canvas.width, h: canvas.height };
			const sizeChanged = Math.abs(currentSize.w - lastScreenSize.w) > 100 || 
							   Math.abs(currentSize.h - lastScreenSize.h) > 100;
			
			if (sizeChanged && activeTriangles.length > 0) {
				for (let i = 0, len = activeTriangles.length; i < len; i++) {
					const t = activeTriangles[i];
					if (t.state === 'spawning' || t.state === 'flying') {
						t.calculatePath();
					}
				}
			}
			
			if (spatialIndex && appStore.getState().settings.spatialIndex) {
				spatialIndex = new QuadTree(
					new Rectangle(0, 0, canvas.width, canvas.height),
					4,
					8
				);
			}
			
			lastScreenSize = currentSize;
		}
		
		// 防抖版本的 resize
		function debouncedResize() {
			if (resizeDebounceTimer) clearTimeout(resizeDebounceTimer);
			resizeDebounceTimer = setTimeout(resize, 50);
		}
		
		window.addEventListener('resize', debouncedResize);
		window.addEventListener('orientationchange', () => setTimeout(resize, 150));
