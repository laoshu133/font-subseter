/**
 * Otfer
 *
 * @see: https://github.com/as-com/woffjs
 */

import {
    parse as parseFont,
    Glyph as FontGlyph,
    Path as FontPath,
    Font
} from 'opentype.js';

class Otfer {
    constructor(buffer = null, options = {}) {
        this.options = options;
        this.buffer = buffer;
    }

    parseFont() {
        return parseFont(this.buffer);
    }

    loadInfo() {
        const font = this.parseFont(this.buffer);

        const names = font.names;
        const getName = (k, lang = 'en') => {
            const data = names[k] || {};

            return data[lang] || data['en'] || '';
        };

        return {
            fullName: getName('fullName'),
            fontFamily: getName('fontFamily'),
            fontSubfamily: getName('fontSubfamily'),
            postScriptName: getName('postScriptName'),
            ascender: font.ascender,
            descender: font.descender,
            os2: font.tables.os2,
            names
        };
    }

    subset(chars = 'ABCDX') {
        const charsArr = Array.from(new Set(chars));
        const font = this.parseFont(this.buffer);
        const unicodesMap = {};

        const glyphs = charsArr.map(char => {
            const glyph = font.charToGlyph(char);
            const unicode = glyph && glyph.unicode;
            const unicodes = glyph && glyph.unicodes;

            if(!glyph || unicodesMap[unicode]) {
                return;
            }
            unicodesMap[unicode] = true;

            // Force fix space char unicodes
            if(unicodes.indexOf(32) > -1 || unicodes.indexOf(160) > -1) {
                console.log('[Otfer] Force reset space char unicodes, old unicodes:', unicodes);

                glyph.unicodes = [32, 160];
                glyph.unicode = 32;
            }

            // Fix cmap encoding
            // https://github.com/nodebox/opentype.js/pull/315
            glyph.unicodes = glyph.unicodes.filter(code => {
                if(code <= 0xffff) {
                    return true;
                }

                console.log(`[Otfer] Skip "${char}[${glyph.unicode}]" unicode: `, code);

                return false;
            });

            return glyph;
        })
        .filter(glyph => {
            return !!glyph;
        });

        // Unshift notdef
        glyphs.unshift(new FontGlyph({
            name: '.notdef',
            path: new FontPath(),
            advanceWidth: 650,
            unicode: 0
        }));

        // Calc new metrics
        const yMins = [];
        const yMaxs = [];

        glyphs.forEach(glyph => {
            const metrics = glyph.getMetrics();

            if(glyph.name === '.notdef') {
                return;
            }

            yMins.push(metrics.yMin);
            yMaxs.push(metrics.yMax);
        });

        const newFontCfg = {
            familyName: font.names.fontFamily.en,
            styleName: font.names.fontSubfamily.en,
            unitsPerEm: font.unitsPerEm,
            // ascender: Math.max.apply(null, yMaxs),
            // descender: Math.min.apply(null, yMins),
            descender: font.descender,
            ascender: font.ascender,
            glyphs: glyphs
        };

        // Reset new font metrics
        if(!newFontCfg.ascender && !newFontCfg.descender) {
            console.log('[Otfer] Force reset font metrics.');

            newFontCfg.descender = font.descender;
            newFontCfg.ascender = font.ascender;
        }

        const newFont = new Font(newFontCfg);

        // Override and clear names
        // Object.assign(newFont.names, font.names);
        const rNotAscii = /[^\x00-\xff]/g;
        Object.keys(font.names).forEach(k => {
            let val = font.names[k].en || '';

            // Remove non-ascii chars
            if(k === 'fontFamily' || k === 'postScriptName') {
                val = val.replace(rNotAscii, '').trim();
            }

            newFont.names[k] = {
                en: val
            };
        });

        // return newFont.toArrayBuffer();
        return newFont;
    }
}

export default Otfer;
