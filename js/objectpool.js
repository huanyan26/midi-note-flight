class ObjectPool {
			constructor(createFn, resetFn, initialSize = 50) {
				this.createFn = createFn;
				this.resetFn = resetFn;
				this.available = [];
				this.inUse = new Set();
				this.totalCreated = 0;
				
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
					obj = this.createFn();
					this.totalCreated++;
				}
				this.inUse.add(obj);
				return obj;
			}

			release(obj) {
				if (this.inUse.has(obj)) {
					this.inUse.delete(obj);
					this.resetFn(obj);
					this.available.push(obj);
				}
			}

			releaseAll() {
				this.inUse.forEach(obj => {
					this.resetFn(obj);
					this.available.push(obj);
				});
				this.inUse.clear();
			}

			getStats() {
				return {
					available: this.available.length,
					inUse: this.inUse.size,
					total: this.totalCreated
				};
			}

			// 动态扩容：当可用对象不足时，批量预创建
			ensureCapacity(minAvailable) {
				const needed = minAvailable - this.available.length;
				if (needed > 0) {
					const batchSize = Math.min(needed, 100);
					for (let i = 0; i < batchSize; i++) {
						this.available.push(this.createFn());
						this.totalCreated++;
					}
				}
			}
		}
