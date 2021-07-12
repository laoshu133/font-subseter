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

// eslint-disable-next-line no-control-regex
const rCtrlChars = /\u0000|\u0001|\u0002|\u0003|\u0004|\u0005|\u0006|\u0007|\u0008|\u0009|\u000a|\u000b|\u000c|\u000d|\u000e|\u000f|\u0010|\u0011|\u0012|\u0013|\u0014|\u0015|\u0016|\u0017|\u0018|\u0019|\u001a|\u001b|\u001c|\u001d|\u001e|\u001f|\u007F/g;

const getFontObjectValue = (inp, keys = ['en', 'zh', 'zh-TW', 'zh-tw'], clean = true) => {
    if(typeof inp === 'object') {
        let key = keys.find(k => {
            return !!inp[k];
        });

        if(!key) {
            key = Object.keys(inp)[0];
        }

        inp = inp[key];
    }

    let ret = String(inp || '');

    if(clean) {
        ret = ret.replace(rCtrlChars, '');
    }

    return ret.trim();
};

const fitFloat = (num, precision = 3) => {
    return num.toFixed(precision).replace(/\.0+$/, '');
};

const fontWeightsMap = {
    100: 'ExtraLight',
    200: 'ExtraLight',
    300: 'Light',
    400: 'Regular',
    500: 'Medium',
    600: 'Medium',
    700: 'Bold',
    800: 'Heavy',
    900: 'Heavy'
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
        // Already parsed
        if(buffer.names && buffer.tables) {
            return buffer;
        }

        this.assert(buffer, 'File buffer required');

        return opentype.parse(abTools.bufferToAB(buffer));
    }

    loadInfo(buffer, lang = 'en') {
        const font = this.parseFont(buffer);

        const names = font.names;
        const readKeys = [lang, 'en'];
        const getName = (key = 'fontFamily', defaultVal = '', keys = readKeys) => {
            return getFontObjectValue(names[key], keys) || defaultVal || '';
        };
        const getEnName = (key = '', defaultVal = '') => {
            return getName(key, defaultVal, ['en']);
        };

        const os2 = font.tables.os2 || {};
        const weight = +os2.usWeightClass || 400;
        const fontFamily = getName('fontFamily');

        // fontSubfamily 仅支持英文
        // 优先使用 weight， 自带 fontSubfamily 可能不准
        const fontSubfamily = fontWeightsMap[weight] || getEnName('fontSubfamily', 'Regular');
        const enFullName = getEnName('fullName', getEnName('fontFamily'));

        let fullName = getName('fullName', fontFamily);
        if(enFullName.indexOf(fontSubfamily) < 0) {
            fullName = `${fullName.trim()} ${fontSubfamily}`;
        }

        return {
            fullName,
            fontFamily,
            fontSubfamily,
            postScriptName: getName('postScriptName', fontFamily),
            copyright: getName('copyright'),
            designer: getName('designer'),
            version: getName('version'),
            style: /italic/i.test(`${fullName} ${fontSubfamily}`) ? 'italic' : 'normal',
            weight: +os2.usWeightClass || 400,
            unitsPerEm: font.unitsPerEm,
            descender: font.descender,
            ascender: font.ascender,
            fsType: +os2.fsType || 0,
            fsSelection: +os2.fsSelection || 0,
            tables: font.tables,
            names,
            os2
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
        width = 300,
        lang = 'zh'
    } = {}) {
        const font = this.parseFont(buffer);
        const fontInfo = this.loadInfo(font, lang);
        const textParams = {
            family: fontInfo.fontFamily,
            subFamily: fontInfo.fontSubfamily || 'Regular',
            name: fontInfo.postScriptName,
            fullName: fontInfo.fullName
        };

        const x = Math.floor(fontSize / 4);
        const y = Math.floor((font.ascender / font.unitsPerEm) * fontSize);
        const pathTexts = text ? [text] : [`${textParams.fullName || ''}`, `${textParams.family || ''}`]

        let path = null;
        let pathDataStr = '';
        pathTexts.some(pathText => {
            if(!pathText) return;

            // Limit max length
            const maxLength = 500;
            if(pathText.length > maxLength) {
                pathText = [...pathText].slice(0, maxLength).join('');
            }

            pathText = pathText.trim() || 'Unknow font name';
            path = font.getPath(pathText, x, y, fontSize);
            pathDataStr = String(path.toPathData()).trim();
            return !!pathDataStr;
        })        

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
