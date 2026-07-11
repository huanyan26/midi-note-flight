class ObjectPool {
			constructor(createFn, resetFn, initialSize = 50, maxSize = 500) {
				this.createFn = createFn;
				this.resetFn = resetFn;
				this.available = [];
				this.inUse = new Set();  // 使用 Set 替代 WeakSet，支持遍历回收
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
				}
				return obj;
			}

			release(obj) {
				if (!obj) return;
				if (this.inUse.has(obj)) {
					this.inUse.delete(obj);
					this.resetFn(obj);
					this.available.push(obj);
				}
			}

			releaseAll() {
				// 将所有 in-use 对象回收到 available 队列
				for (const obj of this.inUse) {
					this.resetFn(obj);
					this.available.push(obj);
				}
				this.inUse.clear();
			}

			getStats() {
				return {
					available: this.available.length,
					inUse: this.inUse.size,
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
