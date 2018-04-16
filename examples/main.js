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
            demoText: 'ABCDX',

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
            this.pending = true;
            this.currentFont = font;
            this.demoText = font.alias || font.name;

            await Promise.all([
                this.registerFont(font, true),
                this.subsetFont(font)
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
            const url = URL.createObjectURL(blob);

            await this.registerFont({
                alias: `${font.alias} Subset`,
                family: `${font.family} Subset`,
                name: `${font.name}-Subset`,
                url
            });

            // Clean
            setTimeout(() => {
                URL.revokeObjectURL(url);
            }, 4000);

            return newFont;
        },

        async registerFont(options, withLocal = true) {
            const family = options.family || options.name;
            const urls = [];

            if(withLocal) {
                urls.push(`local("${family}")`);
            }
            if(withLocal && options.name !== family) {
                urls.push(`local("${options.name}")`);
            }

            if(options.woff || options.url) {
                urls.push(`url("${options.woff || options.url}")`);
            }
            if(options.ttf) {
                urls.push(`url("${options.ttf}")`);
            }

            console.log(`Register font: [${family}]`, urls.join(','), {
                weight: options.weight || 'normal',
                style: options.style || 'normal'
            }, options);

            const font = new FontFace(family, urls.join(','), {
                weight: options.weight || 'normal',
                style: options.style || 'normal'
            });

            document.fonts.add(font);

            return await font.load();
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
