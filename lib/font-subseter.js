/**
 * font-subseter
 *
 * @see: https://github.com/as-com/woffjs
 */

const opentype = require('opentype.js');
const blobToArraybuffer = require('./blob-to-arraybuffer');

class FontSubseter {
    constructor({
        // default engine
        engine = require('./engines/opentype')
    } = {}) {
        this.engine = engine;
    }

    parseFont(buffer) {
        return opentype.parse(buffer);
    }

    loadInfo(buffer, lang = 'en') {
        const font = this.parseFont(buffer);

        const names = font.names;
        const getName = k => {
            const data = names[k] || {};

            return data[lang] || data['en'] || '';
        };

        const fontFamily = getName('fontFamily');

        return {
            fontFamily,
            fontSubfamily: getName('fontSubfamily'),
            fullName: getName('fullName') || fontFamily,
            postScriptName: getName('postScriptName') || fontFamily,
            descender: font.descender,
            ascender: font.ascender,
            os2: font.tables.os2,
            names
        };
    }

    loadInfoByBlob(blob, lang = 'en') {
        return blobToArraybuffer(blob)
        .then(buf => {
            return this.loadInfo(buf, lang);
        });
    }

    subset(buffer, chars = 'ABCDX', options = {}) {
        const charsArr = Array.from(new Set(chars));
        const _subset = this.engine;

        return new Promise(resolve => {
            resolve(_subset(buffer, charsArr, options));
        })
        .catch(err => {
            err.message = `[FontSubseter] ${err.message}`;

            throw err;
        });
    }
}

module.exports = FontSubseter;
