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
        lang = 'zh',
        defaultFont
    } = {}) {
        const font = this.parseFont(buffer);
        const fontInfo = this.loadInfo(font, lang);
        const textParams = {
            family: fontInfo.fontFamily,
            subFamily: fontInfo.fontSubfamily || 'Regular',
            name: fontInfo.postScriptName,
            fullName: fontInfo.fullName
        };

        if(!text) {
            // eslint-disable-next-line no-template-curly-in-string
            text = '${fullName}';
        }

        // Assign params
        text = String(text || '').replace(/\$\{([\w]+)\}/g, (a, k) => {
            return textParams[k] || '';
        });

        // Limit max length
        const maxLength = 500;
        if(text.length > maxLength) {
            text = [...text].slice(0, maxLength).join('');
        }

        text = text.trim() || 'Unknow font name';
        // 将文本内容拆分，单独计算字形路径
        const chars = [...text];
        const x = Math.floor(fontSize / 4);
        // const y = Math.floor((font.ascender / font.unitsPerEm) * fontSize);

        const glyphs = chars.map(char => {
            let glyph = font.charToGlyph(char);
            glyph.unitsPerEm = font.unitsPerEm;
            
            if(glyph.name === '.notdef' && defaultFont) {
                glyph = defaultFont.charToGlyph(char);
                glyph.unitsPerEm = defaultFont.unitsPerEm;
            }
            return glyph;
        }).filter(glyph => glyph.name !== '.notdef');

        // 某些情况下无法创建路径 （eg. 新蒂金钟体, 新蒂雪山体）
        if(glyphs.length === 0) {
            throw new Error('Parse path error');
        }

        /**
         * 计算缩略图偏移高度，以第一个字符作为基准
         * step1. 上面先拿个 y 来生成缩略图。
         * step2. 生成完图以后，可以根据 bbox 计算出缩略图所占的高度(contentHeight) 和 目前距离顶部的高度(bbox.y1)。
         * step3. 上下的 gap 高度 = （总高度(height) - 缩略图所占的高度(contentHeight)）/ 2。
         * step4. 最后需要修正高度 offsetY = gap - 目前距离顶部的高度(bbox.y1)。
         * step5. 后续的字符使用相同的偏移高度 offsetY
         */
        let bboxWidth = 0;
        const firstPath = glyphs[0].getPath(0, 0, fontSize);
        const firstBbox = firstPath.getBoundingBox();
        const contentHeight = firstBbox.y2 - firstBbox.y1;
        const gap = (height - contentHeight) / 2;
        const offsetY = -Math.floor(gap - firstBbox.y1);

        const pathDatas = glyphs.map((glyph, i) => {
            const fontScale = 1 / glyph.unitsPerEm * fontSize
            const path = glyph.getPath(0, 0, fontSize);
            const bbox = path.getBoundingBox();
            const leftSideBearing = glyph.leftSideBearing * fontScale;
            const offsets = [
                Math.floor(bbox.x1 - leftSideBearing - bboxWidth),
                offsetY
            ];

            const pathDataStr = String(path.toPathData()).trim();
            const pathData = new PathData(pathDataStr);

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
            // 计算新的 bbox 宽度
            bboxWidth += glyph.advanceWidth * fontScale;
            return pathData;
        });
        
        // Fit viewbox width
        width = Math.ceil(Math.max(width, bboxWidth + x));
        const viewBox = `0 0 ${width} ${height}`;

        const svgPaths = pathDatas.map(pathData => pathData.toString()).join('\n');
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
