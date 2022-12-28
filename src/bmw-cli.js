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
            const updatedDate = Date.parse(vehicle.state?.lastUpdateDate);
            const chargeState = vehicle.state?.electricChargingState;
            console.log(`${vehicle.attributes?.model} ${vehicle.attributes?.year} (${vehicle.vin}):`);
            console.log(`├ 🏁 Odometer: ${new Intl.NumberFormat().format(vehicle.state?.currentMileage)} km`);
            const software = vehicle.attributes?.softwareVersionCurrent;
            console.log(`├ 🔧 iDrive${vehicle.attributes?.hmiVersion?.replace('ID', '')}: ${software.puStep?.month}/20${software.puStep?.year}.${String(software.iStep).replace(/.*(..)$/, '$1')}`);
            console.log(`├ 📍 Location: ${vehicle.state?.location?.address?.formatted}`);
            console.log(`├ 🚪 Doors: ${vehicle.state?.doorsState?.combinedSecurityState === 'SECURED' ? '🔒 Locked' : '🔓 Unlocked'}${vehicle.state?.doorsState?.combinedState === 'CLOSED' ? '' : ' & Open'}`);
            console.log(`├ 🪟  Windows: ${vehicle.state?.windowsState?.combinedState === 'CLOSED' ? 'Closed' : 'Open'}`);

            if (vehicle.state?.climateControlState?.activity === 'ACTIVE') {
                console.log(`├ ☀️ Climate: ${vehicle.state?.climateControlState?.activity}`);
            }
            if (vehicle.state?.isDeepSleepModeActive === true) {
                console.log(`├ 💤 Deep Sleep: Enabled`);
            }

            const chargeComplete = new Date(updatedDate + (vehicle.state?.electricChargingState?.remainingChargingMinutes * 60 * 1000 ?? 0));
            const chargingStatus = chargeState?.chargingStatus === "CHARGING" ? `[Charging ⚡️, ${chargeState.chargingTarget}% @ ${chargeComplete.toLocaleTimeString().replace(/:\d\d\b/g, '')}]` : chargeState?.isChargerConnected ? "[Plugged in 🔌]" : "";
            console.log(`└ 🔋 Battery: ${chargeState?.chargingLevelPercent}% (${vehicle.state?.range} km) ${chargingStatus}`);
        }

    });

program
    .command('info [vin]')
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
            const capabilities = new Map(Object.entries(vehicle.capabilities));
            for (const key of [...capabilities.keys()].sort()) {
                let value = capabilities.get(key);

                if (value === 'NOT_SUPPORTED') value = false;
                if (value?.state == 'ACTIVATED') value = true;

                if (["remoteChargingCommands", "vehicleStateSource", "lastStateCallState"].includes(key)) continue;

                console.log(`├  ${key}: ${typeof value  === 'boolean' ? (value ? '✅' : '❌') : stringify(value)}`);
            }
            // console.log(`└ 🔋 Battery: ${chargeState?.chargingLevelPercent}% (${vehicle.state?.range} km) ${chargingStatus}`);
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
        .description('Start charging the vehicle (if plugged in)')
        .action(async vin => {
            const bmw = bmwClient();
            const res = await bmw.startCharging(vin).catch(() => []);
            console.log(stringify(res.length <= 1 ? res[0] : res));
        })
    )
    .addCommand(
        new Command('stop')
        .argument('[vin]', 'VIN of the vehicle (can also be the model name)')
        .description('Stop charging if currently charging')
        .action(async vin => {
            const bmw = bmwClient();
            const res = await bmw.stopCharging(vin).catch(() => []);
            console.log(stringify(res.length <= 1 ? res[0] : res));
        })
    )
    .addCommand(
        new Command('unlock')
        .argument('[vin]', 'VIN of the vehicle (can also be the model name)')
        .description('Unlock the Stop charging if currently charging')
        .action(async vin => {
            const bmw = bmwClient();
            const res = await bmw.stopCharging(vin).catch(() => []);
            console.log(stringify(res.length <= 1 ? res[0] : res));
        })
    );

program
    .command('trips [vin]')
    .description('Trip history')
    .option('--raw', 'raw json output')
    .option('--long', 'detailed trip data including addresses')
    .action(async (vin, options) => {
        const bmw = bmwClient();
        const res = await bmw.tripHistory(vin, new Date('2022-11-01T01:00:00Z')).catch(e => {console.error(e); return []});
        if (options.raw) {
            console.log(stringify(res.length <= 1 ? res[0] : res));
        }
        for (const vehicle of res) {
            console.log(`${vehicle.attributes?.model} ${vehicle.attributes?.year} (${vehicle.vin}):`);
            const distanceUnit = vehicle.trips.totalDistanceUnit;
            let consumptionUnit;;
            for (const day of vehicle.trips.days.sort((a, b) => Date.parse(a.date) - Date.parse(b.date))) {
                if (day.totalDistance > 0) {
                    consumptionUnit = consumptionUnit || day.totalElectricConsumptionUnit;
                    const efficiency = Math.round((day.totalElectricConsumption / day.electricDistance)*100 *10)/10;
                    const avgSpeed = Math.round((day.totalDistance / day.duration)*10)/10;
                    const duration = new Date(day.duration*1000*60*60).toISOString().substring(11, 16).replace(":", "h ").replace(/00h |\b0+/g, "") + "m";
                    console.log(`├ ${day.date} (${duration}): ${day.totalDistance}${distanceUnit}, ${day.totalElectricConsumption}${consumptionUnit} (${efficiency}${consumptionUnit}/100${distanceUnit}, ${avgSpeed}${distanceUnit}/h)`);
                    if (options.long) {
                        let tripCount = 0;
                        for (trip of day.trips.sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime))) {
                            const tripDur = new Date(day.duration*1000*60*60).toISOString().substring(11, 16).replace(":", "h ").replace(/00h |\b0+/g, "") + "m";
                            const localTime = new Date(trip.startTime).toLocaleTimeString("en-gb").replace(/(\d+:\d+):\d+/, "$1");
                            const prefix = tripCount++ === day.trips.length - 1 ? "└" : "├";
                            console.log(`├ ${prefix} ${localTime} (${tripDur}): ${trip.addressName}`);
                        }
                    }
                }
            }
            const efficiency = Math.round((vehicle.trips.totalElectricConsumption / vehicle.trips.electricDistance)*100 *10)/10;
            const avgSpeed = Math.round((vehicle.trips.totalDistance / vehicle.trips.duration)*10)/10;
            const duration = new Date(vehicle.trips.duration*1000*60*60).toISOString().substring(11, 16).replace(":", "h ").replace(/00h |\b0+/g, "") + "m";
            console.log(`└ Total (${duration}): ${vehicle.trips.totalDistance}${distanceUnit}, ${vehicle.trips.totalElectricConsumption}${consumptionUnit} (${efficiency}${consumptionUnit}/100${distanceUnit}, ${avgSpeed}${distanceUnit}/h)`);
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

program.parseAsync();
