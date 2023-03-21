#!/usr/bin/env node

const BMWClientAPI = require('./bmw-api');
const BMWClient = require('./bmw');
const {Command} = require('commander');
const {stringify} = require("./stringify");
const {formatNumber, formatMinutes, formatLocalTime} = require("./utils");
const h3 = require("h3-js");
const program = new Command();
const crypto = require('crypto');
const fsPromises = require('fs').promises;

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
    .command('flags [vin]')
    .option('--json', 'output as JSON')
    .option('--output -O <file>', 'save output to file (implies --json)')
    .description('Report Application Flags and vehicle attributes')
    .action(async (vin, options) => {
        const bmw = bmwClient();
        const userFlags = await bmw.userFlags().catch(() => []);
        const vehicles = await bmw.vehicleDetails(vin, false, false).catch(() => []);
        if (options.json || options.output) {
            const output = { vehicles: [], flags: {foo:{}}};
            for (const flag of userFlags.flags) {
                output.flags[flag.flagId] = flag.isActive;
            }
            output.vehicles = vehicles.map(vehicle => {
                delete vehicle.attributes.driverGuideInfo;
                delete vehicle.attributes.lastFetched;
                return {
                    vin: vehicle.vin,
                    appVehicleType: vehicle.appVehicleType,
                    attributes: vehicle.attributes,
                    mappingInfo: vehicle.mappingInfo,
                    capabilities: vehicle.capabilities,
                }
            });
            if (options.output) {
                await fsPromises.writeFile(options.output, stringify(output));
            }
            else {
                console.log(stringify(output));
            }
        }
        else {
            for (const flag of userFlags.flags) {
                console.log(`${flag.flagId} - ${flag.isActive ? '✅' : '❌'}`);
            }

            for (const vehicle of vehicles) {
                console.log();
                console.log(`${vehicle.attributes?.model} ${vehicle.attributes?.year} (${vehicle.vin}):`);
                for (const [capability, value] of Object.entries(vehicle.capabilities)) {
                    console.log(`${capability} - ${typeof(value) === 'boolean' ? (value ? '✅' : '❌') : stringify(value, 0, null)}`);
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
    .option('--json', 'output summary in json')
    .option('--output -O <file>', 'save output to file (implies --json)')
    .option('--only-changed', 'only output changed values')
    .action(async (vin, options) => {
        const bmw = bmwClient();
        const res = await bmw.vehicleDetails(vin, false, false).catch(() => []);
        if (options.json || options.output) {
            for (const vehicle of res) {
                const output = {
                    vin: vehicle.vin,
                    km: vehicle.state?.currentMileage,
                    updatedAt: new Date(Date.parse(vehicle.state?.lastUpdatedAt ?? vehicle.state?.lastUpdatedDate)).toISOString(),
                    latitude: vehicle.state?.location?.coordinates?.latitude,
                    longitude: vehicle.state?.location?.coordinates?.longitude,
                    heading: vehicle.state?.location?.heading,
                    address: vehicle.state?.location?.address?.formatted,
                    h3:  h3.latLngToCell(vehicle.state?.location?.coordinates?.latitude, vehicle.state?.location?.coordinates?.longitude, 15),
                    battery: vehicle.state?.electricChargingState?.chargingLevelPercent,
                    pluggedIn: vehicle.state?.electricChargingState?.isChargerConnected,
                    charging: vehicle.state?.electricChargingState?.chargingStatus === "CHARGING",
                    chargingMinutes: vehicle.state?.electricChargingState?.remainingChargingMinutes,
                    deepSleep: vehicle.state?.isDeepSleepModeActive,
                    climate: vehicle.state?.climateControlState?.activity === 'ACTIVE',
                }
                if (options.onlyChanged) {
                    try {
                        const lockFile = `${process.env.BMW_LOCK_DIR ?? "."}/.bmw${vehicle.vin}.lock`;
                        const lastHash = await fsPromises.readFile(lockFile).catch(() => '');
                        const hash = crypto.createHash('md5').update(`${output.vin}${output.km}${output.latitude}${output.longitude}${output.battery}${output.pluggedIn}${output.charging}${output.deepSleep}`).digest('hex');
                        await fsPromises.writeFile(lockFile, hash);
                        if (hash === lastHash) {
                            return;
                        }
                    }
                    catch {
                        // noop
                    }
                }
                const data = stringify(output, 0, null, {forceKeyOrder: ['vin', 'updatedAt', 'km', 'battery', 'latitude', 'longitude', 'heading', 'address', 'h3', 'pluggedIn', 'charging', 'chargingMinutes', 'deepSleep', 'climate']});
                if (options.output) {
                    await fsPromises.appendFile(options.output, data);
                }
                else {
                    console.log(data);
                }
            }
        }
        else {
            for (const vehicle of res) {
                if (res[0] !== vehicle) console.log();
                const updatedDate = Date.parse(vehicle.state?.lastUpdatedAt ?? vehicle.state?.lastUpdatedDate);
                const chargeState = vehicle.state?.electricChargingState;
                console.log(`${vehicle.attributes?.model} ${vehicle.attributes?.year} (${vehicle.vin}):`);
                console.log(`🏁 Odometer: ${formatNumber(vehicle.state?.currentMileage, 'km')}`);
                const software = vehicle.attributes?.softwareVersionCurrent;
                console.log(`🔧 iDrive${vehicle.attributes?.hmiVersion?.replace('ID', '')}: ${software.puStep?.month}/20${software.puStep?.year}.${String(software.iStep).replace(/.*(..)$/, '$1')}`);
                const lat = vehicle.state?.location?.coordinates?.latitude;
                const long = vehicle.state?.location?.coordinates?.longitude;
                const location = options.h3 ? `h3:${(lat + long) ? h3.latLngToCell(lat, long, 15) : ''}` : `${lat.toFixed(3)},${long.toFixed(3)}`;
                console.log(`📍 Location: ${vehicle.state?.location?.address?.formatted} (${location})`);
                console.log(`🚪 Doors: ${["LOCKED", "SECURED"].includes(vehicle.state?.doorsState?.combinedSecurityState) ? '🔒 Locked' : 'Unlocked'}${vehicle.state?.doorsState?.combinedState === 'CLOSED' ? '' : ' & Open'}`);
                console.log(`🪟  Windows: ${vehicle.state?.windowsState?.combinedState === 'CLOSED' ? 'Closed' : 'Open'}`);

                if (vehicle.state?.climateControlState?.activity === 'ACTIVE') {
                    console.log(`☀️ Climate: ${vehicle.state?.climateControlState?.activity}`);
                }
                if (vehicle.state?.isDeepSleepModeActive === true) {
                    console.log(`💤 Deep Sleep: Enabled`);
                }

                console.log(`🔋 Battery: ${chargeState?.chargingLevelPercent}% (${vehicle.state?.range} km)`);

                if (chargeState?.isChargerConnected) {
                    console.log(`🔌 Pluged In`);
                }
                if (chargeState?.chargingStatus === "CHARGING") {
                    console.log(`⚡️ Charging: ${chargeState.chargingTarget}% in ${formatMinutes(vehicle.state?.electricChargingState?.remainingChargingMinutes)}`);
                }
            }
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
    .option('--h3', 'show h3 coordinates instead of lat/lon')
    .option('--short', 'short trip data grouped by day')
    .option('--raw', 'original raw json output')
    .option('--json', 'json output')
    .option('--csv', 'csv output')
    // .option('--csv', 'raw csv output') // TODO
    .action(async (vin, options) => {
        if (!Date.parse(options.start)) options.start = new Date();
        if (!Date.parse(options.end)) options.end = options.start;

        const bmw = bmwClient();
        const res = await bmw.tripHistory(vin, options.start, options.end).catch(e => {console.error(e); return []});
        if (options.raw) {
            console.log(stringify(res.length <= 1 ? res[0] : res));
        }
        if (options.json) {

        }
        else {
            for (const vehicle of res) {
                if (res[0] !== vehicle) console.log();
                console.log(`${vehicle.attributes?.model} ${vehicle.attributes?.year} (${vehicle.vin}):`);
                for (const day of vehicle.trips.days.sort((a, b) => Date.parse(a.date) - Date.parse(b.date))) {
                    if (day.distance > 0) {
                        // const avgSpeed = formatNumber(day.averageSpeed, `${day.distanceUnit}/h`);
                        if (options.short) {
                            console.log(`${day.date}`);
                            console.log(` 🏁 Travel: ${formatNumber(day.distance, day.distanceUnit)} (${formatMinutes(day.minutes)})`);
                            console.log(` ⚡️ Energy: ${formatNumber(day.kwh, "KWh")} (-${formatNumber(day.batteryUsed)}% 🪫 )`);
                            console.log(` 🌎 Efficiency: ${formatNumber(day.averageElectricConsumption?.toFixed(1), 'kWh/100' + day.distanceUnit, false)}`);
                        }
                        else {
                            const trips = day.trips
                                .filter(trip => trip.distance.distance > 0)
                                .sort((a, b) => Date.parse(a.start.time) - Date.parse(b.start.time));

                            for (const trip of trips) {
                                console.log(`${day.date} @ ${formatLocalTime(trip.start.time)}`);
                                console.log(` 🏁 Travel: ${formatNumber(trip.distance.distance, trip.distance.distanceUnit)} (${formatMinutes(trip.minutes)})`);

                                let location = options.h3 ? `h3:${h3.latLngToCell(trip.start.location.latitude, trip.start.location.longitude, 15)}` : `${trip.start.location.latitude.toFixed(3)},${trip.start.location.longitude.toFixed(3)}`;
                                console.log(` 📍 Start: ${trip.start.location.addressName.split(',')[0]} (${location})`);

                                location = options.h3 ? `h3:${h3.latLngToCell(trip.end.location.latitude, trip.end.location.longitude, 15)}` : `${trip.end.location.latitude.toFixed(3)},${trip.end.location.longitude.toFixed(3)}`;
                                console.log(` 📍 End: ${trip.end.location.addressName.split(',')[0]} (${location})`);
                                console.log(` ⚡️ Energy: ${formatNumber(trip.kwh, "KWh")} (-${formatNumber(trip.batteryUsed)}% 🪫 )`);
                                console.log(` 🌎 Efficiency: ${formatNumber(trip.averageElectricConsumption?.toFixed(1), 'KWh/100' + trip.distance.distanceUnit, false)}`);
                            }
                        }
                    }
                }
                const duration = formatMinutes(vehicle.trips.minutes);
                const distance = formatNumber(vehicle.trips.distance, vehicle.trips.distanceUnit);
                const consumption = formatNumber(vehicle.trips.kWh, "KWh");
                const efficiency = formatNumber(vehicle.trips.averageElectricConsumption, `KWh/100${vehicle.trips.distanceUnit}`);
                const estBatteryKWh = formatNumber(vehicle.trips.estimatedBatteryKWh?.toFixed(1), "KWh", false);
                console.log(`Total: ${duration}, ${distance}, ${consumption}, ${efficiency} (Est. Battery: ~${estBatteryKWh})`);
            }
        }
    });

program
    .command('charging [vin]')
    .description('Charging history')
    .option('--start <start>', 'Start Date')
    .option('--end <end>', 'End Date')
    .option('--csv', 'csv output')
    .option('--raw', 'raw json output')
    .action(async (vin, options) => {
        if (!Date.parse(options.start)) options.start = new Date();
        if (!Date.parse(options.end)) options.end = new Date();

        const bmw = bmwClient();
        // const res = await bmw.chargingSessionExport(vin, new Date('2022-11-01T01:00:00Z')).catch(e => {console.error(e); return []});
        const res = await bmw.chargingHistory(vin, options.start, options.end).catch(e => {console.error(e); return []});
        if (options.raw) {
            console.log(stringify(res.length <= 1 ? res[0] : res));
        }
        else if (options.csv) {
            for (const vehicle of res) {
                const keys = Object.keys(vehicle.charging.sessions[0]).filter(k => !['timelineItems', 'totalCost', 'pluginIssue'].includes(k));
                console.log(keys.join(','));

                for (const session of vehicle.charging.sessions) {
                    console.log(keys.map(k => String(session[k]).replaceAll(/,/g, '')).join(','));
                }
                console.log(keys);

            }
        }
        else {
            for (const vehicle of res) {
                if (res[0] !== vehicle) console.log();
                console.log(`${vehicle.attributes?.model} ${vehicle.attributes?.year} (${vehicle.vin}):`);
                const charging = vehicle.charging;
                for (const session of charging.sessions) {
                    console.log(`${session.day}  🏁 ${formatNumber(session.odometer, 'km')}`);
                    const location = options.h3 ? `h3:${h3.latLngToCell(session.latitude, session.longitude, 15)}` : `${session.latitude.toFixed(3)},${session.longitude.toFixed(3)}`;
                    console.log(` 📍 ${session.locationName} (${location})`);
                    console.log(` 🏁 Travel: ${formatNumber(session.distance, session.distanceUnit)}`);
                    console.log(` 🪫  Start: ${session.batteryStart}% (-${session.batteryUsedSinceLastCharge}%)`);
                    console.log(` ⚡️ Charge: ${formatNumber(session.kwh, 'kwh')} (⏱️ ${formatMinutes(session.minutes)} @${session.kwhAvg?.toFixed(1)}kwh)`);
                    console.log(` 🔋 End: ${session.batteryEnd}% (+${session.batteryCharged}%)`);
                    console.log(` 🌎 Efficiency: ${formatNumber(session.averageElectricConsumption?.toFixed(1), "kwh/100" + session.distanceUnit, false)}`);
                }
                console.log(`Total: ${formatMinutes(charging.minutes)}, ${formatNumber(charging.kwh?.toFixed(1), 'kwh', false)}, ${formatNumber(charging.distance, charging.distanceUnit)}, ${formatNumber(charging.averageElectricConsumption?.toFixed(1), "kwh/100" + charging.distanceUnit, false)} (Est. Battery: ~${formatNumber(charging.estimatedBatteryKwh?.toFixed(1), "kwh", false)})`);
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