/**
 * demo
 */

import './main.less';
import Otfer from '../index';

const app = new window.Vue({
    el: '#app',
    data() {
        return {
            fontList: [],
            pending: false,
            currentFont: null,
            demoText: '',

            previewPresets: [
                { writingMode: 'vertical-rl', subset: false },
                { writingMode: 'vertical-rl', subset: true },
                { writingMode: 'horizontal-tb', subset: false },
                { writingMode: 'horizontal-tb', subset: true }
            ]
        };
    },
    methods: {
        async loadFonts() {
            const res = await fetch('/fonts');
            const fontList = await res.json();

            this.fontList = fontList.map(font => {
                const names = font.names;

                return {
                    alias: names.fullName.zh || names.fullName.en,
                    family: names.fontFamily.en,
                    subfamily: names.fontSubfamily.en,
                    name: names.postScriptName.en,
                    names: font.names,
                    url: font.url
                };
            });

            return this.fontList;
        },

        async previewFont(font) {
            if(
                font === this.currentFont &&
                this.demoText === this._lastDemoText
            ) {
                return;
            }

            const lastFont = this.currentFont;
            if(!this.demoText || this.demoText === lastFont.alias) {
                this._lastDemoText = font.alias;
                this.demoText = font.alias;
            }

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
            ]);

            this.pending = false;
        },

        async subsetFont(font) {
            if(!font.otfer) {
                const res = await fetch(font.url);
                const buffer = await res.arrayBuffer();

                font.otfer = new Otfer(buffer);
            }

            const otfer = font.otfer;
            const newFont = otfer.subset(this.demoText);
            const buffer = newFont.toArrayBuffer();
            const blob = new Blob([buffer]);
            const fontData = Object.assign({}, font, {
                url: URL.createObjectURL(blob)
            });

            await this.registerFont(fontData, {
                useLocal: false,
                subset: true
            });

            // Clean
            setTimeout(() => {
                URL.revokeObjectURL(fontData.url);
            }, 4000);

            return newFont;
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
        }
    },
    watch: {
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
