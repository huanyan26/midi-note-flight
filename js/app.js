if ('serviceWorker' in navigator) {
			window.addEventListener('load', () => {
				navigator.serviceWorker.register('data:text/javascript;base64,' + btoa(`
					self.addEventListener('install', e => {
						e.waitUntil(self.skipWaiting());
					});
					self.addEventListener('activate', e => {
						e.waitUntil(self.clients.claim());
					});
					self.addEventListener('fetch', e => {
						e.respondWith(fetch(e.request).catch(() => {
							return new Response('Offline mode');
						}));
					});
				`)).then(registration => {
					console.log('SW registered');
				}).catch(error => {
					console.log('SW registration failed');
				});
			});
		}
		
		window.addEventListener('online', () => {
			document.getElementById('offlineBanner').classList.remove('active');
		});
		
		window.addEventListener('offline', () => {
			document.getElementById('offlineBanner').classList.add('active');
		});


		window.addEventListener('load', async () => {
			resize();
			renderProjectInfo();
			
			await dbStorage.init();
			await loadSongList();
			
			window.addEventListener('hashchange', () => router.parseURL());
			router.parseURL();
			
			if (!window.location.hash) {
				router.navigate('home');
			}
			
			requestAnimationFrame(renderLoop);
		});
