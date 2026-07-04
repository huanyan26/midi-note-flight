class Rectangle {
			constructor(x, y, width, height) {
				this.x = x;
				this.y = y;
				this.width = width;
				this.height = height;
			}

			contains(point) {
				return point.x >= this.x && point.x <= this.x + this.width &&
					   point.y >= this.y && point.y <= this.y + this.height;
			}

			intersects(range) {
				return !(range.x > this.x + this.width ||
						range.x + range.width < this.x ||
						range.y > this.y + this.height ||
						range.y + range.height < this.y);
			}
		}

		class QuadTree {
			constructor(boundary, capacity = 4, maxDepth = 8) {
				this.boundary = boundary;
				this.capacity = capacity;
				this.maxDepth = maxDepth;
				this.points = [];
				this.divided = false;
				this.nw = null;
				this.ne = null;
				this.sw = null;
				this.se = null;
			}

			subdivide() {
				const x = this.boundary.x;
				const y = this.boundary.y;
				const w = this.boundary.width / 2;
				const h = this.boundary.height / 2;

				this.nw = new QuadTree(new Rectangle(x, y, w, h), this.capacity, this.maxDepth - 1);
				this.ne = new QuadTree(new Rectangle(x + w, y, w, h), this.capacity, this.maxDepth - 1);
				this.sw = new QuadTree(new Rectangle(x, y + h, w, h), this.capacity, this.maxDepth - 1);
				this.se = new QuadTree(new Rectangle(x + w, y + h, w, h), this.capacity, this.maxDepth - 1);

				this.divided = true;
			}

			insert(point) {
				if (!this.boundary.contains(point)) return false;

				if (this.points.length < this.capacity && !this.divided && this.maxDepth > 0) {
					this.points.push(point);
					return true;
				}

				if (!this.divided && this.maxDepth > 0) {
					this.subdivide();
					for (const p of this.points) {
						this.insertIntoChildren(p);
					}
					this.points = [];
				}

				if (this.divided) {
					return this.insertIntoChildren(point);
				}

				this.points.push(point);
				return true;
			}

			insertIntoChildren(point) {
				return this.nw.insert(point) || this.ne.insert(point) ||
					   this.sw.insert(point) || this.se.insert(point);
			}

			query(range, found = []) {
				if (!this.boundary.intersects(range)) return found;

				for (const p of this.points) {
					if (range.contains(p)) found.push(p);
				}

				if (this.divided) {
					this.nw.query(range, found);
					this.ne.query(range, found);
					this.sw.query(range, found);
					this.se.query(range, found);
				}

				return found;
			}

			clear() {
				this.points = [];
				this.divided = false;
				this.nw = null;
				this.ne = null;
				this.sw = null;
				this.se = null;
			}

			getAllPoints() {
				let all = [...this.points];
				if (this.divided) {
					all = all.concat(this.nw.getAllPoints());
					all = all.concat(this.ne.getAllPoints());
					all = all.concat(this.sw.getAllPoints());
					all = all.concat(this.se.getAllPoints());
				}
				return all;
			}
		}
