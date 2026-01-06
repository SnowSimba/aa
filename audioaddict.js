(function () {
    'use strict';

    // Версия плагина для логов
    var AA_VERSION = '54_github_stable';

    // 1. НАСТРОЙКИ И ДАННЫЕ
    var AA_COLORS = {
        'di': '#1e8bc3', 'radiotunes': '#2ecc71', 'jazzradio': '#e67e22',
        'rockradio': '#e74c3c', 'classicalradio': '#9b59b6', 'favorites': '#f1c40f', 'custom': '#95a5a6'
    };

    var AA_BRANDS = {
        'favorites': { name: 'Избранное', color: AA_COLORS.favorites, icon_svg: '<svg viewBox="0 0 24 24"><path fill="#f1c40f" d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>' },
        'di': { name: 'DI.fm', color: AA_COLORS.di, domain: 'di.fm' },
        'radiotunes': { name: 'RadioTunes', color: AA_COLORS.radiotunes, domain: 'radiotunes.com' },
        'jazzradio': { name: 'JazzRadio', color: AA_COLORS.jazzradio, domain: 'jazzradio.com' },
        'rockradio': { name: 'RockRadio', color: AA_COLORS.rockradio, domain: 'rockradio.com' },
        'classicalradio': { name: 'ClassicalRadio', color: AA_COLORS.classicalradio, domain: 'classicalradio.com' }
    };

    var AA_SERVERS = { 'prem1': 'Premium 1', 'prem2': 'Premium 2', 'prem4': 'Premium 4' };
    var AA_VIS_TYPES = { 'none': 'Нет', 'bars': 'Эквалайзер (Live)', 'wave': 'Волна (Live)', 'particles': 'Огоньки' };
    var AA_SHUFFLE_MODES = { 'off': 'Выключено', 'cat': 'В текущей категории', 'global': 'По всем каталогам' };
    var AA_SHUFFLE_TRIGGERS = { 'manual': 'Только кнопкой >>', 'track': 'После конца трека' };
    
    var AA_POSITIONS = { 'bl': 'Слева снизу', 'br': 'Справа снизу', 'tl': 'Слева сверху', 'tr': 'Справа сверху' };
    var AA_OPACITY = { '1': '100%', '0.8': '80%', '0.6': '60%', '0.4': '40%', '0.2': '20%' };

    window.aa_channels_list = [];
    window.aa_current_index = -1;
    window.aa_active_id = null;

    // 2. УТИЛИТЫ
    function cleanImageUrl(url) {
        if (!url) return './img/img_broken.svg';
        if (url.indexOf('http') === 0 && url.indexOf('audioaddict') === -1) return url;
        var clean = url.split('{')[0].split('?')[0];
        if (clean.indexOf('//') === 0) clean = 'http:' + clean;
        else clean = clean.replace('https:', 'http:');
        clean = clean.replace(/assets\.(di\.fm|radiotunes\.com|rockradio\.com|jazzradio\.com|classicalradio\.com)/, 'cdn-images.audioaddict.com');
        return clean + '?size=600x600';
    }

    function getBrandIcon(key) {
        if (AA_BRANDS[key].icon_svg) return AA_BRANDS[key].icon_svg;
        var url = 'https://cdn-images.audioaddict.com/0/logos/' + key + '_small.png'; 
        return '<img class="aa-net-ico-img" src="' + url + '" onerror="this.style.display=\'none\';this.nextSibling.style.display=\'block\'" /><svg class="aa-net-ico-svg" style="display:none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="' + AA_BRANDS[key].color + '"/><text x="12" y="16" font-size="12" text-anchor="middle" fill="white" font-weight="bold">' + key.charAt(0).toUpperCase() + '</text></svg>';
    }

    function fetchCustomMetadata(streamUrl, callback) {
        if (!streamUrl) return;
        var cleanUrl = streamUrl.split('?')[0].replace(/\/$/, "");
        var baseUrl = cleanUrl.substring(0, cleanUrl.lastIndexOf('/'));
        var attempts = [baseUrl + '/status-json.xsl', baseUrl + '/stats?json=1'];
        var tryNext = function(index) {
            if (index >= attempts.length) return;
            var net = new Lampa.Reguest();
            net.silent(attempts[index], function(json) {
                try {
                    if (json && json.icestats && json.icestats.source) {
                        var s = Array.isArray(json.icestats.source) ? json.icestats.source[0] : json.icestats.source;
                        if (s && (s.title || s.songname)) callback(s.title || s.songname);
                    } else if (json && json.songtitle) callback(json.songtitle);
                } catch(e) {}
            }, function() { tryNext(index + 1); });
        };
        tryNext(0);
    }

    // --- ЛОГИКА ИЗБРАННОГО ---
    function isSyncEnabled() { 
        var val = Lampa.Storage.get('aa_fav_sync', 'false');
        return val === true || val === 'true'; 
    }

    function AA_Fav_Add(item) {
        var save = {
            id: item.id, key: item.key, name: item.name, brand: item.brand, 
            is_custom: item.is_custom, stream: item.stream, images: item.images, image: item.image 
        };

        if (isSyncEnabled() && Lampa.Favorite) {
            var card = {
                id: 'aa_' + (item.id || item.key),
                source: 'audioaddict',
                title: item.name,
                img: cleanImageUrl(item.image || (item.images ? item.images.default : '')),
                url: '',
                type: 'audioaddict_card',
                aa_data: save
            };
            Lampa.Favorite.add({ card: card });
            Lampa.Noty.show('Добавлено (Sync)');
        } else {
            var list = Lampa.Storage.get('aa_fav_local', []);
            if(!list.some(function(i){ return (i.id || i.key) == (item.id || item.key); })) {
                list.push(save);
                Lampa.Storage.set('aa_fav_local', list);
            }
            Lampa.Noty.show('Добавлено (Local)');
        }
        if(window.aa_player) window.aa_player.updateFavState();
    }

    function AA_Fav_Remove(item) {
        var id = item.id || item.key;
        if (isSyncEnabled() && Lampa.Favorite) {
            Lampa.Favorite.remove({ card: { id: 'aa_' + id, type: 'audioaddict_card' } });
            Lampa.Noty.show('Удалено (Sync)');
        } else {
            var list = Lampa.Storage.get('aa_fav_local', []);
            var newList = list.filter(function(el) { return String(el.id || el.key) !== String(id); });
            Lampa.Storage.set('aa_fav_local', newList);
            Lampa.Noty.show('Удалено (Local)');
        }
        if(window.aa_player) window.aa_player.updateFavState();
    }

    function AA_Fav_Check(item) {
        if(!item) return false;
        var id = item.id || item.key;
        if (isSyncEnabled()) {
            if (Lampa.Favorite && Lampa.Favorite.result && Lampa.Favorite.result.audioaddict_card) {
                return Lampa.Favorite.result.audioaddict_card.some(function(c){ return c.id == 'aa_' + id; });
            }
            return false;
        } else {
            var list = Lampa.Storage.get('aa_fav_local', []);
            return list.some(function(el) { return String(el.id || el.key) === String(id); });
        }
    }

    // 3. CANVAS ВИЗУАЛИЗАТОР
    var AA_Visualizer = {
        canvas: null,
        ctx: null,
        animation: null,
        type: 'bars',
        color: '#fff',
        
        init: function(container, type, color) {
            this.stop();
            container.empty();
            
            if (type === 'none') return;

            this.canvas = document.createElement('canvas');
            this.canvas.width = 200;
            this.canvas.height = 100;
            this.canvas.style.width = '100%';
            this.canvas.style.height = '100%';
            container.append(this.canvas);
            
            this.ctx = this.canvas.getContext('2d');
            this.type = type;
            this.color = color;
            
            this.loop();
        },

        stop: function() {
            if (this.animation) cancelAnimationFrame(this.animation);
            this.ctx = null;
        },

        loop: function() {
            if (!this.ctx) return;
            var _this = this;
            this.animation = requestAnimationFrame(function() { _this.loop(); });
            
            var w = this.canvas.width;
            var h = this.canvas.height;
            var ctx = this.ctx;
            var time = Date.now();

            ctx.clearRect(0, 0, w, h);
            ctx.fillStyle = this.color;

            if (this.type === 'bars') {
                var bars = 10;
                var gap = 4;
                var barW = (w - (gap * (bars - 1))) / bars;
                
                for (var i = 0; i < bars; i++) {
                    var speed = (i % 2 === 0) ? 0.008 : 0.012;
                    var offset = i * 500;
                    var height = Math.abs(Math.sin((time + offset) * speed)) * h * 0.8 + (h * 0.1);
                    height += Math.random() * 5;
                    ctx.fillRect(i * (barW + gap), h - height, barW, height);
                }
            } else if (this.type === 'wave') {
                ctx.beginPath();
                ctx.moveTo(0, h / 2);
                for (var x = 0; x < w; x++) {
                    var y = Math.sin(x * 0.05 + time * 0.005) * (h * 0.3) + h / 2;
                    ctx.lineTo(x, y);
                }
                ctx.strokeStyle = this.color;
                ctx.lineWidth = 3;
                ctx.stroke();
            } else if (this.type === 'particles') {
                for (var j = 0; j < 5; j++) {
                    var pX = (Math.sin(time * 0.002 + j) + 1) / 2 * w;
                    var pY = (Math.cos(time * 0.003 + j*2) + 1) / 2 * h;
                    var size = Math.abs(Math.sin(time * 0.005 + j)) * 5 + 2;
                    ctx.beginPath();
                    ctx.arc(pX, pY, size, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }
    };

    // 4. ОВЕРЛЕЙ
    var AA_Overlay = {
        el: null,
        interval: null,
        
        init: function() {
            // Удаляем старый оверлей, если он есть
            $('#aa-overlay-info').remove();

            var html = '<div id="aa-overlay-info" style="display:none;">' +
                '<div class="aa-ov-card">' +
                    '<div class="aa-ov-img-wrap">' +
                        '<img class="aa-ov-img" src="" />' +
                        '<div class="aa-ov-vis-container"></div>' +
                    '</div>' +
                    '<div class="aa-ov-text">' +
                        '<div class="aa-ov-station">Station</div>' +
                        '<div class="aa-ov-track">Track</div>' +
                    '</div>' +
                '</div>' +
            '</div>';
            
            $('body').append(html);
            this.el = $('#aa-overlay-info');
            this.startLoop();
        },

        startLoop: function() {
            var _this = this;
            if(this.interval) clearInterval(this.interval);
            this.interval = setInterval(function() { _this.check(); }, 1000);
        },

        check: function() {
            if (Lampa.Storage.get('aa_show_on_saver', 'true') === 'false') { this.hide(); return; }
            var player = window.aa_player;
            if (!player || !player.isPlaying()) { this.hide(); return; }
            var isSaverActive = $('body').hasClass('screensaver-active') || $('.screensaver').length > 0 || $('.screensaver-box').length > 0;

            if (isSaverActive) {
                this.update(player.getCurrentData(), player.getCurrentTrack());
                this.show();
            } else {
                this.hide();
            }
        },

        update: function(data, track) {
            if (!data) return;
            var img = cleanImageUrl(data.image || (data.images ? data.images.default : ''));
            var brand_key = data.brand || 'di';
            var color = AA_COLORS[brand_key] || '#fff';
            var brandName = AA_BRANDS[brand_key] ? AA_BRANDS[brand_key].name : 'Radio';
            if(data.is_custom) brandName = 'My';

            this.el.find('.aa-ov-img').attr('src', img);
            this.el.find('.aa-ov-station').text(brandName + ' - ' + data.name).css('color', color);
            this.el.find('.aa-ov-track').text(track);

            var pos = Lampa.Storage.get('aa_saver_pos', 'bl');
            var op = Lampa.Storage.get('aa_saver_opacity', '1');
            this.el.removeClass('aa-pos-bl aa-pos-br aa-pos-tl aa-pos-tr').addClass('aa-pos-' + pos);
            this.el.find('.aa-ov-card').css('opacity', op);

            var type = Lampa.Storage.get('aa_vis_type', 'bars');
            var visContainer = this.el.find('.aa-ov-vis-container');
            
            if (visContainer.data('type') !== type || !AA_Visualizer.ctx) {
                visContainer.data('type', type);
                AA_Visualizer.init(visContainer, type, color);
            } else {
                AA_Visualizer.color = color;
            }
        },

        show: function() { if (!this.el.is(':visible')) this.el.fadeIn(500); },
        hide: function() { 
            if (this.el.is(':visible')) {
                this.el.fadeOut(300);
                AA_Visualizer.stop();
            }
        }
    };

    // 5. ПЛЕЕР
    function AA_Player() {
        var html = Lampa.Template.get('aa_player_final', {});
        var audio = new Audio();
        var is_playing = false;
        var meta_timer = null;
        var current_data = null;
        var network = new Lampa.Reguest();
        var last_track_title = "";
        var manual_stop = false; 
        var is_loading = false;

        this.isPlaying = function() { return is_playing; };
        this.getCurrentData = function() { return current_data; };
        this.getCurrentTrack = function() { return html.find('.aa-pl-track-text').text(); };

        var onStarted = function() {
            is_playing = true;
            is_loading = false;
            html.removeClass('stop').removeClass('loading');
            html.find('.aa-pl-track-text').removeClass('scrolling');
            setTimeout(function() { html.find('.aa-pl-track-text').addClass('scrolling'); }, 100);
            updateMeta();
            if (meta_timer) clearInterval(meta_timer);
            meta_timer = setInterval(updateMeta, 15000);
        };

        audio.addEventListener("playing", onStarted);
        audio.addEventListener("pause", function() { 
            is_playing = false; html.addClass('stop'); html.find('.aa-pl-track-text').removeClass('scrolling'); 
        });
        audio.addEventListener("error", function() { 
            if (manual_stop) return;
            if(Lampa.Storage.get('aa_shuffle_mode', 'off') !== 'off') {
                setTimeout(function() { if (!manual_stop && !is_playing) window.aa_player.playNext(); }, 3000);
            } else {
                is_playing = false; is_loading = false; html.addClass('stop'); Lampa.Noty.show('Ошибка потока'); 
            }
        });

        this.create = function () {
            $('.aa-pl-widget').remove();
            $('.head__actions .open--search').before(html);
            var self = this;
            html.find('.aa-pl-prev').on('hover:enter', function() { self.playPrev(); });
            html.find('.aa-pl-next').on('hover:enter', function() { self.playNext(); });
            html.find('.aa-pl-stop').on('hover:enter', function() { self.stopAndClose(); });
            html.find('.aa-pl-pp, .aa-pl-icon-wrap').on('hover:enter', function() { if (is_playing) audio.pause(); else audio.play(); });
            
            html.find('.aa-pl-fav').on('hover:enter', function() {
                if(!current_data) return;
                if(AA_Fav_Check(current_data)) AA_Fav_Remove(current_data);
                else AA_Fav_Add(current_data);
            });
        };

        this.updateFavState = function() {
            if(!current_data) return;
            var isFav = AA_Fav_Check(current_data);
            var path = html.find('.aa-pl-fav path');
            if(isFav) {
                path.attr('d', 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z');
                html.find('.aa-pl-fav').addClass('active');
            } else {
                path.attr('d', 'M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55l-.1.1-.1-.1C7.14 14.24 4 11.51 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 3.01-3.14 5.74-7.9 10.05z');
                html.find('.aa-pl-fav').removeClass('active');
            }
        };

        function setTrackText(text) {
            html.find('.aa-pl-track-text').text(text);
        }

        function updateMeta() {
            if (!is_playing || !current_data || manual_stop) return;
            var id = current_data.id;
            var brand = current_data.brand || 'di';

            if (current_data.is_custom && !id && current_data.stream) {
                var match = current_data.stream.match(/\/([a-z0-9]+)_(hi|low|med|aac)\?/);
                if (match && match[1]) {
                    id = match[1];
                    if (current_data.stream.indexOf('di.fm') > -1) brand = 'di';
                    else if (current_data.stream.indexOf('radiotunes') > -1) brand = 'radiotunes';
                }
            }

            var callback = function(title) {
                if(!title) return;
                setTrackText(title);
                
                if (last_track_title && last_track_title !== title && !manual_stop && is_playing) {
                    var trigger = Lampa.Storage.get('aa_shuffle_auto', 'manual');
                    var mode = Lampa.Storage.get('aa_shuffle_mode', 'off');
                    
                    if (trigger === 'track' && mode !== 'off') {
                        Lampa.Noty.show('Трек завершен. Переключаем...');
                        window.aa_player.playNext();
                    }
                }
                last_track_title = title;
            };

            if (id) {
                var metaUrl = 'http://api.audioaddict.com/v1/' + brand + '/track_history/channel/' + id;
                network.silent(metaUrl, function(res) {
                    if (res && res.length) callback(res[0].artist + ' - ' + res[0].title);
                });
            } else if (current_data.is_custom) {
                fetchCustomMetadata(current_data.stream, callback);
            }
        }

        this.play = function (data) {
            manual_stop = false;
            this.stop(false); 
            is_loading = true;
            current_data = data;
            last_track_title = ""; 
            
            var id_str = String(data.id || data.key);
            window.aa_active_id = id_str;
            window.aa_current_index = window.aa_channels_list.indexOf(data);

            $('.aa-card').removeClass('active-playing');
            $('.aa-card[data-id="' + id_str + '"]').addClass('active-playing');

            var streamUrl = '';
            if (data.is_custom) {
                streamUrl = data.stream;
            } else {
                var key = (Lampa.Storage.get('aa_listen_key', '') || '').trim();
                if (!key) { Lampa.Noty.show('Нет ключа в настройках'); is_loading = false; return; }
                var server = Lampa.Storage.get('aa_server', 'prem2');
                var brand = data.brand || Lampa.Storage.get('aa_brand', 'di');
                var domain = AA_BRANDS[brand] ? AA_BRANDS[brand].domain : 'di.fm';
                streamUrl = 'http://' + server + '.' + domain + ':80/' + data.key + '_hi?' + key;
            }

            var img = cleanImageUrl(data.image || (data.images ? data.images.default : ''));
            html.find('.aa-pl-icon').attr('src', img);
            
            var brandKey = data.brand || Lampa.Storage.get('aa_brand', 'di');
            var brandName = AA_BRANDS[brandKey] ? AA_BRANDS[brandKey].name : 'Radio';
            if(data.is_custom) brandName = 'My'; 
            html.find('.aa-pl-title').text(brandName + ' - ' + data.name);

            setTrackText('Загрузка...');
            html.removeClass('hide').addClass('loading');
            this.updateFavState();

            audio.src = streamUrl;
            audio.load();
            var p = audio.play();
            if(p !== undefined) p.catch(function(e) { console.log(e); });
        };

        this.playNext = function() { 
            manual_stop = false;
            var mode = Lampa.Storage.get('aa_shuffle_mode', 'off');
            
            if (mode === 'cat') {
                if (!window.aa_channels_list.length) return;
                var rnd = Math.floor(Math.random() * window.aa_channels_list.length);
                this.play(window.aa_channels_list[rnd]);
            
            } else if (mode === 'global') {
                var brands = Object.keys(AA_BRANDS).filter(function(k){ return k !== 'favorites' && k !== 'custom'; });
                var rndBrand = brands[Math.floor(Math.random() * brands.length)];
                var net = new Lampa.Reguest();
                var _this = this;
                setTrackText('Shuffle: ' + AA_BRANDS[rndBrand].name + '...');
                net["native"]('http://api.audioaddict.com/v1/' + rndBrand + '/channels', function(data) {
                    if(data && data.length) {
                        var rndStation = data[Math.floor(Math.random() * data.length)];
                        rndStation.brand = rndBrand; 
                        _this.play(rndStation);
                    } else {
                        var n = window.aa_current_index + 1;
                        if (n >= window.aa_channels_list.length) n = 0;
                        _this.play(window.aa_channels_list[n]);
                    }
                });
            } else {
                var n = window.aa_current_index + 1; 
                if (n >= window.aa_channels_list.length) n = 0; 
                this.play(window.aa_channels_list[n]); 
            }
        };
        
        this.playPrev = function() { 
            manual_stop = false;
            var p = window.aa_current_index - 1; 
            if (p < 0) p = window.aa_channels_list.length - 1; 
            this.play(window.aa_channels_list[p]); 
        };

        this.stop = function (full_reset) {
            if (full_reset) manual_stop = true;
            is_playing = false; 
            if (meta_timer) clearInterval(meta_timer);
            audio.pause(); 
            html.addClass('stop').removeClass('loading');
            html.find('.aa-pl-track-text').removeClass('scrolling');
        };

        this.stopAndClose = function() { 
            this.stop(true); 
            html.addClass('hide'); 
            window.aa_active_id = null; 
            $('.aa-card').removeClass('active-playing'); 
        };
    }

    // 6. КОМПОНЕНТ
    function AA_Component() {
        var network = new Lampa.Reguest();
        var scroll = new Lampa.Scroll({ mask: true, over: true, step: 250 });
        var html = $('<div class="aa-container"></div>');
        var body = $('<div class="aa-grid"></div>');
        var selector = $('<div class="aa-net-row"></div>');
        var last_focused = null;

        function getFavItems() {
            if (isSyncEnabled()) {
                if (Lampa.Favorite && Lampa.Favorite.result && Lampa.Favorite.result.audioaddict_card) {
                    return Lampa.Favorite.result.audioaddict_card.map(function(card){ return card.aa_data || {}; }).filter(function(i){ return i.id; });
                }
                return [];
            } else {
                return Lampa.Storage.get('aa_fav_local', []);
            }
        }

        this.create = function () {
            var self = this;
            this.activity.loader(true);
            var current_brand = Lampa.Storage.get('aa_brand', 'di');

            Object.keys(AA_BRANDS).forEach(function(key) {
                var btn = $('<div class="aa-net-btn selector' + (current_brand == key ? ' active' : '') + '">' + getBrandIcon(key) + '<span>' + AA_BRANDS[key].name + '</span></div>');
                btn.on('hover:focus', function() { var el = $(this)[0]; if(el && el.scrollIntoView) el.scrollIntoView({behavior: "smooth", block: "center", inline: "center"}); });
                btn.on('hover:enter', function() { if (current_brand !== key) { Lampa.Storage.set('aa_brand', key); Lampa.Activity.replace(); }});
                selector.append(btn);
            });

            var custom_url = Lampa.Storage.get('aa_custom_playlist', '');
            if (custom_url) {
                var isCust = (current_brand == 'custom');
                var cbtn = $('<div class="aa-net-btn selector' + (isCust ? ' active' : '') + '"><svg class="aa-net-ico-svg" viewBox="0 0 24 24"><path fill="#95a5a6" d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"/></svg><span>Мой плейлист</span></div>');
                cbtn.on('hover:focus', function() { var el = $(this)[0]; if(el && el.scrollIntoView) el.scrollIntoView({behavior: "smooth", block: "center", inline: "center"}); });
                cbtn.on('hover:enter', function() { if (!isCust) { Lampa.Storage.set('aa_brand', 'custom'); Lampa.Activity.replace(); }});
                selector.append(cbtn);
            }

            if (current_brand === 'favorites') {
                var favs = getFavItems();
                if (favs.length) { window.aa_channels_list = favs; self.build(favs); }
                else {
                    var source = isSyncEnabled() ? 'из аккаунта Lampa' : 'локально';
                    self.empty('Избранное пусто.<br><small>Источник: ' + source + '</small>');
                }
            } else if (current_brand === 'custom') {
                network.silent(custom_url, function(m3u) {
                    var items = [];
                    var lines = m3u.split(/\r?\n/);
                    var current = {};
                    lines.forEach(function(line) {
                        line = line.trim();
                        if (!line) return;
                        if (line.indexOf('#EXTINF:') === 0) {
                            var logoMatch = line.match(/tvg-logo="([^"]+)"/i) || line.match(/logo="([^"]+)"/i);
                            if (logoMatch && logoMatch[1]) current.image = logoMatch[1];
                            var parts = line.split(',');
                            current.name = parts[parts.length - 1].trim();
                        } else if (line.indexOf('http') === 0) {
                            current.stream = line;
                            current.key = 'cust_' + Math.random().toString(36).substr(2, 9);
                            current.is_custom = true;
                            if(!current.name) current.name = 'Stream';
                            items.push(current);
                            current = {};
                        }
                    });
                    if(items.length) { window.aa_channels_list = items; self.build(items); }
                    else self.empty('Плейлист пуст.');
                }, function() { self.empty('Ошибка загрузки M3U.'); }, false, { dataType: 'text' });
            } else {
                network["native"]('http://api.audioaddict.com/v1/' + current_brand + '/channels', function(data) {
                    data.sort(function(a, b) { return a.name.localeCompare(b.name); });
                    data.forEach(function(d) { d.brand = current_brand; });
                    window.aa_channels_list = data; self.build(data);
                }, function() { self.empty('Ошибка API.'); });
            }
            return this.render();
        };

        this.empty = function(msg) { body.append('<div class="aa-empty">' + msg + '</div>'); this.finalize(); };

        this.build = function (data) {
            data.forEach(function(el) {
                var id = String(el.id || el.key);
                var img_src = cleanImageUrl(el.image || (el.images ? el.images.default : ''));
                var is_fav = AA_Fav_Check(el);

                var item = Lampa.Template.get('aa_item', { name: el.name });
                item.attr('data-id', id);
                item.find('img').attr('src', img_src);
                if (is_fav) item.append('<div class="aa-card-fav">★</div>');
                if (String(window.aa_active_id) === id) item.addClass('active-playing');

                item.on('hover:focus', function() { last_focused = item[0]; scroll.update(item, true); })
                    .on('hover:enter', function() { window.aa_player.play(el); })
                    .on('hover:long', function() {
                        if (AA_Fav_Check(el)) {
                            AA_Fav_Remove(el);
                            item.find('.aa-card-fav').remove();
                            // Если мы в вкладке "Избранное", скрываем элемент
                            if (Lampa.Storage.get('aa_brand') === 'favorites') item.css({opacity: 0.3, pointerEvents: 'none'});
                        }
                        else {
                            AA_Fav_Add(el);
                            item.append('<div class="aa-card-fav">★</div>');
                        }
                    });
                body.append(item);
            });
            this.finalize();
        };

        this.finalize = function() { html.append(selector); scroll.append(body); html.append(scroll.render()); this.activity.loader(false); this.activity.toggle(); };

        this.start = function () {
            Lampa.Controller.add('content', {
                toggle: function() { Lampa.Controller.collectionSet(html); Lampa.Controller.collectionFocus(last_focused || html.find('.selector')[0], html); },
                left: function() { if (Navigator.canmove('left')) Navigator.move('left'); else Lampa.Controller.toggle('menu'); },
                right: function() { Navigator.move('right'); },
                up: function() { 
                    if (Navigator.canmove('up')) Navigator.move('up'); 
                    else {
                        if(!html.find('.aa-net-row .selector.focus').length) Lampa.Controller.collectionFocus(html.find('.aa-net-row .active')[0], html);
                        else Lampa.Controller.toggle('head');
                    } 
                },
                down: function() { Navigator.move('down'); },
                back: function() { Lampa.Activity.backward(); }
            });
            Lampa.Controller.toggle('content');
        };
        this.render = function () { return html; };
        this.destroy = function () { network.clear(); scroll.destroy(); html.remove(); };
    }

    // 7. ЗАПУСК
    function startPlugin() {
        if (window.aa_v54_final_stable) return; window.aa_v54_final_stable = true;
        
        Lampa.Component.add('audioaddict', AA_Component);
        
        Lampa.Template.add('aa_item', '<div class="selector aa-card"><div class="aa-imgbox"><img onerror="this.src=\'./img/img_broken.svg\'"/></div><div class="aa-name">{name}</div></div>');
        Lampa.Template.add('aa_player_final', 
            '<div class="aa-pl-widget stop hide">' +
                '<div class="aa-pl-icon-wrap selector"><img class="aa-pl-icon" src="" /></div>' +
                '<div class="aa-pl-info">' +
                    '<div class="aa-pl-title">Radio</div>' +
                    '<div class="aa-pl-track"><div class="aa-pl-track-text"><span>...</span></div></div>' +
                '</div>' +
                '<div class="aa-pl-controls">' +
                    '<div class="aa-pl-fav selector aa-pl-btn"><svg viewBox="0 0 24 24"><path fill="white" d="M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55l-.1.1-.1-.1C7.14 14.24 4 11.51 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 3.01-3.14 5.74-7.9 10.05z"/></svg></div>' +
                    '<div class="aa-pl-prev selector aa-pl-btn"><svg viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" fill="white"/></svg></div>' +
                    '<div class="aa-pl-pp selector aa-pl-btn">' +
                        '<div class="aa-pl-play"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="white"/></svg></div>' +
                        '<div class="aa-pl-pause"><svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" fill="white"/></svg></div>' +
                    '</div>' +
                    '<div class="aa-pl-next selector aa-pl-btn"><svg viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" fill="white"/></svg></div>' +
                    '<div class="aa-pl-stop selector aa-pl-btn"><svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill="white"/></svg></div>' +
                '</div>' +
            '</div>'
        );
        
        var styles = '<style>' +
            '.aa-container { height: 100%; display: flex; flex-direction: column; overflow: hidden; }' +
            '.aa-grid { display: flex; flex-wrap: wrap; padding: 10px 40px; justify-content: center; }' +
            '.aa-card { width: 145px; margin: 15px; flex-shrink: 0; position: relative; transition: all 0.2s ease-out; transform-origin: center center; }' +
            '.aa-card.focus { transform: scale(1.15); z-index: 50; }' +
            '.aa-card.focus .aa-imgbox { box-shadow: 0 0 0 4px #f1c40f, 0 10px 20px rgba(0,0,0,0.8); border-radius: 12px; }' +
            '.aa-imgbox { width: 100%; padding-bottom: 100%; position: relative; background: #222; border-radius: 8px; overflow: hidden; }' +
            '.aa-imgbox img { position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; }' +
            '.aa-card-fav { position: absolute; top: 5px; right: 5px; color: #f1c40f; font-size: 1.5em; text-shadow: 0 0 3px #000; z-index: 2; }' +
            '.aa-name { margin-top: 10px; text-align: center; font-size: 1.1em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #fff; font-weight: 500; }' +
            '.aa-card.active-playing .aa-imgbox { outline: 3px solid #e74c3c; }' +
            '.aa-net-row { display: flex; padding: 40px 40px 10px; overflow-x: auto; white-space: nowrap; flex-shrink: 0; scrollbar-width: none; }' +
            '.aa-net-row::-webkit-scrollbar { display: none; }' +
            '.aa-net-btn { display: inline-flex; align-items: center; padding: 10px 25px; background: rgba(255,255,255,0.08); border-radius: 50px; margin-right: 15px; font-size: 1.2em; cursor: pointer; color: #ddd; border: 2px solid transparent; flex-shrink: 0; }' +
            '.aa-net-btn img, .aa-net-btn svg { width: 28px; height: 28px; margin-right: 12px; }' +
            '.aa-net-btn.active { background: #fff; color: #222; font-weight: bold; }' +
            '.aa-net-btn.focus { border-color: #f1c40f; transform: scale(1.05); background: rgba(255,255,255,0.2); }' +
            '.aa-empty { text-align: center; margin-top: 100px; font-size: 1.5em; color: #aaa; width: 100%; }' +
            '.aa-pl-widget { display: flex; align-items: center; background: rgba(25,25,25,0.95); backdrop-filter: blur(10px); padding: 5px 15px; border-radius: 15px; margin-right: 15px; height: 60px; min-width: 500px; max-width: 650px; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 4px 20px rgba(0,0,0,0.6); }' +
            '.aa-pl-icon-wrap { width: 44px; height: 44px; margin-right: 15px; border-radius: 8px; overflow: hidden; flex-shrink: 0; }' +
            '.aa-pl-icon { width: 100%; height: 100%; object-fit: cover; }' +
            '.aa-pl-info { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; margin-right: 15px; overflow: hidden; }' +
            '.aa-pl-title { font-size: 16px; font-weight: bold; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 2px; }' +
            '.aa-pl-track { font-size: 14px; color: #aaa; white-space: nowrap; overflow: hidden; position: relative; height: 20px; }' +
            '.aa-pl-track-text { display: inline-block; white-space: nowrap; }' +
            '.aa-pl-track-text.scrolling { animation: aa-marquee 10s linear infinite; padding-left: 100%; }' +
            '@keyframes aa-marquee { 0% { transform: translate(0, 0); } 100% { transform: translate(-100%, 0); } }' +
            '.aa-pl-controls { display: flex; align-items: center; flex-shrink: 0; gap: 5px; }' +
            '.aa-pl-btn { width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; border-radius: 50%; transition: all 0.2s; }' +
            '.aa-pl-btn.focus { background: #f1c40f; transform: scale(1.1); box-shadow: 0 0 10px rgba(241, 196, 15, 0.5); }' +
            '.aa-pl-btn.focus svg path { fill: #000 !important; }' +
            '.aa-pl-btn svg { width: 20px; height: 20px; }' +
            '.aa-pl-pause { display: none; } .aa-pl-widget:not(.stop) .aa-pl-pause { display: block; } .aa-pl-widget:not(.stop) .aa-pl-play { display: none; }' +
            '.aa-pl-fav.active svg path { fill: #f1c40f !important; }' + 
            
            '#aa-overlay-info { position: fixed; z-index: 999999; }' +
            '.aa-pos-bl { bottom: 50px; left: 50px; }' +
            '.aa-pos-br { bottom: 50px; right: 50px; }' +
            '.aa-pos-tl { top: 50px; left: 50px; }' +
            '.aa-pos-tr { top: 50px; right: 50px; }' +
            
            '.aa-ov-card { display: flex; align-items: center; background: rgba(0,0,0,0.8); backdrop-filter: blur(20px); padding: 20px; border-radius: 20px; border: 1px solid rgba(255,255,255,0.15); box-shadow: 0 10px 40px rgba(0,0,0,0.5); max-width: 600px; }' +
            '.aa-ov-img-wrap { position: relative; width: 100px; height: 100px; margin-right: 25px; flex-shrink: 0; }' +
            '.aa-ov-img { width: 100%; height: 100%; border-radius: 12px; box-shadow: 0 5px 15px rgba(0,0,0,0.5); object-fit: cover; }' +
            '.aa-ov-text { display: flex; flex-direction: column; justify-content: center; }' +
            '.aa-ov-station { font-size: 24px; font-weight: bold; margin-bottom: 5px; text-shadow: 0 2px 4px rgba(0,0,0,0.8); }' +
            '.aa-ov-track { font-size: 18px; color: #ddd; text-shadow: 0 2px 4px rgba(0,0,0,0.8); line-height: 1.3; }' +
            '.aa-ov-vis-container.mode-bars { position: absolute; bottom: 0; left: 0; width: 100%; height: 100%; display: flex; align-items: flex-end; justify-content: space-around; padding: 5px; box-sizing: border-box; }' +
            '.aa-ov-bar { width: 15%; background: #fff; animation: aa-eq-bounce 0.5s infinite ease-in-out alternate; border-radius: 3px 3px 0 0; }' +
            '@keyframes aa-eq-bounce { 0% { height: 10%; } 100% { height: 70%; } }' +
            '.aa-pulse-anim { animation: aa-pulse-img 1s infinite alternate; }' +
            '@keyframes aa-pulse-img { 0% { transform: scale(1); filter: brightness(1); } 100% { transform: scale(1.05); filter: brightness(1.2); } }' +
            '.aa-ov-vis-container.mode-wave { position: absolute; bottom: 10px; left: 0; width: 100%; height: 20px; overflow: hidden; }' +
            '.aa-ov-wave { width: 100%; height: 100%; border-top: 3px solid #fff; border-radius: 50%; animation: aa-wave-spin 1s infinite linear; transform-origin: 50% 100%; }' +
            '@keyframes aa-wave-spin { 0% { transform: rotate(-10deg) scaleY(0.5); } 50% { transform: rotate(10deg) scaleY(1); } 100% { transform: rotate(-10deg) scaleY(0.5); } }' +
            '</style>';
        $('body').append(styles);

        window.aa_player = new AA_Player();
        window.aa_overlay = AA_Overlay;
        window.aa_overlay.init();

        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') {
                var menu_item = $('<li class="menu__item selector" data-action="audioaddict"><div class="menu__ico"><svg height="24" viewBox="0 0 24 24" width="24" fill="white"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg></div><div class="menu__text">AudioAddict</div></li>');
                menu_item.on('hover:enter', function() { Lampa.Activity.push({ title: 'AudioAddict', component: 'audioaddict', page: 1 }); });
                $('.menu .menu__list').eq(0).append(menu_item);
                
                window.aa_player.create();

                if (Lampa.SettingsApi) {
                    var COMP_ID = "aa_settings_final_v54";
                    Lampa.SettingsApi.addComponent({ component: COMP_ID, name: "AudioAddict", icon: '<svg height="24" viewBox="0 0 24 24" width="24" fill="white"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>' });
                    
                    Lampa.SettingsApi.addParam({ component: COMP_ID, param: { name: "aa_server", type: "select", values: AA_SERVERS, "default": 'prem2' }, field: { name: "Сервер" } });
                    Lampa.SettingsApi.addParam({ component: COMP_ID, param: { name: "aa_listen_key", type: "input", placeholder: "Введите ключ", values: "" }, field: { name: "Listen Key" } });
                    Lampa.SettingsApi.addParam({ component: COMP_ID, param: { name: "aa_custom_playlist", type: "input", placeholder: "http://...", values: "" }, field: { name: "M3U Плейлист" } });
                    
                    Lampa.SettingsApi.addParam({ component: COMP_ID, param: { name: "aa_show_on_saver", type: "select", values: { 'true': 'Включено', 'false': 'Выключено' }, "default": 'true' }, field: { name: "Виджет на заставке" } });
                    Lampa.SettingsApi.addParam({ component: COMP_ID, param: { name: "aa_saver_pos", type: "select", values: AA_POSITIONS, "default": 'bl' }, field: { name: "Позиция виджета" } });
                    Lampa.SettingsApi.addParam({ component: COMP_ID, param: { name: "aa_saver_opacity", type: "select", values: AA_OPACITY, "default": '1' }, field: { name: "Прозрачность виджета" } });
                    Lampa.SettingsApi.addParam({ component: COMP_ID, param: { name: "aa_vis_type", type: "select", values: AA_VIS_TYPES, "default": 'bars' }, field: { name: "Визуализация" } });
                    
                    Lampa.SettingsApi.addParam({ component: COMP_ID, param: { name: "aa_shuffle_mode", type: "select", values: AA_SHUFFLE_MODES, "default": 'off' }, field: { name: "Режим перемешивания" } });
                    Lampa.SettingsApi.addParam({ component: COMP_ID, param: { name: "aa_shuffle_auto", type: "select", values: AA_SHUFFLE_TRIGGERS, "default": 'manual' }, field: { name: "Переключать автоматически" } });
                    
                    Lampa.SettingsApi.addParam({ component: COMP_ID, param: { name: "aa_fav_sync", type: "select", values: { 'true': 'Включено', 'false': 'Выключено' }, "default": 'false' }, field: { name: "Синхронизация избранного" } });
                }
            }
        });
    }

    startPlugin();
})();
