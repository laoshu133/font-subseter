/**
 * engines/opentype.js
 *
 * 默认子集化引擎，支持浏览器端运行
 * 当需要支持竖排文本时不推荐使用
 *
 * @know issues:
 *
 * https://github.com/nodebox/opentype.js/issues/152
 * https://github.com/nodebox/opentype.js/issues/112
 *
 */

const opentype = require('opentype.js');
const { parse, Glyph, Path, Font } = opentype;

const hasBuffer = typeof Buffer !== 'undefined';

const nodeBufferToArrayBuffer = buffer => {
    const ab = new ArrayBuffer(buffer.length);
    const view = new Uint8Array(ab);

    for(let i = buffer.length - 1; i >= 0; --i) {
        view[i] = buffer[i];
    }

    return ab;
};

const arrayBufferToNodeBuffer = ab => {
    const buffer = new Buffer(ab.byteLength);
    const view = new Uint8Array(ab);

    for(let i = buffer.length - 1; i >= 0; --i) {
        buffer[i] = view[i];
    }

    return buffer;
};

module.exports = (buffer, chars = []) => {
    // opentype.js only support ArrayBuffer
    if(hasBuffer && Buffer.isBuffer(buffer)) {
        buffer = nodeBufferToArrayBuffer(buffer);
    }

    const unicodesMap = {};
    const font = parse(buffer);

    const glyphs = chars.map(char => {
        const glyph = font.charToGlyph(char);
        const unicode = glyph && glyph.unicode;
        const unicodes = glyph && glyph.unicodes;

        if(!glyph || unicodesMap[unicode]) {
            return null;
        }
        unicodesMap[unicode] = true;

        // Force fix space char unicodes
        if(unicodes.indexOf(32) > -1 || unicodes.indexOf(160) > -1) {
            console.log('[FontSubseter] Force reset space char unicodes, old unicodes:', `[${unicodes.join(', ')}]`);

            glyph.unicodes = [32, 160];
            glyph.unicode = 32;
        }

        // Fix cmap encoding
        // https://github.com/nodebox/opentype.js/pull/315
        glyph.unicodes = glyph.unicodes.filter(code => {
            if(code <= 0xffff) {
                return true;
            }

            console.log(`[FontSubseter] Skip "${char}[${glyph.unicode}]" unicode: `, code);

            return false;
        });

        return glyph;
    })
    .filter(glyph => {
        return !!glyph;
    });

    // Unshift notdef
    glyphs.unshift(new Glyph({
        name: '.notdef',
        path: new Path(),
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
        console.log('[FontSubseter] Force reset font metrics.');

        newFontCfg.descender = font.descender;
        newFontCfg.ascender = font.ascender;
    }

    const newFont = new Font(newFontCfg);

    // Override and clear names
    // Object.assign(newFont.names, font.names);
    // eslint-disable-next-line no-control-regex
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

    const ab = newFont.toArrayBuffer();
    const ret = hasBuffer ? arrayBufferToNodeBuffer(ab) : ab;

    ret.type = 'font/opentype';

    return ret;
};
