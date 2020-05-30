const opentype = require('opentype.js');
const bodyParser = require('body-parser');
const Bundler = require('parcel-bundler');
const uploader = require('multer')();
const app = require('express')();
const axios = require('axios');
const path = require('path');
const fs = require('fs');

const FontSubseter = require('../index');

const port = 1234;
const bundler = new Bundler('./examples/index.html', {
    publicUrl: '/examples/'
});

const getFileByReq = async req => {
    const file = req.file ? req.file.buffer : null;
    const url = req.body.url || '';

    if(!file && !url) {
        throw new Error('url or file required');
    }

    if(file) {
        return file;
    }

    return axios.get(url, {
        responseType: 'arraybuffer'
    })
    .then(res => {
        return res.data;
    });
};

const sendError = (res, err, logPrefix = 'Dev error:') => {
    console.error(logPrefix, err);

    const status = err.status || 500;
    const body = JSON.stringify({
        stack: err.stack.split('\n'),
        message: err.message,
        status
    });

    res.status(status);
    res.send(body);
};

const fontDir = 'fonts';
const fontCacheFile = '.fonts.json';
app.get('/' + fontDir, (req, res) => {
    const stats = fs.statSync(fontDir);
    const cacheStats = fs.existsSync(fontCacheFile) && fs.statSync(fontCacheFile);
    if(cacheStats && cacheStats.mtime >= stats.mtime) {
        const buf = fs.readFileSync(fontCacheFile);
        const fonts = JSON.parse(buf);

        res.send(fonts);
        return;
    }

    const rSupportFont = /\.(?:otf|ttf)$/i;
    const fonts = fs.readdirSync(fontDir).filter(name => {
        return rSupportFont.test(name);
    })
    .map(name => {
        const fontPath = `${fontDir}/${name}`;
        const font = opentype.loadSync(fontPath);
        const names = font.names;

        return {
            url: `${req.protocol}://${req.hostname}/${fontPath}`,
            names
        };
    });

    fs.writeFileSync(fontCacheFile, JSON.stringify(fonts));
    res.send(fonts);
});

app.get(`/${fontDir}/*`, (req, res) => {
    const filePath = path.resolve('./' + req.path);

    res.sendFile(filePath, {
        maxAge: 10 * 60 * 1000
    });
});

app.post('/subset', bodyParser.json({ type: 'application/json' }), uploader.single('file'), (req, res) => {
    const forceTruetype = req.body.forceTruetype === 'true';
    const type = req.body.type || 'ttf';
    const text = req.body.text || 'ABCDX';

    // Clear params
    let engine = req.body.engine || 'opentype';
    engine = engine.replace(/\.js$/i, '').replace(/[^\w-]/g, '');

    const subseter = new FontSubseter({
        engine: require('../lib/engines/' + engine)
    });

    return getFileByReq(req)
    .then(file => {
        return subseter.subset(file, text, {
            forceTruetype
        });
    })
    .then(buf => {
        if(type === 'woff') {
            buf = subseter.covertToWoff(buf);
        }

        const defaultMime = 'application/octet-stream';
        res.setHeader('Content-Type', buf.type || defaultMime);

        res.send(buf);
    })
    .catch(err => {
        sendError(res, err, 'Subset error:');
    });
});

app.post('/thumbnail', bodyParser.json({ type: 'application/json' }), uploader.single('file'), (req, res) => {
    const text = req.body.text || '';

    const subseter = new FontSubseter();

    return getFileByReq(req)
    .then(file => {
        return subseter.makeThumbnail(file, text);
    })
    .then(ret => {
        res.send(ret);
    })
    .catch(err => {
        sendError(res, err, 'MakeThumbnail error:');
    });
});

app.use(bundler.middleware());

app.listen(port);

bundler.once('bundled', () => {
    console.log(`Server running at http://localhost:${port}`);
});
