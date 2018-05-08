/**
 * demo
 */

import './main.less';
import FontSubseter from '../index';

const subseter = new FontSubseter();

const app = new window.Vue({
    el: '#app',
    data() {
        return {
            fontList: [],
            pending: false,
            currentFont: null,
            demoText: '',
            engine: /[?&]engine=([^&]+)/.test(location.search) ? RegExp.$1 : 'opentype',
            fontType: /[?&]type=([^&]+)/.test(location.search) ? RegExp.$1 : 'ttf',

            previewPresets: [
                { writingMode: 'vertical-rl', subset: false },
                { writingMode: 'vertical-rl', subset: true },
                { writingMode: 'horizontal-tb', subset: false },
                { writingMode: 'horizontal-tb', subset: true }
            ]
        };
    },
    methods: {
        fillFontInfo(font) {
            const names = font.names;
            const getName = (k, lang = 'zh') => {
                const data = names[k] || { en: '' };

                return data[lang] || data['en'] || '';
            };

            const family = getName('fontFamily', 'en');

            return {
                family,
                subfamily: getName('subfamily'),
                alias: getName('fontFamily') || family,
                name: getName('postScriptName') || family,
                names: font.names,
                url: font.url
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

        async previewFont(font = this.currentFont) {
            if(
                font === this.currentFont &&
                this.engine === this._lastengine &&
                this.demoText === this._lastDemoText
            ) {
                return;
            }

            const lastFont = this.currentFont;
            if(!this.demoText || this.demoText === lastFont.alias) {
                this.demoText = font.alias;
            }

            this._lastDemoText = this.demoText;
            this._lastengine = this.engine;
            this.currentFont = font;
            this.pending = true;

            await Promise.all([
                this.registerFont(font),
                new Promise(resolve => {
                    // Delay for UI
                    setTimeout(() => {
                        resolve(this.subsetFont(font));
                    }, 500);
                })
                .then(subsetFont => {
                    font.subset = subsetFont;

                    return subsetFont;
                })
            ]);

            this.pending = false;
        },

        async subsetFont(font = this.currentFont) {
            const fontData = Object.assign({}, font, {
                // url: '//localhost/d/xx.woff2',
                url: null
            });

            if(!fontData.url) {
                if(!font.file && font.url) {
                    const res = await fetch(font.url);

                    font.file = await res.blob();
                }

                const formData = new FormData();

                formData.append('file', font.file);
                formData.append('engine', this.engine);
                formData.append('type', this.fontType);
                formData.append('text', this.demoText);

                const res = await fetch('/subseter', {
                    method: 'post',
                    body: formData
                });

                fontData.type = res.headers.get('content-type');

                let blob = null;
                if(fontData.type === 'font/woff') {
                    blob = await res.blob();
                }
                else {
                    const buf = await res.arrayBuffer();
                    const newBuf = subseter.covertToWoff(buf);

                    blob = new Blob([newBuf], {
                        type: 'font/woff'
                    });
                }

                fontData.url = URL.createObjectURL(blob);

                // Clean
                setTimeout(() => {
                    URL.revokeObjectURL(fontData.url);
                }, 30000);
            }

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
                this.previewFont(this.currentFont);
            }, 520);
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
            const file = e.target.files[0];
            const fontInfo = await subseter.loadInfoByBlob(file);
            const font = this.fillFontInfo({
                url: URL.createObjectURL(file),
                names: fontInfo.names,
                file
            });

            this.fontList.unshift(font);
            this.previewFont(font);
        }
    },
    watch: {
        engine() {
            this.updateFontPreviewLazy();
        },
        demoText() {
            this.updateFontPreviewLazy();
        }
    },
    async created() {
        const fontList = await this.loadFonts();

        if(fontList[0]) {
            this.previewFont(fontList[0]);
        }
    }
});

window.app = app;
