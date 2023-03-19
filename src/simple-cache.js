//const fs = require('fs');
const fs = require('fs/promises');

class SimpleCache {
    #cacheFile = null;
    #cache = {};
    constructor(name = "simplecache") {
        this.cacheFile = `${process.env.SIMPLECACHE_DIR ?? "."}/.${name}.cache.json`;
        this.cache = {};
        try {
            const data = require('fs').readFileSync(this.cacheFile, 'utf8');
            this.cache = JSON.parse(data);
        }
        catch {
            // noop
        }
    }

    get(key) {
        if ((this.cache[key]?.expires ?? 0) > Date.now()) {
            delete this.cache[key];
            return undefined;
        }
        return this.cache[key]?.value;
    }

    set(key, value, expires) {
        expires = Date.parse(expires) || Date.now();
        this.cache[key] = {value, expires};
        setTimeout(async () => {
            try {
                await fs.writeFile(this.cacheFile, JSON.stringify(this.cache));
            }
            catch {
                // noop
            }
        },0);
    }

    has(key) {
        return this.cache[key] !== undefined;
    }

    delete(key) {
        delete this.cache[key];
    }
}

module.exports = {SimpleCache};