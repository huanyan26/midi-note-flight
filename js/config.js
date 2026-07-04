// 更新内容：
		// 1. Web Worker 异步 MIDI 解析（主线程零阻塞）
		// 2. 渲染循环 swap-remove（消除 splice O(n) 数组重排）
		// 3. 粒子分帧处理（每帧限制生成数量）
		// 4. 动态对象池（按需自动扩容）
		// 5. 音频抢占调度（限制复音数，防止爆音）
		// 6. LOD 细节层次（屏幕外/远距离音符降级）
		// 7. DOM 更新降频至 200ms
		// 8. 自适应性能降级（低FPS时自动减少粒子）


		const canvas = document.getElementById('canvas');
		// 立即设置 Canvas 尺寸，避免 renderLoop 首帧时尺寸为 0
		canvas.width = window.innerWidth || 800;
		canvas.height = window.innerHeight || 600;
		
		// alpha: false 需要每帧完全覆盖画布，否则显示黑底
		const ctx = canvas.getContext('2d', { alpha: false });
		ctx.imageSmoothingEnabled = false;
		
		// 离屏 Canvas 缓存（性能优化核心）
		let bgGridCache = null;      // 背景网格缓存
		let boundaryCache = null;     // 边界绘制缓存
		let cacheValid = false;       // 缓存是否有效
		
		let activeTriangles = [];
		let activeParticles = [];
		let allNotes = [];
		let midiData = null;
		let isPlaying = false;
		let playbackSpeed = 1;
		let lastScreenSize = { w: 0, h: 0 };
		let nextNoteIndex = 0;
		
		let visualClock = { time: 0, lastFrameTime: 0 };
		let spatialIndex = null;
		
		// 时间线密度直方图缓存（避免每帧 O(n²) filter）
		let densityHistogram = null;
		let densityBinDuration = 0;
		
		// FPS 计算
		let frameCount = 0;
		let lastFpsTime = 0;
		let currentFps = 0;
		let lastDomUpdateTime = 0;    // DOM更新节流


		function getAdaptiveConfig() {
			const minDim = Math.min(window.innerWidth, window.innerHeight);
			const maxDim = Math.max(window.innerWidth, window.innerHeight);
			const isMobile = window.innerWidth < 768;
			
			const baseSize = Math.max(12, minDim * 0.025);
			const margin = Math.max(30, minDim * 0.08);
			const flightTime = Math.max(1.0, minDim / 400);
			
			return {
				COLORS: ['#ff6b6b', '#4ecdc4', '#ffe66d', '#95e1d3', '#f38181', '#aa96da', '#fcbad3', '#a8e6cf'],
				MARGIN: margin,
				NOTE_SIZE: baseSize,
				GRAVITY: 9.8 * (minDim / 600),
				SPAWN_DURATION: 0.25,
				HIT_DURATION: 0.1,
				DESPAWN_DURATION: 0.15,
				FLIGHT_TIME: flightTime,
				CENTER_MARGIN: minDim * 0.15,
				PARTICLE_COUNT: isMobile ? 6 : 10,
				MAX_ACTIVE_NOTES: isMobile ? 80 : 200,  // 增大上限
				MAX_SPAWNS_PER_FRAME: isMobile ? 5 : 15, // 每帧最大生成数
				MAX_PARTICLES_PER_FRAME: isMobile ? 3 : 6 // 每帧最大粒子生成数
			};
		}
		
		let CONFIG = getAdaptiveConfig();
