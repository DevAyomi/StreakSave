const { bech32 } = require('bech32');

function injToEth(injAddr) {
    if (!injAddr || !injAddr.startsWith('inj1')) return injAddr;
    try {
        const decoded = bech32.decode(injAddr);
        const data = bech32.fromWords(decoded.words);
        return '0x' + Buffer.from(data).toString('hex');
    } catch (e) {
        console.error("Address conversion error:", e);
        return injAddr;
    }
}

module.exports = { injToEth };
