/**
 * engines/fonttools
 *
 * 支持效果较好，推荐使用，仅支持 Node.js 环境，需要 Python 依赖
 *
 */

const path = require('path');
const execa = require('execa');
const fsp = require('fs-extra');
const tempfile = require('tempfile');
const opentype = require('opentype.js');
const nodeBufferToArrayBuffer = require('../node-buffer-to-array-buffer');

const getFontToolsPath = (moduleName = '.') => {
    if(!getFontToolsPath.promise) {
        const cmd = 'python3';
        const args = ['lib/engines/fonttools/get-path.py'];

        getFontToolsPath.promise = execa(cmd, args)
        .then(({ stdout }) => {
            return path.dirname(stdout.trim());
        });
    }

    return getFontToolsPath.promise
    .then(basePath => {
        return path.join(basePath, moduleName);
    });
};

const runPy = (cmd = '', args = [], inputFiles = {}) => {
    const tmpFiles = [];
    const rBlock = /\{\{(\w+)\}\}/g;

    let outputFile = null;

    args = args.map(str => {
        return str.replace(rBlock, (rawStr, key) => {
            const file = {
                content: inputFiles[key],
                path: tempfile(),
                key
            };

            if(key === 'outputFile') {
                outputFile = file;

                return file.path;
            }

            if(inputFiles[key]) {
                tmpFiles.push(file);

                return file.path;
            }

            return rawStr;
        });
    });

    return tmpFiles.reduce((ret, file) => {
        return ret.then(() => {
            if(file.content == null) {
                return;
            }

            return fsp.writeFile(file.path, file.content);
        });
    }, Promise.resolve())
    .then(() => {
        return execa(cmd, args);
    })
    .then(() => {
        if(outputFile) {
            return fsp.readFile(outputFile.path);
        }
    })
    .finally(() => {
        // Clear
        const clearPromises = tmpFiles.map(file => {
            return fsp.unlink(file.path);
        });

        return Promise.all(clearPromises)
        .catch(err => {
            console.warn('[FontSubseter]', err.message);

            // if(!ignoreError) {
            //     throw err;
            // }
        });
    });
};

const covertCFFToTruetype = buf => {
    return runPy('python3', [
        'lib/engines/fonttools/otf2ttf.py',
        '--output={{outputFile}}',
        // '--keep-direction',
        '--overwrite',
        '{{inputFile}}'
    ], {
        inputFile: buf
    });
};

module.exports = (buffer, chars = [], options = {
    forceTruetype: false
}) => {
    const forceTruetype = options && options.forceTruetype;

    // pyftsubset
    return runPy('python3', [
        '/usr/local/lib/python3.7/site-packages/fontTools/subset',
        '{{inputFile}}',
        '--output-file={{outputFile}}',
        '--text-file={{charsFile}}',
        '--verbose'
    ], {
        inputFile: buffer,
        charsFile: chars.join('')
    })
    .then(buf => {
        if(!forceTruetype) {
            return buf;
        }

        const font = opentype.parse(nodeBufferToArrayBuffer(buf));
        if(font.outlinesFormat !== 'cff') {
            return buf;
        }

        return covertCFFToTruetype(buf);
    })
    .then(buf => {
        buf.type = 'font/truetype';

        return buf;
    })
    .catch(err => {
        throw err;
    });
};
