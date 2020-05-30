/**
 * font-subseter
 *
 * @see: https://github.com/as-com/woffjs
 */

const sfnt2woff = require('sfnt2woff');
const opentype = require('opentype.js');
const opentypeEngine = require('./engines/opentype');
const PathData = require('./path-data');
const abTools = require('./ab-tools');

const fitFloat = (num, precision = 3) => {
    return num.toFixed(precision).replace(/\.0+$/, '');
};

class FontSubseter {
    constructor({
        // default engine
        engine = opentypeEngine
    } = {}) {
        this.engine = engine;
    }

    assert(value, message) {
        if(!value) {
            throw new Error(message);
        }
    }

    parseFont(buffer) {
        this.assert(buffer, 'File buffer required');

        return opentype.parse(abTools.bufferToAB(buffer));
    }

    loadInfo(buffer, lang = 'en') {
        const font = this.parseFont(buffer);

        const names = font.names;
        const getName = k => {
            const data = names[k] || { en: '' };

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
            tables: font.tables,
            names
        };
    }

    loadInfoByBlob(blob, lang = 'en') {
        return abTools.blobToAB(blob)
        .then(buf => {
            return this.loadInfo(buf, lang);
        });
    }

    subset(buffer, chars = 'ABCDX', options = {}) {
        return new Promise(resolve => {
            this.assert(buffer, 'File buffer required');

            const _subset = this.engine;
            const charsArr = Array.from(new Set(chars));

            // Ensure space char
            if(charsArr.indexOf(' ') < 0) {
                charsArr.push(' ');
            }

            resolve(_subset(buffer, charsArr, options));
        })
        .catch(err => {
            err.message = `[FontSubseter] ${err.message}`;

            throw err;
        });
    }

    covertToWoff(buffer) {
        buffer = sfnt2woff(buffer);

        buffer.type = 'font/woff';

        return buffer;
    }

    makeThumbnail(buffer, text = '', {
        fontSize = 60,
        height = 80,
        width = 300
    } = {}) {
        const font = this.parseFont(buffer);

        if(!text) {
            const family = font.names.fontFamily || '';

            text = family.zh || family.en || family || 'Unknow font name';
        }

        const x = Math.floor(fontSize / 4);
        const y = Math.floor((font.ascender / font.unitsPerEm) * fontSize);
        const path = font.getPath(text, x, y, fontSize);
        const pathDataStr = String(path.toPathData()).trim();

        // 某些情况下无法创建路径 （eg. 新蒂金钟体, 新蒂雪山体）
        if(!pathDataStr) {
            throw new Error('Parse path error');
        }

        /**
         * 计算缩略图偏移高度
         * step1. 上面先随便拿个 y 来生成缩略图。
         * step2. 生成完图以后，可以根据 bbox 计算出缩略图所占的高度(contentHeight) 和 目前距离顶部的高度(bbox.y1)。
         * step3. 上下的 gap 高度 = （总高度(height) - 缩略图所占的高度(contentHeight)）/ 2。
         * step4. 最后需要修正高度 = gap - 目前距离顶部的高度(bbox.y1)。
         */
        const bbox = path.getBoundingBox();
        const contentHeight = bbox.y2 - bbox.y1;
        const gap = (height - contentHeight) / 2;

        // Fit viewbox width
        width = Math.ceil(Math.max(width, bbox.x2 + x));

        const viewBox = `0 0 ${width} ${height}`;
        const pathData = new PathData(pathDataStr);
        const offsets = [
            Math.floor(bbox.x1 - x),
            -Math.floor(gap - bbox.y1)
        ];

        // shim: opentype.js 导出时路径时有一定偏移值，此处修正
        pathData.paths.forEach(path => {
            path.actions.forEach(({ args }) => {
                for(let len = args.length, i = 0; i < len; i += 2) {
                    let j = i % 2;

                    args[i] -= offsets[j];
                    args[i + 1] -= offsets[j + 1];

                    // 优化小数显示
                    args[i] = fitFloat(args[i]);
                    args[i + 1] = fitFloat(args[i + 1]);
                }
            });
        });

        const svgPaths = pathData.toString();
        const xmlns = 'http://www.w3.org/2000/svg';
        const svg = `<svg viewBox="${viewBox}" xmlns="${xmlns}">${svgPaths}</svg>`;

        return {
            height,
            width,
            svg
        };
    }
}

module.exports = FontSubseter;
