importScripts('/src/js/idb.js');
importScripts('/src/js/utility.js');

var CACHE_STATIC_NAME = 'static-v7';
var CACHE_DYNAMIC_NAME = 'dynamic-v7';
var STATIC_FILES = [
    '/',
    '/index.html',
    '/offline.html',
    '/manifest.json',
    '/src/images/icons/app-icon-192x192.png',
    '/src/js/app.js',
    '/src/js/feed.js',
    '/src/js/idb.js',
    '/src/js/utility.js',
    '/src/js/material.min.js',
    '/src/css/app.css',
    '/src/css/feed.css',
    '/src/images/main-image.jpeg',
    'https://fonts.googleapis.com/css?family=Roboto:400,700',
    'https://fonts.googleapis.com/icon?family=Material+Icons',
    'https://cdnjs.cloudflare.com/ajax/libs/material-design-lite/1.3.0/material.indigo-pink.min.css'
];

var FIREBASE_URL = 'https://gram-ed160-default-rtdb.firebaseio.com/post.json';
var DEFAULT_IMAGE = '/src/images/sf-boat.jpg';

self.addEventListener('install', function (event) {
    console.log('[Service Worker] Installing Service Worker ...', event);
    event.waitUntil(
        caches.open(CACHE_STATIC_NAME)
            .then(function (cache) {
                console.log('[Service Worker] Precaching App Shell');
                return cache.addAll(STATIC_FILES);
            })
    );
});

self.addEventListener('activate', function (event) {
    console.log('[Service Worker] Activating Service Worker ....', event);
    event.waitUntil(
        caches.keys()
            .then(function (keyList) {
                return Promise.all(keyList.map(function (key) {
                    if (key !== CACHE_STATIC_NAME && key !== CACHE_DYNAMIC_NAME) {
                        console.log('[Service Worker] Removing old cache.', key);
                        return caches.delete(key);
                    }
                }));
            })
    );
    return self.clients.claim();
});

function isInArray(string, array) {
    var cachePath;
    if (string.indexOf(self.origin) === 0) {
        // la petición es a nuestro dominio (no a un CDN)
        console.log('matched ', string);
        cachePath = string.substring(self.origin.length);
    } else {
        // guardamos la URL completa (para CDNs)
        cachePath = string;
    }
    return array.indexOf(cachePath) > -1;
}

// cache-then-network + offline
self.addEventListener('fetch', function (event) {
    // Solo los GET a Firebase se guardan en IndexedDB (los POST pasan directo)
    if (event.request.url.indexOf(FIREBASE_URL) > -1 && event.request.method === 'GET') {
        event.respondWith(fetch(event.request)
            .then(function (res) {
                var clonedRes = res.clone();
                clearAllData('posts')
                    .then(function () {
                        return clonedRes.json();
                    })
                    .then(function (data) {
                        for (var key in data) {
                            writeData('posts', data[key]);
                        }
                    });
                return res;
            })
        );
    } else if (isInArray(event.request.url, STATIC_FILES)) {
        event.respondWith(
            caches.match(event.request)
        );
    } else {
        event.respondWith(
            caches.match(event.request)
                .then(function (response) {
                    if (response) {
                        return response;
                    } else {
                        return fetch(event.request)
                            .then(function (res) {
                                return caches.open(CACHE_DYNAMIC_NAME)
                                    .then(function (cache) {
                                        cache.put(event.request.url, res.clone());
                                        return res;
                                    });
                            })
                            .catch(function (err) {
                                return caches.open(CACHE_STATIC_NAME)
                                    .then(function (cache) {
                                        if (event.request.headers.get('accept').includes('text/html')) {
                                            return cache.match('/offline.html');
                                        }
                                    });
                            });
                    }
                })
        );
    }
});

// Envía a Firebase los posts guardados en 'sync-posts'.
// "enviando" evita que se manden dos veces si el sync y un mensaje llegan juntos.
var enviando = null;

function enviarPendientes() {
    if (enviando) {
        return enviando;
    }
    enviando = readAllData('sync-posts')
        .then(function (data) {
            if (!data || data.length === 0) {
                return false;
            }
            return Promise.all(data.map(function (dt) {
                return fetch(FIREBASE_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify({
                        id: dt.id,
                        title: dt.title,
                        location: dt.location,
                        image: DEFAULT_IMAGE
                    })
                })
                    .then(function (res) {
                        console.log('Sent data', res.status, res);
                        if (!res.ok) {
                            throw new Error('Firebase respondió ' + res.status);
                        }
                        return deleteItemFromData('sync-posts', dt.id);
                    });
            })).then(function () {
                return true;
            });
        })
        .then(function (huboEnvios) {
            if (huboEnvios) {
                // Avisamos a la página para que vuelva a cargar el feed
                return self.clients.matchAll().then(function (clients) {
                    clients.forEach(function (client) {
                        client.postMessage('posts-synced');
                    });
                });
            }
        })
        .finally(function () {
            enviando = null;
        });
    return enviando;
}

// Background Sync (lo dispara Chrome cuando hay conexión)
self.addEventListener('sync', function (event) {
    console.log('[Service Worker] Background syncing', event);
    if (event.tag === 'sync-new-posts') {
        console.log('[Service Worker] Syncing new Posts');
        event.waitUntil(
            enviarPendientes().catch(function (err) {
                console.log('Error while sending data', err);
                throw err; // para que Chrome lo vuelva a intentar
            })
        );
    }
});

// La página nos pide enviar ya (al volver el internet, al cargar o al crear un post)
self.addEventListener('message', function (event) {
    if (event.data === 'sync-now') {
        console.log('[Service Worker] Envío solicitado por la página');
        event.waitUntil(
            enviarPendientes().catch(function (err) {
                console.log('Sin conexión todavía, se queda pendiente', err.message);
            })
        );
    }
});
