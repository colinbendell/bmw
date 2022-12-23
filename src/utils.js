const crypto = require("crypto");

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const generate = length => crypto.randomBytes(Math.round(length/2) + 1).toString("hex").substring(0, length);
const sha256Base64 = data => crypto.createHash('sha256').update(data).digest('base64url').replace(/=*$/g, '');

const uuid4 = () => crypto.randomBytes(16).toString("hex").toUpperCase().replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5");
const fahrenheitToCelsius = temperature => Math.round((temperature - 32) / 1.8 * 10) / 10;
const celsiusToFahrenheit = temperature => Math.round((temperature * 1.8) + 32);

module.exports = {
    sleep,
    uuid4,
    fahrenheitToCelsius,
    celsiusToFahrenheit,
    generate,
    sha256Base64,
};
