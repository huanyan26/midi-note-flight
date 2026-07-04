class TimeMap {
			constructor(ppq = 480) {
				this.ppq = ppq;
				this.tempos = [{ tick: 0, tempo: 500000 }];
			}
			
			addTempo(tick, tempo) {
				this.tempos.push({ tick, tempo });
				this.tempos.sort((a, b) => a.tick - b.tick);
			}
			
			tickToSeconds(tick) {
				let sec = 0, lastTick = 0, tempo = 500000;
				for (const e of this.tempos) {
					if (e.tick > tick) break;
					sec += ((e.tick - lastTick) / this.ppq) * (tempo / 1000000);
					lastTick = e.tick;
					tempo = e.tempo;
				}
				return sec + ((tick - lastTick) / this.ppq) * (tempo / 1000000);
			}
			
			getBPM(tick) {
				let tempo = 500000;
				for (const e of this.tempos) {
					if (e.tick <= tick) tempo = e.tempo;
					else break;
				}
				return Math.round(60000000 / tempo);
			}
		}
