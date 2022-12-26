const BMWClientAPI = require('./bmw-api');
const BMWClient = require('./bmw');
const {Command} = require('commander');
const {stringify} = require("./stringify");
const program = new Command();

function bmwClient() {
    return new BMWClient(program.opts().email, program.opts().password, program.opts().geo);
}

program
    .name('bmw')
    .option('--debug', 'enable debug', false)
    .option('--verbose', 'enable verbose', false)
    .option('--email <username>', 'MyBMW login email. For stronger security set the BMW_EMAIL environment variable or edit the ~/.bmw config.')
    .option('--password <password>', 'MyBMW password. For stronger security set the BMW_PASSWORD environment variable or edit the ~/.bmw config.')
    .option('--geo <geo>', 'The GEO your MyBMW account is associated (na, cn, or row). Also can be set with BMW_GEO env. variable or in ~/.bmw config')
    .hook('preAction', (thisCommand, actionCommand) => {
        if (thisCommand.opts().debug) {
            //nothing
        }
        else if (thisCommand.opts().verbose) {
            console.debug = () => {};
        }
        else {
            console.debug = () => {};
            console.info = () => {}
        }
        console.debug(`About to call action handler for subcommand: ${actionCommand.name()}`);
        console.debug('Program options: %o', thisCommand.opts());
        console.debug('arguments: %O', actionCommand.args);
        console.debug('options: %o', actionCommand.opts());
      });

program
    .command('login')
    .description('Test Authentication')
    .action(async (options, command) => {
        const bmw = bmwClient();
        try {
            await bmw.login();
            console.log('Success!');
        }
        catch (e) {
            console.error(e);
            console.error('Failed to login');
        }
    });

program
    .command('flags')
    .option('--csv', 'output as CSV')
    .option('--raw', 'output as raw JSON')
    .description('Report Application Flags enabled on account')
    .action(async options => {
        const bmw = bmwClient();
        const res = await bmw.userFlags().catch(() => [])
        if (options.raw) {
            console.log(stringify(res));
        }
        else {
            for (const flag of res.flags) {
                if (options.csv) {
                    console.log(`${flag.flagId},${flag.isActive}`);
                }
                else {
                    console.log(`${flag.flagId} - ${flag.isActive ? '✅' : '❌'}`);
                }
            }
        }
    });

program
    .command('list')
    .description('retrieve all vehicle data. If no VIN is provided, all vehicles are returned.')
    .option('--raw', 'list all vehicles')
    .action(async options => {
        const bmw = bmwClient();
        const res = await bmw.vehicles().catch(() => []);
        if (options.raw) {
            console.log(stringify(res));
        }
        for (const vehicle of res) {
            console.log(`${vehicle.attributes?.model} ${vehicle.attributes?.year} (${vehicle.vin})`);
        }
    });
program
    .command('status [vin]')
    .description('retrieve all vehicle data. If no VIN is provided, all vehicles are returned.')
    .option('--raw', 'list all vehicles')
    .action(async (vin, options) => {
        const bmw = bmwClient();
        const res = await bmw.vehicleDetails(vin).catch(() => []);
        if (options.raw) {
            console.log(stringify(res.length <= 1 ? res[0] : res));
        }
        for (const vehicle of res) {
            console.log(`${vehicle.attributes?.model} ${vehicle.attributes?.year} (${vehicle.vin}):`);
            console.log(`├ 📍Location: ${vehicle.state?.location?.address?.formatted}`);
            if (vehicle.state?.climateControlState?.activity !== 'INACTIVE')
                console.log(`├ 🌡️Climate: ${vehicle.state?.climateControlState?.activity}`);
            console.log(`└ 🔋Battery: ${vehicle.state?.electricChargingState?.chargingLevelPercent}% (${vehicle.state?.range} km) ${vehicle.state?.electricChargingState?.chargingStatus === "CHARGING" ? "[Charging ⚡️] " : vehicle.state?.electricChargingState?.isChargerConnected ? "[Plugged in 🔌]" : ""}`);
        }

    });

program
    .command('lock [vin]')
    .description('Lock the vehicle.')
    .action(async vin => {
        const bmw = bmwClient();
        const res = await bmw.lock(vin).catch(() => []);
        for (const vehicle of res) {
            if (vehicle?.event?.status?.eventStatus === 'ERROR') {
                console.log("Error: ", vehicle.event.status.errorDetails.title);
                console.log(vehicle.event.status.errorDetails.description);
                return;
            }
            if (vehicle.event && vehicle.event?.status?.eventStatus !== 'EXECUTED') {
                console.log(`Error: ${vehicle.event.status.eventStatus}`);
                return;
            }
        }
        console.log("Success.");
    });

program
    .command('unlock [vin]')
    .description('Lock the vehicle')
    .action(async vin => {
        const bmw = bmwClient();
        const res = await bmw.unlock(vin).catch(() => []);
        for (const vehicle of res) {
            if (vehicle?.event?.status?.eventStatus === 'ERROR') {
                console.log("Error: ", vehicle.event.status.errorDetails.title);
                console.log(vehicle.event.status.errorDetails.description);
                return;
            }
            if (vehicle.event && vehicle.event?.status?.eventStatus !== 'EXECUTED') {
                console.log(`Error: ${vehicle.event.status.eventStatus}`);
                return;
            }
        }
        console.log("Success.");
    });

program
    .command('lights [vin]')
    .description('Flash lights on the vehicle')
    .action(async vin => {
        const bmw = bmwClient();
        const res = await bmw.flashLights(vin).catch(() => []);
        for (const vehicle of res) {
            if (vehicle?.event?.status?.eventStatus === 'ERROR') {
                console.log("Error: ", vehicle.event.status.errorDetails.title);
                console.log(vehicle.event.status.errorDetails.description);
                return;
            }
            if (vehicle.event && vehicle.event?.status?.eventStatus !== 'EXECUTED') {
                console.log(`Error: ${vehicle.event.status.eventStatus}`);
                return;
            }
        }
        console.log("Success.");
    });

program
    .command('horn [vin]')
    .description('Honk the vehicle horn')
    .action(async vin => {
        const bmw = bmwClient();
        const res = await bmw.honkHorn(vin).catch(() => []);
        for (const vehicle of res) {
            if (vehicle?.event?.status?.eventStatus === 'ERROR') {
                console.log("Error: ", vehicle.event.status.errorDetails.title);
                console.log(vehicle.event.status.errorDetails.description);
                return;
            }
            if (vehicle.event && vehicle.event?.status?.eventStatus !== 'EXECUTED') {
                console.log(`Error: ${vehicle.event.status.eventStatus}`);
                return;
            }
        }
        console.log("Success.");
    });

program
    .command('climate [vin]')
    .description('Climate (& Precondition) the vehicle')
    .action(async vin => {
        const bmw = bmwClient();
        const res = await bmw.startClimate(vin).catch(() => []);
        console.log(stringify(res.length <= 1 ? res[0] : res));
    })
    .addCommand(
        new Command('start')
        .argument('[vin]', 'VIN of the vehicle (can also be the model name)')
        .action(async vin => {
            const bmw = bmwClient();
            const res = await bmw.startClimate(vin).catch(() => []);
            console.log(stringify(res.length <= 1 ? res[0] : res));
        })
    )
    .addCommand(
        new Command('stop')
        .argument('[vin]', 'VIN of the vehicle (can also be the model name)')
        .action(async vin => {
            const bmw = bmwClient();
            const res = await bmw.stopClimate(vin).catch(() => []);
            console.log(stringify(res.length <= 1 ? res[0] : res));
        })
    );

program
    .command('charge')
    .argument('[vin]', 'VIN of the vehicle (can also be the model name)')
    .description('Start charging the vehicle (if plugged in)')
    .action(async vin => {
        const bmw = bmwClient();
        const res = await bmw.startCharging(vin).catch(() => []);
        console.log(stringify(res.length <= 1 ? res[0] : res));
    })
    .addCommand(
        new Command('start')
        .argument('[vin]', 'VIN of the vehicle (can also be the model name)')
        .action(async vin => {
            const bmw = bmwClient();
            const res = await bmw.startCharging(vin).catch(() => []);
            console.log(stringify(res.length <= 1 ? res[0] : res));
        })
    )
    .addCommand(
        new Command('stop')
        .argument('[vin]', 'VIN of the vehicle (can also be the model name)')
        .action(async vin => {
            const bmw = bmwClient();
            const res = await bmw.stopCharging(vin).catch(() => []);
            console.log(stringify(res.length <= 1 ? res[0] : res));
        })
    );


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

program.parseAsync();
