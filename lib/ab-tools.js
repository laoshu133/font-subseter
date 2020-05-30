const bufferEnabled = typeof Buffer !== 'undefined';
const nodeBuffer = {
    enable: bufferEnabled,
    isBuffer(buf) {
        return bufferEnabled ? Buffer.isBuffer(buf) : false;
    }
};

const blobToAB = blob => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => {
            resolve(reader.result);
        };

        reader.onerror = () => {
            reject(new Error('Blob read error'));
        };

        reader.readAsArrayBuffer(blob);
    });
};

const bufferToAB = buffer => {
    if(!nodeBuffer.isBuffer(buffer)) {
        return buffer;
    }

    const ab = new ArrayBuffer(buffer.length);
    const view = new Uint8Array(ab);
    for (let i = 0; i < buffer.length; ++i) {
        view[i] = buffer[i];
    }

    return ab;
};

const abToBuffer = ab => {
    const buffer = new Buffer(ab.byteLength);
    const view = new Uint8Array(ab);

    for(let i = buffer.length - 1; i >= 0; --i) {
        buffer[i] = view[i];
    }

    return buffer;
};

module.exports = {
    bufferEnabled,
    blobToAB,
    bufferToAB,
    abToBuffer,
    abToBufferIfNeed(ab) {
        if(!nodeBuffer.enable) {
            return ab;
        }

        return abToBuffer(ab);
    }
};
