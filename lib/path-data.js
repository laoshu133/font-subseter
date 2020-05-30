const SvgPath = require('./svg-path');

class PathData {
    constructor(data = '') {
        const rItem = /([a-z])([-.\d\s]+)?/ig;
        const paths = this.paths = [];
        const len = data.length;

        if(!len) {
            return;
        }

        let path = new SvgPath();

        paths.push(path);

        data = data.replace(rItem, (a, action, argsStr) => {
            argsStr = String(argsStr || '').trim();

            let args = [];
            if(argsStr) {
                argsStr = argsStr.replace(/(\d)(-)/g, '$1 $2');

                args = argsStr.split(/\s+/).map(s => {
                    return parseFloat(s) || 0;
                });
            }

            path.actions.push({
                name: action,
                args
            });

            // 考虑分割路径
            // if(/Z/.test(action) && idx < len - a.length) {
            //     path = new SvgPath();

            //     paths.push(path);
            // }
        });
    }

    forEach(fn) {
        this.paths.forEach(fn);
    }

    toString() {
        return this.paths.map(path => {
            return path.toString();
        })
        .join('');
    }
}

module.exports = PathData;
