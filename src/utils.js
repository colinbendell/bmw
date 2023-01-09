const crypto = require("crypto");

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const generate = length => crypto.randomBytes(Math.round(length/2) + 1).toString("hex").substring(0, length);
const sha256Base64 = data => crypto.createHash('sha256').update(data).digest('base64url').replace(/=*$/g, '');

const uuid4 = () => crypto.randomBytes(16).toString("hex").toUpperCase().replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5");
const fahrenheitToCelsius = temperature => Math.round((temperature - 32) / 1.8 * 10) / 10;
const celsiusToFahrenheit = temperature => Math.round((temperature * 1.8) + 32);

const sum = function(...values) {
    return values.reduce((a, b) => a + (Number.parseInt(b) || 0), 0);
}

const parseRelativeDate = function(v, timezoneOffset = 0) {
    if (!v) return null;

    const now = new Date();
    const dateParseRegex = /(?:(?<month>\d{1,2})\/(?<day>\d{1,2})\/(?<year>\d{4})|(?<week>[a-zA-Z]+)) (?<hour>\d+):(?<minute>\d+)(?<am> am)?(?<pm> PM)?/i;
    let { groups: { year,month,day,week,hour,minute,am,pm} } = dateParseRegex.exec(v.toUpperCase());

    if (pm && parseInt(hour) < 12) hour = parseInt(hour) + 12;
    if (am && parseInt(hour) === 12) hour = 0;
    now.setUTCHours(hour, minute, 0, 0);

    if (week) {
        const daysOfWeek = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
        if (week === 'TODAY') {
        }
        else if (week === 'YESTERDAY') {
            now.setUTCDate(now.getUTCDate() - 1);
        }
        else if (daysOfWeek.indexOf(week) >= 0) {
            daysOfWeek.unshift(...daysOfWeek.slice(new Date().getDay()+1))
            now.setUTCDate(now.getUTCDate() - (7-daysOfWeek.indexOf(week)));
        }
    }
    else {
        now.setUTCFullYear(year, month -1, day);
    }

    return new Date(now.getTime() + (timezoneOffset*60*60*1000)).toISOString();
}

const formatNumber = function(value, unit = '', round = true) {
    if (value === undefined) {
        return 'N/A';
    }
    value = Number(value);

    // has fraction digits
    if (!Number.isInteger(value) && round) {
        if (value < 100) {
            // console.log(typeof value)
            // console.log(value, value?.toPrecision(2));
            value = value.toPrecision(2);
        }
        else {
            value = Math.round(value);
        }
    }

    if (unit && unit !== '%') unit = ' ' + unit;
    return `${new Intl.NumberFormat().format(value)}${unit}`;
}

const formatMinutes = function(minutes) {
    if (minutes === undefined) {
        return 'N/A';
    }
    let duration = Math.floor(minutes/24/60) + "d ";
    duration += Math.floor(minutes/60%24) + "h ";
    duration += Math.floor(minutes%60) + "min";
    duration = duration.replaceAll(/\b(0[dh] )*/g, "");
    return duration;
}

module.exports = {
    sleep,
    uuid4,
    fahrenheitToCelsius,
    celsiusToFahrenheit,
    generate,
    sha256Base64,
    sum,
    parseRelativeDate,
    formatNumber,
    formatMinutes,
};
