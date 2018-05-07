/**
 * engines/fontkit
 *
 * 对 TTF 支持较好，不推荐使用，仅支持 Node.js 环境
 *
 *
 * @know issues:
 *
 * - 不支持 otf 字体
 * - 中文字体名支持不好
 *
 */

const Fontmin = require('fontmin');

module.exports = (buffer, chars = []) => {
    const fontmin = new Fontmin();

    fontmin.use(Fontmin.glyph({
        text: chars.join('')
    }))
    // .use(Fontmin.ttf2woff({
    //     // deflate woff. default = false
    //     deflate: true
    // }))
    .src([buffer]);

    return new Promise((resolve, reject) => {
        fontmin.run((err, files) => {
            if(err) {
                reject(err);

                return;
            }

            resolve(files[0]);
        });
    })
    .then(buf => {
        buf.type = 'font/truetype';

        return buf;
    });
};
