/**
 * engines/fontkit
 *
 * 非完整字体编码，不推荐使用，目前仅支持 Node.js 环境
 *
 * @know issues:
 *
 * https://github.com/devongovett/fontkit#subsets
 *
 */

const fontkit = require('fontkit');
const readStream = require('../read-stream');

module.exports = (buffer, chars = []) => {
    const font = fontkit.create(buffer);

    // layout a string, using default shaping features.
    // returns a GlyphRun, describing glyphs and positions.
    const run = font.layout(chars.join(''));

    // create a font subset
    const subset = font.createSubset();

    run.glyphs.forEach(function(glyph) {
        subset.includeGlyph(glyph);
    });

    const stream = subset.encodeStream();

    return readStream(stream);
};
