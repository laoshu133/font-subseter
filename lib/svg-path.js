class SvgPath {
    constructor() {
        this.actions = [];
    }

    toString() {
        const dataStr = this.actions.reduce((ret, action) => {
            return ret + `${action.name}${action.args.join(' ')}`;
        }, '');

        return `<path d="${dataStr}" />`;
    }
}

module.exports = SvgPath;
