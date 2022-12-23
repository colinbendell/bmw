const BMWClientAPI = require('./bmw-api');
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
    .command('vehicles <vin>')
    .description('retrieve all vehicle data. If no VIN is provided, all vehicles are returned.')
    .action(async vin => {
        const bmw = new BMWClientAPI();
        if (vin) {
            console.log(stringify(await bmw.vehicleState(vin).catch(() => {})));
            console.log(stringify(await bmw.vehicleChargeSettings(vin).catch(() => {})));
            console.log(stringify(await bmw.vehicleChargeState(vin).catch(() => {})));
        }
        else {
            console.log(stringify(await bmw.vehicles().catch(() => {})));
        }
    });

program
    .command('lock [vin]')
    .description('Lock the vehicle')
    .action(async vin => {
        const bmw = new BMWClientAPI();
        console.log(stringify(await bmw.lockDoor(vin).catch(e => e)));
    });

program
    .command('unlock [vin]')
    .description('Lock the vehicle')
    .action(async vin => {
        const bmw = new BMWClientAPI();
        console.log(stringify(await bmw.unlockDoor(vin).catch(e => e)));
    });

program
    .command('flash [vin]')
    .description('Flash lights on the vehicle')
    .action(async vin => {
        const bmw = new BMWClientAPI();
        console.log(stringify(await bmw.flashLights(vin).catch(e => e)));
    });

program
    .command('honk [vin]')
    .description('Honk the vehicle horn')
    .action(async vin => {
        const bmw = new BMWClientAPI();
        console.log(stringify(await bmw.honkHorns(vin).catch(e => e)));
    });

program
    .command('condition [vin]')
    .description('Precondition the vehicle')
    .action(async vin => {
        const bmw = new BMWClientAPI();
        console.log(stringify(await bmw.startClimate(vin).catch(e => e)));
    });

program
    .command('charge [vin]')
    .description('Start charging the vehicle')
    .action(async vin => {
        const bmw = new BMWClientAPI();
        console.log(stringify(await bmw.startCharging(vin).catch(e => e)));
    });

program
    .command('stopcharge [vin]')
    .description('Stop charging the vehicle')
    .action(async vin => {
        const bmw = new BMWClientAPI();
        console.log(stringify(await bmw.stopCharging(vin).catch(e => e)));
    });



if (process.argv.indexOf('--debug') === -1) console.debug = () => {};
if (process.argv.indexOf('--verbose') === -1 && process.argv.indexOf('--debug') === -1) console.info = () => {};

// program.parse(process.argv); // end with parse to parse through the input
program.parseAsync();
// if (process.argv.length <= 2) program.help();
