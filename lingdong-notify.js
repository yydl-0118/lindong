/* ============================================================
 * 临冬 · 后台通知模块 lingdong-notify.js
 * 适配：HBuilderX 5+ App (Android) / 普通浏览器降级
 * 设备：iQOO Neo9 (OriginOS / Android)
 * ============================================================ */

(function (global) {
    'use strict';

    var isApp = false;
    try {
        isApp = (typeof plus !== 'undefined' && plus.push);
    } catch (e) { isApp = false; }

    var _lastVibrateAt = 0;
    var _notifyChain = Promise.resolve();

    /* ---------- 工具：安全调用 plus ---------- */
    function safePlus(fn, fallback) {
        try {
            if (typeof plus !== 'undefined') return fn();
        } catch (e) {}
        return fallback;
    }

    /* ---------- 1. Android 通知栏消息（plus.push） ---------- */
    function notifyByPlus(title, body, payload) {
        return new Promise(function (resolve) {
            safePlus(function () {
                var options = {
                    cover: false,
                    title: title || '临冬',
                    sound: 'system',
                    when: new Date()
                };
                var payloadStr = typeof payload === 'string'
                    ? payload
                    : JSON.stringify(payload || {});
                plus.push.createMessage(
                    String(body || '').slice(0, 200),
                    payloadStr,
                    options
                );
                resolve(true);
            }, function () { resolve(false); })();
            if (typeof plus === 'undefined') resolve(false);
        });
    }

    /* ---------- 2. 浏览器 Web Notification 降级 ---------- */
    function notifyByWeb(title, body, data) {
        return new Promise(function (resolve) {
            if (!('Notification' in window)) return resolve(false);
            if (Notification.permission !== 'granted') return resolve(false);
            try {
                var n = new Notification(title || '临冬', {
                    body: body,
                    icon: 'https://aka.doubaocdn.com/s/c50NFcp9ti',
                    badge: 'https://aka.doubaocdn.com/s/c50NFcp9ti',
                    tag: 'lingdong-' + Date.now(),
                    data: data || null,
                    silent: false
                });
                n.onclick = function () {
                    try { window.focus(); } catch (e) {}
                    n.close();
                    if (data && data.contactId && typeof global.openChat === 'function') {
                        global.openChat(data.contactId);
                    }
                };
                setTimeout(function () { try { n.close(); } catch (e) {} }, 30000);
                resolve(true);
            } catch (e) { resolve(false); }
        });
    }

    /* ---------- 3. 统一入口：后台弹窗 ---------- */
    function notifyBackground(title, body, options) {
        options = options || {};
        var contactId = options.contactId || null;
        var payload = { contactId: contactId, type: options.type || 'text' };

        // 链式排队，避免 plus 并发调用偶发丢失
        _notifyChain = _notifyChain.then(function () {
            if (isApp) {
                return notifyByPlus(title, body, payload).then(function (ok) {
                    if (!ok) return notifyByWeb(title, body, payload);
                });
            }
            return notifyByWeb(title, body, payload);
        }).catch(function () {});

        return _notifyChain;
    }

    /* ---------- 4. Android 震动（iQOO 可正常触发） ---------- */
    function vibrateAndroid(pattern) {
        var now = Date.now();
        if (now - _lastVibrateAt < 150) return; // 节流
        _lastVibrateAt = now;
        safePlus(function () {
            plus.device.vibrate(pattern || 120);
        }, function () {
            try { if (navigator.vibrate) navigator.vibrate(pattern || 120); } catch (e) {}
        });
    }

    /* ---------- 5. 请求通知权限 ---------- */
    function requestNotifyPermission() {
        if (isApp) {
            // HBuilderX 打包时 manifest.json 中勾选 Notification 权限即可
            // 运行时部分机型仍需用户手动在系统设置中打开
            return Promise.resolve(true);
        }
        if (!('Notification' in window)) return Promise.resolve(false);
        if (Notification.permission === 'granted') return Promise.resolve(true);
        if (Notification.permission === 'denied') return Promise.resolve(false);
        return Notification.requestPermission().then(function (p) {
            return p === 'granted';
        });
    }

    /* ---------- 6. iQOO / OriginOS 后台保活引导 ---------- */
    function guideKeepAlive() {
        var tips = [
            '① 设置 → 应用 → 应用管理 → 临冬 → 电池 → 允许后台高耗电',
            '② iQOO 管家 / 手机管家 → 自启动 → 允许“临冬”自启动',
            '③ 最近任务卡片下拉 → 锁定“临冬”',
            '④ 设置 → 通知 → 允许“临冬”通知'
        ].join('\n');
        if (global.showToast) global.showToast('请按以下步骤放行后台：\n' + tips, 6000);
        else alert(tips);
    }

    /* ---------- 7. 保活心跳（仅当前台服务插件存在时增强） ---------- */
    var _heartbeatTimer = null;
    function startHeartbeat() {
        if (_heartbeatTimer) return;
        _heartbeatTimer = setInterval(function () {
            // 如果前端有未读消息，或需要轮询，可在这里触发
            // 示例：每 60 秒检查一次未读，但通知只在新消息时发出
        }, 60000);
    }
    function stopHeartbeat() {
        if (_heartbeatTimer) { clearInterval(_heartbeatTimer); _heartbeatTimer = null; }
    }

    /* ---------- 8. 监听通知栏点击（回到对应聊天） ---------- */
    function setupPushClick() {
        safePlus(function () {
            plus.push.addEventListener('click', function (msg) {
                var payload = msg.payload || {};
                if (typeof payload === 'string') {
                    try { payload = JSON.parse(payload); } catch (e) {}
                }
                var cid = payload.contactId;
                if (cid && typeof global.openChat === 'function') {
                    global.openChat(cid);
                } else if (typeof global.switchPage === 'function') {
                    global.switchPage('contacts');
                }
            });
        }, function () {});
    }

    /* ---------- 9. 暴露到全局 ---------- */
    global.LingdongNotify = {
        isApp: isApp,
        notifyBackground: notifyBackground,
        vibrateAndroid: vibrateAndroid,
        requestNotifyPermission: requestNotifyPermission,
        guideKeepAlive: guideKeepAlive,
        startHeartbeat: startHeartbeat,
        stopHeartbeat: stopHeartbeat,
        setupPushClick: setupPushClick
    };

    // 如果 plus 已就绪，立即绑定通知点击
    if (isApp) {
        try { plus.push.addEventListener('click', function () {}); } catch (e) {}
    }

})(window);