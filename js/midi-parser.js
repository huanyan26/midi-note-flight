class UMPParser {
			static parseUMP(data) {
				const packets = [];
				let pos = 0;
				
				while (pos < data.length) {
					const messageType = (data[pos] >> 4) & 0xF;
					let packetSize;
					
					switch(messageType) {
						case 0: case 1: case 2: packetSize = 4; break;
						case 3: case 4: case 5: packetSize = 8; break;
						case 6: case 7: case 8: packetSize = 16; break;
						default: packetSize = 4;
					}
					
					if (pos + packetSize > data.length) break;
					
					const packet = data.slice(pos, pos + packetSize);
					packets.push(this.parsePacket(packet, messageType));
					pos += packetSize;
				}
				
				return packets;
			}

			static parsePacket(packet, messageType) {
				const group = packet[0] & 0xF;
				const status = packet[1] >> 4;
				const channel = packet[1] & 0xF;
				
				if (messageType === 1 || messageType === 2) {
					const note = packet[2];
					const velocity = packet[3];
					return {
						type: 'note',
						group,
						channel,
						note,
						velocity: messageType === 2 ? velocity : (velocity << 8) | packet[4],
						status
					};
				}
				
				return { type: 'unknown', messageType, data: packet };
			}

			static convertUMPToNotes(umpPackets) {
				const notes = [];
				let tick = 0;
				
				for (const packet of umpPackets) {
					if (packet.type === 'note' && packet.velocity > 0) {
						notes.push({
							tick: tick,
							note: packet.note,
							velocity: packet.velocity,
							channel: packet.channel
						});
					}
					tick += 10;
				}
				
				return notes;
			}
		}


		// 使用 Blob URL 创建内联 Worker，避免大文件解析时主线程卡死
		let midiWorker = null;
		let midiWorkerUrl = null;

		function getMidiWorker() {
			if (midiWorker) return midiWorker;

			// 内联 Worker 代码：复制 EnhancedMidiParser 的核心逻辑
			const workerCode = `
				class TimeMap {
					constructor(ppq = 480) { this.ppq = ppq; this.tempos = [{ tick: 0, tempo: 500000 }]; }
					addTempo(tick, tempo) { this.tempos.push({ tick, tempo }); this.tempos.sort((a, b) => a.tick - b.tick); }
					tickToSeconds(tick) {
						let sec = 0, lastTick = 0, tempo = 500000;
						for (const e of this.tempos) {
							if (e.tick > tick) break;
							sec += ((e.tick - lastTick) / this.ppq) * (tempo / 1000000);
							lastTick = e.tick; tempo = e.tempo;
						}
						return sec + ((tick - lastTick) / this.ppq) * (tempo / 1000000);
					}
				}

				function parseMIDI1(data) {
					let pos = 0;
					if (String.fromCharCode(...data.slice(0, 4)) !== 'MThd') throw new Error('Invalid MIDI header');
					pos += 4;
					const headerLen = (data[pos]<<24)|(data[pos+1]<<16)|(data[pos+2]<<8)|data[pos+3];
					pos += 4;
					const format = (data[pos]<<8)|data[pos+1]; pos += 2;
					const trackCount = (data[pos]<<8)|data[pos+1]; pos += 2;
					const ppq = (data[pos]<<8)|data[pos+1]; pos += 2;
					
					const timeMap = new TimeMap(ppq);
					const tracks = [];
					
					for (let i = 0; i < trackCount; i++) {
						if (pos + 4 > data.length) break;
						if (String.fromCharCode(...data.slice(pos, pos+4)) !== 'MTrk') { pos++; i--; continue; }
						pos += 4;
						const trackLen = (data[pos]<<24)|(data[pos+1]<<16)|(data[pos+2]<<8)|data[pos+3];
						pos += 4;
						const trackEnd = pos + trackLen;
						const track = parseTrack(data, pos, trackEnd, timeMap, i);
						if (track.notes.length > 0) tracks.push(track);
						pos = trackEnd;
					}
					
					return { format, ppq, timeMap, tracks };
				}

				function parseTrack(data, start, end, timeMap, trackId) {
					let pos = start, tick = 0, lastStatus = 0;
					const notes = [];
					let trackName = 'Track ' + (trackId + 1);
					
					while (pos < end) {
						let delta = 0;
						while (true) { const byte = data[pos++]; delta = (delta << 7) | (byte & 0x7F); if ((byte & 0x80) === 0) break; }
						tick += delta;
						if (pos >= end) break;
						
						let status = data[pos];
						if (status < 0x80) status = lastStatus;
						else { lastStatus = status; pos++; }
						
						const type = status & 0xF0;
						if (type === 0x90) {
							const note = data[pos++]; const vel = data[pos++];
							if (vel > 0) notes.push({ tick, note, velocity: vel });
						} else if (type === 0x80) { pos += 2; }
						else if (status === 0xFF) {
							const metaType = data[pos++];
							let len = 0;
							while (true) { const byte = data[pos++]; len = (len << 7) | (byte & 0x7F); if ((byte & 0x80) === 0) break; }
							if (metaType === 0x03 && len > 0) trackName = String.fromCharCode(...data.slice(pos, pos + len));
							else if (metaType === 0x51 && len === 3) timeMap.addTempo(tick, (data[pos]<<16)|(data[pos+1]<<8)|data[pos+2]);
							pos += len;
						} else if (type === 0xF0 || type === 0xF7) {
							let len = 0;
							while (true) { const byte = data[pos++]; len = (len << 7) | (byte & 0x7F); if ((byte & 0x80) === 0) break; }
							pos += len;
						} else {
							switch(type) { case 0xA0: case 0xB0: case 0xE0: pos += 2; break; case 0xC0: case 0xD0: pos += 1; break; default: pos += 1; }
						}
					}
					
					return { id: trackId, name: trackName, notes, color: ['#ff6b6b','#4ecdc4','#ffe66d','#95e1d3','#f38181','#aa96da','#fcbad3','#a8e6cf'][trackId % 8] };
				}

				self.onmessage = function(e) {
					try {
						const buffer = e.data;
						const data = new Uint8Array(buffer);
						const result = parseMIDI1(data);
						// 将 TimeMap 的 tempos 提取为可传输的纯数据
						const transferable = {
							format: result.format,
							ppq: result.ppq,
							tempos: result.timeMap.tempos,
							tracks: result.tracks
						};
						self.postMessage({ success: true, data: transferable });
					} catch(err) {
						self.postMessage({ success: false, error: err.message });
					}
				};
			`;

			const blob = new Blob([workerCode], { type: 'application/javascript' });
			midiWorkerUrl = URL.createObjectURL(blob);
			midiWorker = new Worker(midiWorkerUrl);
			return midiWorker;
		}

		// 终止 Worker 并释放 Blob URL，防止内存泄漏
		function terminateMidiWorker() {
			if (midiWorker) {
				midiWorker.terminate();
				midiWorker = null;
			}
			if (midiWorkerUrl) {
				URL.revokeObjectURL(midiWorkerUrl);
				midiWorkerUrl = null;
			}
		}

		function parseMidiInWorker(buffer) {
			return new Promise((resolve, reject) => {
				const worker = getMidiWorker();
				worker.onmessage = (e) => {
					if (e.data.success) {
						// 重建 TimeMap 对象
						const raw = e.data.data;
						const timeMap = new TimeMap(raw.ppq);
						timeMap.tempos = raw.tempos;
						resolve({
							format: raw.format,
							ppq: raw.ppq,
							timeMap: timeMap,
							tracks: raw.tracks,
							isMIDI2: false
						});
					} else {
						reject(new Error(e.data.error));
					}
				};
				worker.onerror = (err) => reject(err);
				worker.postMessage(buffer);
			});
		}


		class EnhancedMidiParser {
			static parse(buffer) {
				const data = new Uint8Array(buffer);
				
				if (data.length > 4 && data[0] === 0x00 && data[1] === 0x00 && 
					data[2] === 0x00 && (data[3] === 0x01 || data[3] === 0x02)) {
					return this.parseMIDI2(buffer);
				}
				
				return this.parseMIDI1(buffer);
			}

			static parseMIDI1(buffer) {
				const data = new Uint8Array(buffer);
				let pos = 0;
				
				if (String.fromCharCode(...data.slice(0, 4)) !== 'MThd') {
					throw new Error('Invalid MIDI header');
				}
				pos += 4;
				
				const headerLen = (data[pos]<<24)|(data[pos+1]<<16)|(data[pos+2]<<8)|data[pos+3];
				pos += 4;
				const format = (data[pos]<<8)|data[pos+1];
				pos += 2;
				const trackCount = (data[pos]<<8)|data[pos+1];
				pos += 2;
				const ppq = (data[pos]<<8)|data[pos+1];
				pos += 2;
				
				const timeMap = new TimeMap(ppq);
				const tracks = [];
				
				for (let i = 0; i < trackCount; i++) {
					if (pos + 4 > data.length) break;
					if (String.fromCharCode(...data.slice(pos, pos+4)) !== 'MTrk') {
						pos++;
						i--;
						continue;
					}
					pos += 4;
					
					const trackLen = (data[pos]<<24)|(data[pos+1]<<16)|(data[pos+2]<<8)|data[pos+3];
					pos += 4;
					
					const trackEnd = pos + trackLen;
					const track = this.parseTrack(data, pos, trackEnd, timeMap, i);
					if (track.notes.length > 0) tracks.push(track);
					pos = trackEnd;
				}
				
				return { format, ppq, timeMap, tracks, isMIDI2: false };
			}

			static parseMIDI2(buffer) {
				const data = new Uint8Array(buffer);
				const umpPackets = UMPParser.parseUMP(data);
				const notes = UMPParser.convertUMPToNotes(umpPackets);
				
				const timeMap = new TimeMap(480);
				const track = {
					id: 0,
					name: 'MIDI 2.0 Track',
					notes: notes,
					color: '#4ecdc4'
				};
				
				return { format: 2, ppq: 480, timeMap, tracks: [track], isMIDI2: true };
			}

			static parseTrack(data, start, end, timeMap, trackId) {
				let pos = start, tick = 0, lastStatus = 0;
				const notes = [];
				let trackName = `Track ${trackId + 1}`;
				
				while (pos < end) {
					let delta = 0;
					while (true) {
						const byte = data[pos++];
						delta = (delta << 7) | (byte & 0x7F);
						if ((byte & 0x80) === 0) break;
					}
					tick += delta;
					if (pos >= end) break;
					
					let status = data[pos];
					if (status < 0x80) status = lastStatus;
					else {
						lastStatus = status;
						pos++;
					}
					
					const type = status & 0xF0;
					
					if (type === 0x90) {
						const note = data[pos++];
						const vel = data[pos++];
						if (vel > 0) notes.push({ tick, note, velocity: vel });
					} else if (type === 0x80) {
						pos += 2;
					} else if (status === 0xFF) {
						const metaType = data[pos++];
						let len = 0;
						while (true) {
							const byte = data[pos++];
							len = (len << 7) | (byte & 0x7F);
							if ((byte & 0x80) === 0) break;
						}
						
						if (metaType === 0x03 && len > 0) {
							trackName = String.fromCharCode(...data.slice(pos, pos + len));
						} else if (metaType === 0x51 && len === 3) {
							const tempo = (data[pos]<<16)|(data[pos+1]<<8)|data[pos+2];
							timeMap.addTempo(tick, tempo);
						}
						pos += len;
					} else if (type === 0xF0 || type === 0xF7) {
						let len = 0;
						while (true) {
							const byte = data[pos++];
							len = (len << 7) | (byte & 0x7F);
							if ((byte & 0x80) === 0) break;
						}
						pos += len;
					} else {
						switch (type) {
							case 0xA0: case 0xB0: case 0xE0: pos += 2; break;
							case 0xC0: case 0xD0: pos += 1; break;
							default: pos += 1;
						}
					}
				}
				
				return { id: trackId, name: trackName, notes, color: CONFIG.COLORS[trackId % CONFIG.COLORS.length] };
			}
		}
