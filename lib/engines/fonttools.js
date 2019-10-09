/**
 * engines/fonttools
 *
 * 支持效果较好，推荐使用，仅支持 Node.js 环境，需要 Python 依赖
 *
 */

const execa = require('execa');
const fsp = require('fs-extra');
const tempfile = require('tempfile');

module.exports = (buffer, chars = []) => {
    const inputFile = tempfile();
    const charsFile = tempfile('.txt');
    const outputFile = tempfile('.ttf');
    const clear = () => {
        return Promise.all([
            fsp.unlink(outputFile),
            fsp.unlink(charsFile),
            fsp.unlink(inputFile)
        ]);
    };

    return Promise.all([
        fsp.writeFile(charsFile, chars.join('')),
        fsp.writeFile(inputFile, buffer)
    ])
    .then(() => {
        return execa('pyftsubset', [
            inputFile,
            `--output-file=${outputFile}`,
            `--text-file=${charsFile}`,
            '--verbose'
        ]);
    })
    .then(() => {
        return fsp.readFile(outputFile);
    })
    .then(buf => {
        return clear()
        .then(() => {
            buf.type = 'font/truetype';

            return buf;
        });
    })
    .catch(err => {
        return clear()
        .then(() => {
            throw err;
        });
    });
};
