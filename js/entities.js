class PooledFlyingTriangle {
			constructor() {
				this.reset();
			}

			reset() {
				this.note = 0;
				this.velocity = 0;
				this.trackId = 0;
				this.trackName = '';
				this.spawnTime = 0;
				this.hitTime = 0;
				this.color = '#4ecdc4';
				this.frequency = 440;
				this.volume = 0.5;
				this.baseSize = 10;
				this.sizeMultiplier = 1;
				this.state = 'idle';
				this.opacity = 0;
				this.scale = 0;
				this.animTime = 0;
				this.hasPlayed = false;
				this.x = 0;
				this.y = 0;
				this.startX = 0;
				this.startY = 0;
				this.targetX = 0;
				this.targetY = 0;
				this.vx = 0;
				this.vy = 0;
				this.rotation = 0;
				this.rotSpeed = 0;
				this.targetBoundary = 'bottom';
			}

			init(noteData) {
				this.note = noteData.note;
				this.velocity = noteData.velocity;
				this.trackId = noteData.trackId;
				this.trackName = noteData.trackName;
				this.spawnTime = noteData.spawnTime;
				this.hitTime = noteData.hitTime;
				this.color = CONFIG.COLORS[this.trackId % CONFIG.COLORS.length];
				
				this.frequency = 440 * Math.pow(2, (this.note - 69) / 12);
				this.volume = this.velocity / 127;
				
				const noteRange = 127;
				const normalizedNote = this.note / noteRange;
				const normalizedVel = this.velocity / 127;
				const pitchFactor = 1.4 * Math.pow(0.5, normalizedNote);
				const velFactor = 0.3 + normalizedVel * normalizedVel * 1.2;
				const sizeMultiplier = Math.max(0.4, Math.min(2.0, pitchFactor * velFactor));
				
				this.baseSize = CONFIG.NOTE_SIZE * sizeMultiplier;
				this.sizeMultiplier = sizeMultiplier;
				
				this.state = 'spawning';
				this.opacity = 0;
				this.scale = 0;
				this.animTime = 0;
				this.hasPlayed = false;
				
				this.calculatePath();
				
				this.x = this.startX;
				this.y = this.startY;
				this.rotation = Math.random() * Math.PI * 2;
				this.rotSpeed = (Math.random() - 0.5) * 0.15;
				
				// 预计算颜色（避免每帧 draw 时重复计算）
				const rgb = cachedHexToRgb(this.color);
				const brightness = 0.7 + (1 - this.note / 127) * 0.3;
				this.cachedFillColor = `rgb(${Math.floor(rgb.r * brightness)}, ${Math.floor(rgb.g * brightness)}, ${Math.floor(rgb.b * brightness)})`;
				this.cachedTrailColor = this.color + '40';
			}

			calculatePath() {
				const m = CONFIG.MARGIN;
				const w = canvas.width;
				const h = canvas.height;
				
				const boundaries = ['left', 'right', 'top', 'bottom'];
				this.targetBoundary = boundaries[this.trackId % 4];
				
				switch(this.targetBoundary) {
					case 'left':
						this.targetX = m;
						this.targetY = h / 2 + (Math.random() - 0.5) * (h * 0.6);
						break;
					case 'right':
						this.targetX = w - m;
						this.targetY = h / 2 + (Math.random() - 0.5) * (h * 0.6);
						break;
					case 'top':
						this.targetX = w / 2 + (Math.random() - 0.5) * (w * 0.6);
						this.targetY = m;
						break;
					case 'bottom':
						this.targetX = w / 2 + (Math.random() - 0.5) * (w * 0.6);
						this.targetY = h - m;
						break;
				}
				
				this.targetX = Math.max(m, Math.min(w - m, this.targetX));
				this.targetY = Math.max(m, Math.min(h - m, this.targetY));
				
				const centerMargin = CONFIG.CENTER_MARGIN;
				const safeZone = Math.min(w, h) * 0.3;
				
				let attempts = 0;
				do {
					this.startX = centerMargin + Math.random() * (w - 2 * centerMargin);
					this.startY = centerMargin + Math.random() * (h - 2 * centerMargin);
					attempts++;
				} while (attempts < 10 && 
						 Math.hypot(this.startX - this.targetX, this.startY - this.targetY) < safeZone);
				
				const dt = CONFIG.FLIGHT_TIME;
				this.vx = (this.targetX - this.startX) / dt;
				this.vy = (this.targetY - this.startY - 0.5 * CONFIG.GRAVITY * dt * dt) / dt;
				
				const perturbation = Math.min(w, h) * 0.02;
				this.vx += (Math.random() - 0.5) * perturbation;
				this.vy += (Math.random() - 0.5) * perturbation;
			}

			update(currentTime, dt) {
				if (this.state === 'idle') return false;
				
				if (this.state === 'spawning') {
					this.animTime += dt;
					const progress = Math.min(this.animTime / CONFIG.SPAWN_DURATION, 1);
					this.scale = Easing.easeOutBack(progress);
					this.opacity = Easing.easeOut(progress);
					
					if (progress >= 1) {
						this.state = 'flying';
						this.scale = 1;
						this.opacity = 1;
					}
					return true;
				}
				
				if (this.state === 'flying') {
					this.x += this.vx * dt;
					this.y += this.vy * dt;
					this.vy += CONFIG.GRAVITY * dt;
					this.rotation += this.rotSpeed;
					
					const margin = CONFIG.MARGIN * 2;
					if (this.x < -margin || this.x > canvas.width + margin ||
						this.y < -margin || this.y > canvas.height + margin) {
						if (!this.hasPlayed && currentTime >= this.hitTime) {
							this.hasPlayed = true;
							this.state = 'despawning';
							this.animTime = 0;
						}
					}
					
					if (currentTime >= this.hitTime && !this.hasPlayed) {
						this.x = this.targetX;
						this.y = this.targetY;
						this.hasPlayed = true;
						this.state = 'hitting';
						this.animTime = 0;
						audioEngine.playNote(this.frequency, this.volume, this.trackId);
						
						// 分帧粒子生成 + 性能自适应
						const effectiveCount = PerfDegrader.getParticleCount(CONFIG.PARTICLE_COUNT);
						if (effectiveCount > 0 && appStore.getState().settings.objectPool) {
							particlePool.ensureCapacity(effectiveCount + 5);
							const poolStats = particlePool.getStats();
							const count = Math.min(effectiveCount, poolStats.available);
							const maxPerHit = CONFIG.MAX_PARTICLES_PER_FRAME;
							const actualCount = Math.min(count, maxPerHit);
							for (let i = 0; i < actualCount; i++) {
								const p = particlePool.acquire();
								p.init(this.x, this.y, this.color, this.targetBoundary);
								activeParticles.push(p);
							}
						} else if (effectiveCount > 0) {
							const actualCount = Math.min(effectiveCount, CONFIG.MAX_PARTICLES_PER_FRAME);
							for (let i = 0; i < actualCount; i++) {
								activeParticles.push(new Particle(this.x, this.y, this.color, this.targetBoundary));
							}
						}
					}
					return true;
				}
				
				if (this.state === 'hitting') {
					this.animTime += dt;
					const flash = Math.sin(this.animTime * 40) * 0.4 + 0.6;
					this.opacity = flash;
					
					if (this.animTime >= CONFIG.HIT_DURATION) {
						this.state = 'despawning';
						this.animTime = 0;
					}
					return true;
				}
				
				if (this.state === 'despawning') {
					this.animTime += dt;
					const progress = Math.min(this.animTime / CONFIG.DESPAWN_DURATION, 1);
					this.scale = 1 - Easing.easeIn(progress) * 0.3;
					this.opacity = 1 - Easing.easeIn(progress);
					
					if (progress >= 1) {
						this.state = 'idle';
						return false;
					}
					return true;
				}
				
				return false;
			}

			draw(ctx) {
				if (this.state === 'idle' || this.opacity <= 0.01) return;
				
				ctx.save();
				ctx.globalAlpha = this.opacity;
				
				if (this.state === 'flying') {
					ctx.strokeStyle = this.cachedTrailColor;
					ctx.lineWidth = Math.max(1, CONFIG.NOTE_SIZE / 10);
					ctx.setLineDash([CONFIG.NOTE_SIZE * 0.3, CONFIG.NOTE_SIZE * 0.3]);
					ctx.beginPath();
					ctx.moveTo(this.startX, this.startY);
					ctx.lineTo(this.x, this.y);
					ctx.stroke();
					ctx.setLineDash([]);
				}
				
				ctx.translate(this.x, this.y);
				ctx.rotate(this.rotation);
				ctx.scale(this.scale, this.scale);

				ctx.beginPath();
				const s = this.baseSize;
				ctx.moveTo(0, -s);
				ctx.lineTo(-s * 0.866, s * 0.5);
				ctx.lineTo(s * 0.866, s * 0.5);
				ctx.closePath();

				ctx.fillStyle = this.cachedFillColor;
				ctx.fill();
				ctx.strokeStyle = '#000';
				ctx.lineWidth = Math.max(1, s / 6);
				ctx.stroke();

				ctx.restore();
			}
		}


		class PooledParticle {
			constructor() {
				this.reset();
			}

			reset() {
				this.x = 0;
				this.y = 0;
				this.color = '#4ecdc4';
				this.life = 0;
				this.vx = 0;
				this.vy = 0;
				this.size = 0;
				this.rotation = 0;
				this.rotSpeed = 0;
				this.scale = 0;
				this.spawnProgress = 0;
				this.active = false;
			}

			init(x, y, color, boundary) {
				this.x = x;
				this.y = y;
				this.color = color;
				this.life = 1;
				this.active = true;
				this.spawnProgress = 0;
				
				let angle;
				switch(boundary) {
					case 'left': angle = 0; break;
					case 'right': angle = Math.PI; break;
					case 'top': angle = Math.PI / 2; break;
					case 'bottom': angle = -Math.PI / 2; break;
					default: angle = Math.random() * Math.PI * 2;
				}
				
				angle += (Math.random() - 0.5) * Math.PI / 2;
				const speed = Math.random() * (CONFIG.NOTE_SIZE * 0.6) + (CONFIG.NOTE_SIZE * 0.3);
				this.vx = Math.cos(angle) * speed;
				this.vy = Math.sin(angle) * speed;
				this.size = Math.random() * (CONFIG.NOTE_SIZE * 0.4) + (CONFIG.NOTE_SIZE * 0.15);
				this.rotation = Math.random() * Math.PI * 2;
				this.rotSpeed = (Math.random() - 0.5) * 0.3;
			}

			update() {
				if (!this.active) return false;
				
				if (this.spawnProgress < 1) {
					this.spawnProgress += 0.15;
					this.scale = Easing.easeOutBack(Math.min(this.spawnProgress, 1));
				}
				
				this.x += this.vx;
				this.y += this.vy;
				this.vy += 0.5;
				this.rotation += this.rotSpeed;
				this.life -= 0.03;
				this.vx *= 0.95;
				this.vy *= 0.95;
				
				if (this.life <= 0) {
					this.active = false;
					return false;
				}
				return true;
			}

			draw(ctx) {
				if (!this.active || this.life <= 0) return;
				ctx.save();
				ctx.translate(this.x, this.y);
				ctx.rotate(this.rotation);
				ctx.scale(this.scale * this.life, this.scale * this.life);
				ctx.fillStyle = this.color;
				const s = this.size;
				ctx.fillRect(-s/2, -s/2, s, s);
				ctx.strokeStyle = '#000';
				ctx.lineWidth = Math.max(1, s / 4);
				ctx.strokeRect(-s/2, -s/2, s, s);
				ctx.restore();
			}
		}


		const trianglePool = new ObjectPool(
			() => new PooledFlyingTriangle(),
			(obj) => obj.reset(),
			200  // 增大初始池
		);

		const particlePool = new ObjectPool(
			() => new PooledParticle(),
			(obj) => obj.reset(),
			500  // 增大初始池
		);


		class Particle {
			constructor(x, y, color, boundary) {
				this.x = x;
				this.y = y;
				this.color = color;
				this.life = 1;
				
				let angle;
				switch(boundary) {
					case 'left': angle = 0; break;
					case 'right': angle = Math.PI; break;
					case 'top': angle = Math.PI / 2; break;
					case 'bottom': angle = -Math.PI / 2; break;
					default: angle = Math.random() * Math.PI * 2;
				}
				
				angle += (Math.random() - 0.5) * Math.PI / 2;
				const speed = Math.random() * (CONFIG.NOTE_SIZE * 0.6) + (CONFIG.NOTE_SIZE * 0.3);
				this.vx = Math.cos(angle) * speed;
				this.vy = Math.sin(angle) * speed;
				this.size = Math.random() * (CONFIG.NOTE_SIZE * 0.4) + (CONFIG.NOTE_SIZE * 0.15);
				this.rotation = Math.random() * Math.PI * 2;
				this.rotSpeed = (Math.random() - 0.5) * 0.3;
				this.scale = 0;
				this.spawnProgress = 0;
			}
			
			update() {
				if (this.spawnProgress < 1) {
					this.spawnProgress += 0.15;
					this.scale = Easing.easeOutBack(Math.min(this.spawnProgress, 1));
				}
				this.x += this.vx;
				this.y += this.vy;
				this.vy += 0.5;
				this.rotation += this.rotSpeed;
				this.life -= 0.03;
				this.vx *= 0.95;
				this.vy *= 0.95;
			}
			
			draw(ctx) {
				if (this.life <= 0) return;
				ctx.save();
				ctx.translate(this.x, this.y);
				ctx.rotate(this.rotation);
				ctx.scale(this.scale * this.life, this.scale * this.life);
				ctx.fillStyle = this.color;
				const s = this.size;
				ctx.fillRect(-s/2, -s/2, s, s);
				ctx.strokeStyle = '#000';
				ctx.lineWidth = Math.max(1, s / 4);
				ctx.strokeRect(-s/2, -s/2, s, s);
				ctx.restore();
			}
		}
