const opentype = require('opentype.js');
const Bundler = require('parcel-bundler');
const app = require('express')();
const path = require('path');
const fs = require('fs');

const port = 1234;
const bundler = new Bundler('./examples/index.html', {
    publicUrl: '/examples/'
});

const fontDir = 'fonts';
app.get('/' + fontDir, (req, res) => {
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

    res.send(fonts);
});

app.get(`/${fontDir}/*`, (req, res) => {
    const filePath = path.resolve('./' + req.path);

    res.sendFile(filePath);
});

app.use(bundler.middleware());

app.listen(port);

bundler.once('bundled', () => {
    console.log(`Server running at http://localhost:${port}`);
});
