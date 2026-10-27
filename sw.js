/* =========================================================
   临冬 · Service Worker（后台消息推送）
   - 文件位置：与 HTML 同目录，文件名必须为 sw.js
   - 必须通过 HTTPS 或 localhost 访问才能注册成功
   - 作用：接收页面触发的系统通知，处理通知点击事件
   ========================================================= */

const CACHE_NAME = 'lingdong-pwa-v1';

/* ---------- 安装：立即跳过等待，并缓存基本壳 ---------- */
self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(['./']).catch(() => {});
        }).catch(() => {})
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
/* 说明：
   - 在线时始终使用网络最新资源，并把成功的 GET 响应放入缓存
   - 离线时回退到缓存
   - 跨域请求（如头像、网易云接口等）直接放行，不缓存
*/
self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;

    let url;
    try { url = new URL(req.url); } catch (e) { return; }

    // 只处理同源请求（跨域请求直接走网络，避免干扰外部资源）
    if (url.origin !== self.location.origin) return;

    event.respondWith(
        fetch(req)
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
                // 导航请求离线时回退到首页
                if (req.mode === 'navigate') {
                    const fallback = await caches.match('./');
                    if (fallback) return fallback;
                }
                return new Response('', { status: 503, statusText: 'Offline' });
            })
    );
});

/* ---------- 通知点击 ---------- */
/* 点击系统通知时：
   1. 如果已有打开的临冬窗口 → 聚焦该窗口，并通过 postMessage 通知页面打开对应聊天
   2. 如果没有窗口 → 打开新窗口，并通过 URL 参数 openChat=contactId 直达聊天
*/
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

        // 1. 优先聚焦已打开的窗口
        for (const client of windowClients) {
            if ('focus' in client) {
                try {
                    await client.focus();
                    // 通知页面跳转到对应聊天
                    client.postMessage({
                        type: 'notification-click',
                        contactId: contactId
                    });
                    return;
                } catch (e) {
                    // 聚焦失败则继续找下一个
                }
            }
        }

        // 2. 没有可用窗口，打开新窗口（带 openChat 参数）
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
/* 说明：
   - 当前临冬主要使用「页面内 reg.showNotification」方式推送
   - 这里保留 push 事件处理，方便将来接入服务器推送
   - 若收到服务器推送，会显示通知；点击走上面的 notificationclick
*/
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
        icon: payload.icon || 'https://aka.doubaocdn.com/s/c50NFcp9ti',
        badge: 'https://aka.doubaocdn.com/s/c50NFcp9ti',
        tag: payload.tag || ('lingdong-push-' + Date.now()),
        data: payload.data || {},
        silent: false,
        requireInteraction: false,
        renotify: true,
        vibrate: [80, 40, 80]
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

/* ---------- 页面消息（用于版本更新） ---------- */
self.addEventListener('message', (event) => {
    const data = event.data || {};

    // 页面请求立即激活新版本
    if (data.type === 'SKIP_WAITING') {
        self.skipWaiting();
        return;
    }

    // 页面请求显示通知（备用通道）
    if (data.type === 'SHOW_NOTIFICATION' && data.notification) {
        const n = data.notification;
        event.waitUntil(
            self.registration.showNotification(n.title || '临冬', {
                body: n.body || '',
                icon: n.icon || 'https://aka.doubaocdn.com/s/c50NFcp9ti',
                badge: 'https://aka.doubaocdn.com/s/c50NFcp9ti',
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

/* ---------- 同步事件（备用，部分安卓浏览器支持） ---------- */
self.addEventListener('sync', (event) => {
    if (event.tag === 'lingdong-sync') {
        // 预留：后台同步逻辑
        event.waitUntil(Promise.resolve());
    }
});