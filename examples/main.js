/**
 * demo
 */

import './main.less';
import FontSubseter from '../index';

const subseter = new FontSubseter();
const getQuery = (name, defaultValue = '', coverter) => {
    const re = new RegExp(`[?&]${name}=([^&]+)`);
    let ret = re.test(location.search) ? RegExp.$1 : defaultValue;

    if(coverter) {
        return coverter(ret);
    }

    return ret;
};

const app = new window.Vue({
    el: '#app',
    data() {
        return {
            fontList: [],
            pending: false,
            currentFont: null,

            params: {
                forceUseFile: getQuery('forceUseFile', false),
                forceTruetype: getQuery('forceTruetype', false),
                engine: getQuery('engine', 'opentype.js'),
                fontType: getQuery('type', 'woff'),
                demoText: getQuery('text', ''),

                apiUrl: getQuery('api', ''),
                fontUrl: getQuery('url', '')
            },

            previewPresets: [
                { writingMode: 'vertical-rl', subset: false },
                { writingMode: 'vertical-rl', subset: true },
                { writingMode: 'horizontal-tb', subset: false },
                { writingMode: 'horizontal-tb', subset: true }
            ]
        };
    },
    methods: {
        pickOrApplyFont(force = false) {
            const url = this.params.fontUrl;
            if(!url) {
                return this.$refs.fileInp.click();
            }

            let font = this.fontList.find(item => {
                return item.url === url || item.originUrl === url;
            });

            if(!font) {
                font = { url };
            }

            if(force) {
                delete this._lastParamsJSON;
            }

            this.previewFont(font);
        },

        fillFontInfo(font) {
            const names = font.names;
            const getName = (k, lang = 'zh') => {
                const data = names && names[k] || { en: '' };

                return data[lang] || data['en'] || '';
            };

            const family = getName('fontFamily', 'en');

            return {
                family,
                subfamily: getName('subfamily'),
                alias: getName('fontFamily') || family,
                name: getName('postScriptName') || family,
                loading: false,
                url: font.url,
                names
            };
        },

        async loadFonts() {
            const res = await fetch('/fonts');
            const fontList = await res.json();

            this.fontList = fontList.map(font => {
                return this.fillFontInfo(font);
            });

            return this.fontList;
        },

        checkParamsChange() {
            const data = Object.assign({}, this.params, {
                // Ignore keys
                fontUrl: '',
                apiUrl: ''
            });

            const json = JSON.stringify(data);
            if(json !== this._lastParamsJSON) {
                this._lastParamsJSON = json;

                return true;
            }

            return false;
        },
        async previewFont(font = this.currentFont) {
            if(!font) {
                return;
            }

            // Load font
            if(!font.file && font.url) {
                font.loading = true;

                const res = await fetch(font.url);

                font.file = await res.blob();
            }

            // Fill font info
            if(!font.names && font.file) {
                const rawFont = await subseter.loadInfoByBlob(font.file);
                const fontInfo = this.fillFontInfo({
                    url: font.url ? font.url : URL.createObjectURL(font.file),
                    names: rawFont.names
                });

                Object.assign(font, fontInfo);
            }

            // Add to fontList is need
            if(this.fontList.indexOf(font) < 0) {
                if(!font.names) {
                    const extInfo = this.fillFontInfo(font);

                    Object.assign(font, extInfo);
                }

                this.fontList.unshift(font);
            }

            // Check demoText
            const params = this.params;
            const lastFont = this.currentFont;
            const nextText = font.alias || font.name || '';
            const oldText = params.demoText;

            // Enabel state
            this.currentFont = font;
            font.loading = false;

            if(nextText && (!oldText || oldText === lastFont.alias)) {
                params.demoText = nextText;

                // Will triger paramse watch
                if(nextText !== oldText) {
                    return;
                }
            }

            if(!this.checkParamsChange()) {
                return;
            }

            this.pending = true;

            await Promise.all([
                this.registerFont(font),
                new Promise(resolve => {
                    // Delay for UI
                    setTimeout(() => {
                        resolve(this.subsetFont(font, params));
                    }, 320);
                })
                .then(subsetFont => {
                    font.subset = subsetFont;

                    return subsetFont;
                })
            ]);

            this.pending = false;
        },

        async requestApi(path = '/', data = null) {
            data = Object.assign({}, data || {});

            // Fix url
            if(data.url) {
                const linkEl = document.createElement('a');

                data.url = (linkEl.href = data.url) && linkEl.href;
            }

            // Check file or url
            if(!this.params.forceUseFile && /^https?:\/\//i.test(data.url)) {
                delete data.file;
            }

            let body = JSON.stringify(data);
            let bodyType = 'application/json';

            // Fit file
            if(data.file && (data.file instanceof Blob)) {
                // bodyType = 'multipart/form-data';
                bodyType = null;

                body = new FormData();

                Object.keys(data).forEach(k => {
                    body.append(k, data[k]);
                });
            }

            const res = await fetch(this.params.apiUrl + path, {
                headers: bodyType ? { 'Content-Type': bodyType } : {},
                method: 'post',
                body
            });

            if(res.status >= 400) {
                const data = await res.json();
                const err = new Error(data.message);

                err.response = data;

                throw err;
            }

            return res;
        },

        async subsetFont(font = this.currentFont, params = this.params) {
            const fontData = Object.assign({}, font, {
                // url: '//localhost/d/xx.woff2',
                url: null
            });

            const data = {
                url: font.url,
                file: font.file,

                forceTruetype: params.forceTruetype,
                text: params.demoText,
                engine: params.engine,
                type: 'ttf',
            };

            const res = await this.requestApi('/subset', data);

            let blob;
            if(params.fontType !== 'ttf') {
                // Debug local toWoff
                const tmpBuf = await res.arrayBuffer();
                const newBuf = subseter.covertToWoff(tmpBuf);

                blob = new Blob([newBuf], {
                    type: 'font/woff'
                });
            }
            else {
                blob = await res.blob();
            }

            fontData.type = blob.type;
            fontData.url = URL.createObjectURL(blob);

            // Clean
            setTimeout(() => {
                URL.revokeObjectURL(fontData.url);

                delete fontData.url;
            }, 60000);

            await this.registerFont(fontData, {
                useLocal: false,
                subset: true
            });

            return fontData;
        },

        async registerFont(data, {
            useLocal = true,
            subset = false
        } = {}) {
            if(subset) {
                data = Object.assign({}, data, {
                    family: `${data.family} Subset`,
                    alias: `${data.alias} Subset`,
                    name: `${data.name}-Subset`
                });
            }

            if(!this.registersFontsMap) {
                this.registersFontsMap = {};
            }

            const family = data.family || data.name;
            const map = this.registersFontsMap;

            if(!subset && map[family]) {
                return map[family];
            }

            const urls = [];

            if(useLocal) {
                urls.push(`local("${family}")`);
            }
            if(useLocal && data.name !== family) {
                urls.push(`local("${data.name}")`);
            }

            if(data.woff || data.url) {
                urls.push(`url("${data.woff || data.url}")`);
            }
            if(data.ttf) {
                urls.push(`url("${data.ttf}")`);
            }

            console.log(`Register font: [${family}]`, urls.join(','), {
                weight: data.weight || 'normal',
                style: data.style || 'normal'
            }, data);

            const font = new FontFace(family, urls.join(','), {
                weight: data.weight || 'normal',
                style: data.style || 'normal'
            });

            document.fonts.add(font);

            map[family] = font;

            return await font.load();
        },

        updateFontPreviewLazy() {
            clearTimeout(this.updateFontPreviewTimer);

            this.updateFontPreviewTimer = setTimeout(() => {
                this.previewFont();
            }, 520);
        },

        async makeThumbnail() {
            const font = this.currentFont;
            if(!font) {
                return;
            }

            // Loader
            this.$set(font, 'thumbnail', {
                svg: 'Loading...'
            });

            return this.requestApi('/thumbnail', {
                url: font.url,
                file: font.file,
                text: this.params.demoText
            })
            .then(res => {
                return res.json();
            })
            .then(data => {
                data.image = `data:image/svg+xml,${data.svg.replace(/\n/, '')}`;
                font.thumbnail = data;

                return data;
            })
            .catch(err => {
                font.thumbnail = {
                    svg: `Make thumbnail error: ${err.message}`
                };

                throw err;
            });
        },

        downloadFont() {
            const font = this.currentFont && this.currentFont.subset;
            if(!font || !font.url) {
                return;
            }

            const link = document.createElement('a');
            const extsMap = {
                'font/truetype': '.ttf',
                'font/opentype': '.otf',
                'font/woff2': '.woff2',
                'font/woff': '.woff'
            };
            const ext = extsMap[font.type] || extsMap['font/truetype'];

            link.download = `${font.name}.subset${ext}`;
            link.href = font.url;

            link.click();
        },

        async onFileChange(e) {
            this.previewFont({
                file: e.target.files[0]
            });
        }
    },
    watch: {
        params: {
            deep: true,
            handler() {
                this.updateFontPreviewLazy();
            }
        }
    },
    async created() {
        const fontList = await this.loadFonts();
        const font = this.params.fontUrl
            ? { url: this.params.fontUrl }
            : fontList[0];

        if(font) {
            this.previewFont(font);
        }
    }
});

window.app = app;
