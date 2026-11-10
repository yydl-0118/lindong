/* =========================================================
   临冬 · Service Worker（后台消息推送 / 版本更新）
   - 文件位置：与 index.html 同目录，文件名必须为 sw.js
   - 必须通过 HTTPS 或 localhost 访问才能注册成功
   - v4：页面导航强制绕过 HTTP 缓存，改完 index.html 立即生效
   ========================================================= */

const CACHE_NAME = 'lingdong-pwa-v4';

/* ---------- 安装：立即跳过等待 ---------- */
self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(['./']))
            .catch(() => {})
    );
});

/* ---------- 激活：清理旧缓存并接管页面 ---------- */
self.addEventListener('activate', (event) => {
    event.waitUntil(
        (async () => {
            const keys = await caches.keys();
            await Promise.all(
                keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
            );
            await self.clients.claim();
        })()
    );
});

/* ---------- 网络请求：网络优先 + 运行时缓存 ---------- */
self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;

    let url;
    try { url = new URL(req.url); } catch (e) { return; }

    // 跨域请求直接放行
    if (url.origin !== self.location.origin) return;

    // ⭐ 页面本身（导航）永远拿最新的，绕开浏览器 HTTP 缓存
    const isNav = req.mode === 'navigate' || req.destination === 'document';
    const fetchOpts = isNav ? { cache: 'no-store' } : {};

    event.respondWith(
        fetch(req, fetchOpts)
            .then((res) => {
                if (res && res.status === 200 && res.type === 'basic') {
                    const copy = res.clone();
                    caches.open(CACHE_NAME)
                        .then((cache) => cache.put(req, copy))
                        .catch(() => {});
                }
                return res;
            })
            .catch(async () => {
                const cached = await caches.match(req);
                if (cached) return cached;
                if (req.mode === 'navigate') {
                    const fallback = await caches.match('./');
                    if (fallback) return fallback;
                }
                return new Response('', { status: 503, statusText: 'Offline' });
            })
    );
});

/* ---------- 通知点击 ---------- */
self.addEventListener('notificationclick', (event) => {
    const notification = event.notification;
    const data = notification.data || {};
    const contactId = data.contactId || null;

    notification.close();

    event.waitUntil((async () => {
        const windowClients = await self.clients.matchAll({
            type: 'window',
            includeUncontrolled: true
        });

        for (const client of windowClients) {
            if ('focus' in client) {
                try {
                    await client.focus();
                    client.postMessage({
                        type: 'notification-click',
                        contactId: contactId
                    });
                    return;
                } catch (e) {}
            }
        }

        if (self.clients.openWindow) {
            const baseUrl = new URL('./', self.registration.scope);
            let targetUrl = baseUrl.href;
            if (contactId) {
                const u = new URL(baseUrl.href);
                u.searchParams.set('openChat', contactId);
                targetUrl = u.href;
            }
            await self.clients.openWindow(targetUrl);
        }
    })());
});

/* ---------- Web Push（备用） ---------- */
self.addEventListener('push', (event) => {
    let payload = {};
    try {
        payload = event.data ? event.data.json() : {};
    } catch (e) {
        payload = { body: event.data ? event.data.text() : '新消息' };
    }

    const title = payload.title || '临冬';
    const options = {
        body: payload.body || '你有一条新消息',
        icon: payload.icon || 'icon.png',
        badge: 'icon.png',
        tag: payload.tag || ('lingdong-push-' + Date.now()),
        data: payload.data || {},
        silent: false,
        requireInteraction: false,
        renotify: true,
        vibrate: [80, 40, 80]
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

/* ---------- 页面消息 ---------- */
self.addEventListener('message', (event) => {
    const data = event.data || {};

    if (data.type === 'SKIP_WAITING') {
        self.skipWaiting();
        return;
    }

    if (data.type === 'SHOW_NOTIFICATION' && data.notification) {
        const n = data.notification;
        event.waitUntil(
            self.registration.showNotification(n.title || '临冬', {
                body: n.body || '',
                icon: n.icon || 'icon.png',
                badge: 'icon.png',
                tag: n.tag || ('lingdong-' + Date.now()),
                data: n.data || {},
                silent: false,
                requireInteraction: false,
                renotify: true,
                vibrate: [80, 40, 80]
            })
        );
    }
});

/* ---------- 同步事件（备用） ---------- */
self.addEventListener('sync', (event) => {
    if (event.tag === 'lingdong-sync') {
        event.waitUntil(Promise.resolve());
    }
});