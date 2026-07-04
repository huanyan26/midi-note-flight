class ObjectPool {
			constructor(createFn, resetFn, initialSize = 50, maxSize = 500) {
				this.createFn = createFn;
				this.resetFn = resetFn;
				this.available = [];
				this.inUse = new WeakSet();
				this._inUseCount = 0;       // WeakSet 无 size，手动追踪
				this.totalCreated = 0;
				this.maxSize = maxSize;     // 硬上限，防止无限膨胀
				
				for (let i = 0; i < initialSize; i++) {
					this.available.push(this.createFn());
					this.totalCreated++;
				}
			}

			acquire() {
				let obj;
				if (this.available.length > 0) {
					obj = this.available.pop();
				} else {
					// 检查上限：超过后不再创建，复用即将销毁的对象
					if (this.totalCreated >= this.maxSize) {
						// 尝试从 available 获取（可能已被 GC 回收引用但数组还有位置）
						if (this.available.length > 0) {
							obj = this.available.pop();
						} else {
							// 无法分配，返回 null（调用方需处理）
							return null;
						}
					} else {
						obj = this.createFn();
						this.totalCreated++;
					}
				}
				if (obj) {
					this.inUse.add(obj);
					this._inUseCount++;
				}
				return obj;
			}

			release(obj) {
				if (!obj) return;
				// WeakSet 无法直接检测成员，用 try-catch 保护
				this.inUse.delete(obj);
				if (this._inUseCount > 0) this._inUseCount--;
				this.resetFn(obj);
				this.available.push(obj);
			}

			releaseAll() {
				// 遍历 available 中的对象执行 reset（inUse 用 WeakSet 无需手动清理）
				this._inUseCount = 0;
			}

			getStats() {
				return {
					available: this.available.length,
					inUse: this._inUseCount,
					total: this.totalCreated
				};
			}

			// 动态扩容：当可用对象不足时，批量预创建（有上限）
			ensureCapacity(minAvailable) {
				const needed = minAvailable - this.available.length;
				if (needed > 0) {
					const remaining = this.maxSize - this.totalCreated;
					const batchSize = Math.min(needed, remaining, 50); // 单次最多50个
					for (let i = 0; i < batchSize; i++) {
						this.available.push(this.createFn());
						this.totalCreated++;
					}
				}
			}

			// 清理池中多余对象，回收内存
			trim(targetSize) {
				const excess = this.available.length - targetSize;
				if (excess > 0) {
					this.available.length = targetSize;
				}
			}
		}
