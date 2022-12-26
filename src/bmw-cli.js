const BMWClientAPI = require('./bmw-api');
const BMWClient = require('./bmw');
const {Command} = require('commander');
const {stringify} = require("./stringify");
const program = new Command();

async function login(username, password, options, command) {
    const bmw = new BMWClientAPI(username, password);
    try {
        await bmw.login();
        await bmw.refresh();
        console.log('Success!');
    }
    catch (e) {
        console.error(e);
        console.error('Failed to login');
    }
}

program
    .option('--debug', 'enable debug', false)
    .option('--verbose', 'enable verbose', false);

program
    .command('login [username] [password]')
    .description('Test Authentication')
    .action(login);

program
    .command('flags')
    .description('Report Application Flags enabled on account')
    .action(async () => {
        const bmw = new BMWClientAPI();
        console.log(stringify(await bmw.userFlags().catch(() => {})))
    });

program
    .command('vehicles [vin]')
    .description('retrieve all vehicle data. If no VIN is provided, all vehicles are returned.')
    .action(async vin => {
        const bmw = new BMWClient();
        const res = await bmw.vehicleDetails(vin).catch(() => []);
        console.log(stringify(res.length <= 1 ? res[0] : res));
    });

program
    .command('lock [vin]')
    .description('Lock the vehicle.')
    .action(async vin => {
        const bmw = new BMWClient();
        const res = await bmw.lock(vin).catch(() => []);
        console.log(stringify(res.length <= 1 ? res[0] : res));
    });

program
    .command('unlock [vin]')
    .description('Lock the vehicle')
    .action(async vin => {
        const bmw = new BMWClient();
        const res = await bmw.unlock(vin).catch(() => []);
        console.log(stringify(res.length <= 1 ? res[0] : res));
    });

program
    .command('lights [vin]')
    .description('Flash lights on the vehicle')
    .action(async vin => {
        const bmw = new BMWClient();
        const res = await bmw.flashLights(vin).catch(() => []);
        console.log(stringify(res.length <= 1 ? res[0] : res));
    });

program
    .command('horn [vin]')
    .description('Honk the vehicle horn')
    .action(async vin => {
        const bmw = new BMWClient();
        const res = await bmw.honkHorn(vin).catch(() => []);
        console.log(stringify(res.length <= 1 ? res[0] : res));
    });

program
    .command('climate [vin]')
    .description('Climate (& Precondition) the vehicle')
    .option('--stop', 'Stop charging the vehicle')
    .action(async (vin, options) => {
        const bmw = new BMWClient();
        if (options.stop) {
            const res = await bmw.stopClimate(vin).catch(() => []);
            console.log(stringify(res.length <= 1 ? res[0] : res));
        }
        else {
            const res = await bmw.startClimate(vin).catch(() => []);
            console.log(stringify(res.length <= 1 ? res[0] : res));
        }
    });

program
    .command('charge [vin]')
    .description('Start charging the vehicle (if plugged in)')
    .option('--stop', 'Stop charging the vehicle')
    .action(async (vin, options) => {
        const bmw = new BMWClient();
        if (options.stop) {
            const res = await bmw.stopCharging(vin).catch(() => []);
            console.log(stringify(res.length <= 1 ? res[0] : res));
            }
        else {
            const res = await bmw.startCharging(vin).catch(() => []);
            console.log(stringify(res.length <= 1 ? res[0] : res));

        }
    });

program
    .command('debug')
    .description('debug')
    .action(async () => {
        const bmw = new BMWClientAPI();
        console.log(stringify(await bmw.userFlags().catch(() => {})));
        console.log(stringify(await bmw.vehicles().catch(() => {})));
        console.log(stringify(await bmw.vehicleState('WB523CF09NCK52131').catch(() => {})));
        console.log(stringify(await bmw.vehicleChargeSettings('WB523CF09NCK52131').catch(() => {})));
        console.log(stringify(await bmw.vehicleChargeState('WB523CF09NCK52131').catch(() => {})));
        // console.log(await bmw.vehicleState('WB523CF09NCK52131').catch(() => {}));
        // console.log(await bmw.vehicleDetails('WB523CF09NCK52131').catch(() => {}));
        // console.log(await bmw.remoteCommands().catch(() => {}));
        // console.log(stringify(await bmw.chargingSessions('WB523CF09NCK52131', new Date("2022-09-01T00:00:00Z")).catch(() => {})));
        // console.log(stringify(await bmw.chargingSessions('WB523CF09NCK52131', new Date("2022-09-01T00:00:00Z")).catch(() => {})));
        // console.log(stringify(await bmw.chargingSessions('WB523CF09NCK52131', new Date("2022-10-01T00:00:00Z")).catch(() => {})));
        console.log(stringify(await bmw.chargingSessions('WB523CF09NCK52131', 2022, 11).catch(() => {})));
        console.log(stringify(await bmw.chargingSessions('WB523CF09NCK52131').catch(() => {})));
        console.log(stringify(await bmw.chargingSessionDetails('WB523CF09NCK52131', '2022-12-20T04:59:50Z_5f48b47b').catch(() => {})));
        console.log(stringify(await bmw.tripSessions('WB523CF09NCK52131').catch(() => {})));
        console.log(stringify(await bmw.tripSessionsHistory('WB523CF09NCK52131', 2022, 12).catch(() => {})));
        console.log(stringify(await bmw.tripSessionsStatistics('WB523CF09NCK52131', 2022, 12).catch(() => {})));
        // console.log(stringify(await bmw.chargingStatistics('WB523CF09NCK52131', new Date("2022-11-01T00:00:00Z")).catch(() => {})));    });
    });

if (process.argv.indexOf('--debug') === -1) console.debug = () => {};
if (process.argv.indexOf('--verbose') === -1 && process.argv.indexOf('--debug') === -1) console.info = () => {};

// program.parse(process.argv); // end with parse to parse through the input
program.parseAsync();
// if (process.argv.length <= 2) program.help();
