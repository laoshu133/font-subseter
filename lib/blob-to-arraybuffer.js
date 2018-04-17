/**
 * blob-to-arraybuffer
 */

const blobToArrayBuffer = blob => {
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

module.exports = blobToArrayBuffer;
