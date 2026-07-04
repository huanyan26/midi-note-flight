const PerfDegrader = {
			fpsHistory: new Float32Array(30), // 最近30帧FPS
			fpsIndex: 0,
			fpsFilled: 0,
			currentLevel: 0, // 0=全效, 1=减少粒子, 2=关闭粒子, 3=跳过远距离绘制

			recordFrame(dt) {
				const instantFps = dt > 0 ? 1 / dt : 60;
				this.fpsHistory[this.fpsIndex] = instantFps;
				this.fpsIndex = (this.fpsIndex + 1) % 30;
				if (this.fpsFilled < 30) this.fpsFilled++;
			},

			getAverageFps() {
				if (this.fpsFilled === 0) return 60;
				let sum = 0;
				for (let i = 0; i < this.fpsFilled; i++) sum += this.fpsHistory[i];
				return sum / this.fpsFilled;
			},

			update() {
				const avgFps = this.getAverageFps();
				if (avgFps < 20) this.currentLevel = 3;
				else if (avgFps < 35) this.currentLevel = 2;
				else if (avgFps < 50) this.currentLevel = 1;
				else this.currentLevel = 0;
			},

			getParticleCount(base) {
				switch(this.currentLevel) {
					case 0: return base;
					case 1: return Math.max(2, Math.floor(base * 0.5));
					case 2: return 0;
					case 3: return 0;
				}
			},

			shouldSkipFarNotes() { return this.currentLevel >= 3; },
			shouldSkipParticles() { return this.currentLevel >= 2; }
		};
