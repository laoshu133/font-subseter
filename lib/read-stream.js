module.exports = stream => {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let len = 0;

        stream.on('error', err => {
            reject(err);
        });

        stream.on('data', chunk => {
            len += chunk.length;

            chunks.push(chunk);
        });

        stream.on('end', () => {
            const buf = Buffer.concat(chunks, len);

            resolve(buf);
        });
    });
};
