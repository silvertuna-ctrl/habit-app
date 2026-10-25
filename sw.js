// =====================================================
// Service Worker（サービスワーカー）
// アプリの裏で動く「お留守番係」。一度開いたファイルをiPhoneの中にしまっておき、
// 電波がないときは、しまっておいたファイルでアプリを開く。
// =====================================================

// ファイルを大きく入れかえたいときは、この番号を上げる（古いしまい場所が消える）
const CACHE_NAME = 'habit-app-v2';

// 最初にしまっておくファイル
const APP_FILES = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.webmanifest',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  'https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4.1.11',
];

// インストールされたとき：ファイルをしまう
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_FILES)));
  self.skipWaiting();
});

// 新しい版になったとき：古いしまい場所を片づける
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(
      names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)),
    )),
  );
  self.clients.claim();
});

// ファイルを読みこむとき：
// まずネットから最新をとってくる（とれたら、しまい直す）。
// ネットにつながらないときだけ、しまっておいたものを使う。
// → コードを直してプッシュしたら、次に開いたときにすぐ反映される
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request, { ignoreSearch: true })),
  );
});
