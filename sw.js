const CACHE_NAME = 'video-alerta-dashboard-v2.1'; 
const urlsToCache = [
    '/',
    'index.html',
    'app.js',
    'style.css',
    'manifest.json',
    // Ícones
    'icon-72.png',
    'icon-96.png',
    'icon-128.png',
    'icon-192.png',
    'icon-512.png',
    // Dependências externas
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js',
    'https://cdn.jsdelivr.net/npm/chart.js'
];

// Instalação do Service Worker
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Service Worker: Cacheando arquivos...');
                return cache.addAll(urlsToCache);
            })
    );
});

// Intercepta as requisições (estratégia Cache-First)
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                if (response) {
                    return response;
                }
                return fetch(event.request);
            })
    );
});

// Ativação do Service Worker (limpa caches antigos)
self.addEventListener('activate', event => {
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        return caches.delete(cacheName); 
                    }
                })
            );
        })
    );

});
