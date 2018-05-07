const opentype = require('opentype.js');
const Bundler = require('parcel-bundler');
const uploader = require('multer')();
const app = require('express')();
const path = require('path');
const fs = require('fs');

const FontSubseter = require('../index');

const port = 1234;
const bundler = new Bundler('./examples/index.html', {
    publicUrl: '/examples/'
});

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
            url: fontPath,
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

app.post('/subseter', uploader.single('file'), (req, res) => {
    const engine = req.body.engine || 'opentype';
    const text = req.body.text || 'ABCDX';
    const subseter = new FontSubseter({
        engine: require('../lib/engines/' + engine.replace(/[^\w-]/g, ''))
    });

    subseter.subset(req.file.buffer, text)
    .then(buf => {
        const defaultMime = 'application/octet-stream';

        res.setHeader('Content-Type', buf.type || defaultMime);

        res.send(buf);
    })
    .catch(err => {
        console.error(err);

        res.status(err.status || 500).send(err);
    });
});

app.use(bundler.middleware());

app.listen(port);

bundler.once('bundled', () => {
    console.log(`Server running at http://localhost:${port}`);
});
