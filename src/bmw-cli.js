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
    .option('--start <start>', 'Start Date')
    .option('--end <end>', 'End Date')
    .option('--long', 'detailed trip data including addresses')
    .option('--raw', 'raw json output')
    // .option('--csv', 'raw csv output') // TODO
    .action(async (vin, options) => {
        if (!Date.parse(options.start)) options.start = new Date();
        if (!Date.parse(options.end)) options.end = new Date();

        const bmw = bmwClient();
        const res = await bmw.tripHistory(vin, start, end).catch(e => {console.error(e); return []});
        if (options.raw) {
            console.log(stringify(res.length <= 1 ? res[0] : res));
        }
        else {
            for (const vehicle of res) {
                console.log(`${vehicle.attributes?.model} ${vehicle.attributes?.year} (${vehicle.vin}):`);
                const distanceUnit = vehicle.trips.totalDistanceUnit;
                let consumptionUnit;;
                for (const day of vehicle.trips.days.sort((a, b) => Date.parse(a.date) - Date.parse(b.date))) {
                    if (day.totalDistance > 0) {
                        consumptionUnit = consumptionUnit || day.totalElectricConsumptionUnit;
                        const avgSpeed = Math.round(day.averageSpeed*10)/10;
                        let duration = Math.floor(day.totalHours/24) + "d " +  Math.floor(day.totalHours%24) + "h " + Math.floor(day.totalHours*60%60) + "min";
                        duration = duration.replaceAll(/\b(0[dh] )*/g, "");
                        const distance = Math.round(day.totalDistance*10)/10;
                        const electricConsumption = Math.round(day.totalElectricConsumption*10)/10;
                        const efficiency = Math.round(day.averageElectricConsumption *10)/10;
                        console.log(`├ ${day.date}: ${duration}, ${distance}${distanceUnit}, ${electricConsumption}${consumptionUnit} (${efficiency}${consumptionUnit}/100${distanceUnit})`);
                        if (options.long) {
                            let tripCount = 0;
                            for (trip of day.trips.sort((a, b) => Date.parse(a.start.time) - Date.parse(b.start.time))) {
                                const tripAvgSpeed = Math.round(trip.averageSpeed*10)/10;
                                let tripDur = Math.floor(trip.hours/24) + "d " +  Math.floor(trip.hours%24) + "h " + Math.floor(trip.hours*60%60) + "min";
                                tripDur = tripDur.replaceAll(/\b(0[dh] )*/g, "");
                                const tripDistance = Math.round(trip.distance.distance*10)/10;
                                const tripElectricConsumption = Math.round(trip.electricConsumption.consumption*10)/10;
                                const tripEfficiency = Math.round(trip.averageElectricConsumption *10)/10;
                                const localTime = new Date(trip.start.time).toLocaleTimeString("en-gb").replace(/(\d+:\d+):\d+/, "$1");
                                const prefix = tripCount++ === day.trips.length - 1 ? "└" : "├";
                                console.log(`├ ${prefix} @${localTime}: ${trip.start.location.addressName}, ${tripDur}, ${tripDistance}${distanceUnit}, ${tripElectricConsumption}${consumptionUnit} (${tripEfficiency}${consumptionUnit}/100${distanceUnit})`);
                            }
                        }
                    }
                }
                const efficiency = Math.round(vehicle.trips.averageElectricConsumption*10)/10;
                const avgSpeed = Math.round(vehicle.trips.averageSpeed*10)/10;
                let duration = Math.floor(vehicle.trips.totalHours/24) + "d " +  Math.floor(vehicle.trips.totalHours%24) + "h " + Math.floor(vehicle.trips.totalHours*60%60) + "min";
                duration = duration.replaceAll(/\b(0[dh] )*/g, "");
                const distance = Math.round(vehicle.trips.totalDistance*10)/10;
                const electricConsumption = Math.round(vehicle.trips.totalElectricConsumption*10)/10;
                console.log(`└ Total: ${duration}, ${distance}${distanceUnit}, ${electricConsumption}${consumptionUnit} (${efficiency}${consumptionUnit}/100${distanceUnit})`);
            }
        }
    });

program
    .command('charging [vin]')
    .description('Charging history')
    .option('--start <start>', 'Start Date')
    .option('--end <end>', 'End Date')
    .option('--raw', 'raw json output')
    // .option('--csv', 'raw csv output') // TODO
    .action(async (vin, options) => {
        if (!Date.parse(options.start)) options.start = new Date();
        if (!Date.parse(options.end)) options.end = new Date();

        const bmw = bmwClient();
        // const res = await bmw.chargingSessionExport(vin, new Date('2022-11-01T01:00:00Z')).catch(e => {console.error(e); return []});
        const res = await bmw.chargingHistory(vin, options.start, options.end).catch(e => {console.error(e); return []});
        if (options.raw) {
            console.log(stringify(res.length <= 1 ? res[0] : res));
        }
        else {
            for (const vehicle of res) {
                console.log(`${vehicle.attributes?.model} ${vehicle.attributes?.year} (${vehicle.vin}):`);
                const charging = vehicle.charging;
                const distanceUnit = charging.sessions[0]?.odometerUnit;

                for (const session of charging.sessions.sort((a, b) => Date.parse(a.date) - Date.parse(b.date))) {
                        if (session.batteryDiff > 1) {
                            let duration = Math.floor(session.minutes/24/60) + "d " +  Math.floor(session.minutes/60%24) + "h " + Math.floor(session.minutes%60) + "min";
                            duration = duration.replaceAll(/\b(0[dh] )*/g, "");

                            const localTime = new Date(session.date).toLocaleTimeString("en-gb").replace(/(\d+:\d+):\d+/, "$1");

                            if (session.distance > 0) {
                                console.log(`├ ${session.day}: ${duration}, ${session.kwh} kwh (${Math.round(session.kwhAvg)} kwh), ${session.batteryEnd}% (+${session.batteryDiff}%), ${session.distance} ${distanceUnit}, ${Math.round(session.averageElectricConsumption*10)/10} kwh/100${distanceUnit}`);
                            }
                            else {
                                console.log(`├ ${session.day}: ${duration}, ${session.kwh} kwh (${Math.round(session.kwhAvg)} kwh), ${session.batteryEnd}% (+${session.batteryDiff}%)`);
                            }
                        }
                }
                // const duration = new Date(charging.minutes*1000*60).toISOString().substring(11, 16).replace(":", "h ").replace(/00h |\b0+/g, "") + "m";
                let duration = Math.floor(charging.minutes/24/60) + "d " +  Math.floor(charging.minutes/60%24) + "h " + Math.floor(charging.minutes%60) + "min";
                duration = duration.replaceAll(/\b(0[dh] )*/g, "");
                console.log(`└ Total: ${duration}, ${charging.kwh} kwh (${Math.round(charging.kwhAvg)} kwh), +${charging.batteryDiff}%, ${charging.distance} ${distanceUnit}, ${Math.round(charging.averageElectricConsumption*10)/10} kwh/100${distanceUnit} (Est. Battery: ~${Math.round(charging.estimatedBatteryKwh*10)/10}kwh)`);
            }
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
