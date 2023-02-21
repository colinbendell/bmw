const BMWClientAPI = require('./bmw-api');
const { sleep, sum, parseRelativeDate} = require('./utils');

class BMWClient {
    constructor(username, password, region) {
        this.bmwClientAPI = new BMWClientAPI(username, password, region);
    }

    async login(forceRefresh = false) {
        return this.bmwClientAPI.login(forceRefresh);
    }

    async vehicles(filter = null) {
        await this.login();
        const vehicles = await this.bmwClientAPI.vehicles();
        if (filter) {
            return vehicles.filter(v => v.vin === filter || new RegExp(filter, "i").test(v?.attributes?.model));
        }
        return vehicles;
    }

    async userFlags(filter = null) {
        await this.login();
        const res = await this.bmwClientAPI.userFlags();
        return res;
    }

    async vehicleDetails(vin = null, includeRecalls = true, includeCharging = true) {
        const vehicles = await this.vehicles(vin);
        for (const vehicle of vehicles) {
            const state = await this.bmwClientAPI.vehicleState(vehicle.vin);
            Object.assign(vehicle, state);
            if (includeCharging) {
                const chargingSettings = await this.bmwClientAPI.vehicleChargeSettings(vehicle.vin);
                const chargeState = await this.bmwClientAPI.vehicleChargeState(vehicle.vin);
                Object.assign(vehicle, chargingSettings, chargeState);
            }
            if (includeRecalls) {
                vehicle.recalls = await this.bmwClientAPI.vehicleRecalls(vehicle.vin);
            }
        }
        return vehicles;
    }

    async _pollForStatusChange(pollEvents) {
        // if event is not an array, make it into an array
        const events = Array.isArray(pollEvents) ? pollEvents : [pollEvents];

        const start = Date.now();
        for (const event of events) {
            // poll for status change on the event
            // abort if it takes >30s
            if (event?.eventId) {
                while (Date.now() - start < 30 * 1000) {
                    event.status = await this.bmwClientAPI.remoteCommandsEventStatus(event.eventId);
                    if (event.status?.eventStatus && event.status?.eventStatus !== 'PENDING') {
                        // if null was returned we want to retry the status check
                        break;
                    }
                    await sleep(1000);
                }
            }
        }
        return pollEvents;
    }

    async lock(vin = null) {
        const vehicles = await this.vehicles(vin);
        for (const vehicle of vehicles) {
            vehicle.event = await this.bmwClientAPI.lock(vehicle.vin)
            console.log(`${vehicle.attributes?.model} (${vehicle.vin}): Locking...`)
        }
        await this._pollForStatusChange(vehicles.map(v => v.event));

        return vehicles;
    }

    async unlock(vin = null) {
        const vehicles = await this.vehicles(vin);
        for (const vehicle of vehicles) {
            vehicle.event = await this.bmwClientAPI.unlock(vehicle.vin)
            console.log(`${vehicle.attributes?.model} (${vehicle.vin}): Unlocking...`)
        }
        await this._pollForStatusChange(vehicles.map(v => v.event));

        return vehicles;
    }

    async flashLights(vin = null) {
        const vehicles = await this.vehicles(vin);
        for (const vehicle of vehicles) {
            vehicle.event = await this.bmwClientAPI.flashLights(vehicle.vin)
            console.log(`${vehicle.attributes?.model} (${vehicle.vin}): Flashing Lights...`)
        }
        await this._pollForStatusChange(vehicles.map(v => v.event));

        return vehicles;
    }

    async honkHorn(vin = null) {
        const vehicles = await this.vehicles(vin);
        for (const vehicle of vehicles) {
            vehicle.event = await this.bmwClientAPI.honkHorn(vehicle.vin);
            console.log(`${vehicle.attributes?.model} (${vehicle.vin}): Honking...`);
        }
        await this._pollForStatusChange(vehicles.map(v => v.event));

        return vehicles;
    }

    async startClimate(vin = null) {
        const vehicles = await this.vehicles(vin);
        for (const vehicle of vehicles) {
            const state = await this.bmwClientAPI.vehicleState(vehicle.vin);
            if (state?.state?.climateControlState?.activity === 'INACTIVE') {
                vehicle.event = await this.bmwClientAPI.startClimate(vehicle.vin);
                console.log(`${vehicle.attributes?.model} (${vehicle.vin}): Starting Climate...`);
            }
        }
        await this._pollForStatusChange(vehicles.map(v => v.event));

        return vehicles;
    }

    async stopClimate(vin = null) {
        const vehicles = await this.vehicles(vin);
        for (const vehicle of vehicles) {
            const state = await this.bmwClientAPI.vehicleState(vehicle.vin);
            if (state?.state?.climateControlState?.activity !== 'INACTIVE') {
                vehicle.event = await this.bmwClientAPI.stopClimate(vehicle.vin);
                console.log(`${vehicle.attributes?.model} (${vehicle.vin}): Stoping Climate...`);
            }
        }
        await this._pollForStatusChange(vehicles.map(v => v.event));

        return vehicles;
    }

    async startCharging(vin = null) {
        const vehicles = await this.vehicles(vin);
        const electriVehicles = vehicles.filter(v => v.attributes?.driveTrain === 'ELECTRIC');

        for (const vehicle of electriVehicles) {
            const state = await this.bmwClientAPI.vehicleState(vehicle.vin);
            if (state?.electricChargingState?.isChargerConnected) {
                vehicle.event = await this.bmwClientAPI.startCharging(vehicle.vin);
                console.log(`${vehicle.attributes?.model} (${vehicle.vin}): Starting Charge...`)
            }
            else {
                console.log(`${vehicle.attributes?.model} (${vehicle.vin}): Not connected [Skipped]`)
            }
        }
        await this._pollForStatusChange(vehicles.map(v => v.event));

        return electriVehicles;
    }

    async stopCharging(vin = null) {
        const vehicles = await this.vehicles(vin);
        const electriVehicles = vehicles.filter(v => v.attributes?.driveTrain === 'ELECTRIC');

        for (const vehicle of electriVehicles) {
            const state = await this.bmwClientAPI.vehicleState(vehicle.vin);
            if (state?.electricChargingState?.isChargerConnected) {
                const chargeState = await this.bmwClientAPI.vehicleChargeState(vehicle.vin);
                if (chargeState?.status !== 'STOPPED') {
                    vehicle.event = await this.bmwClientAPI.startCharging(vehicle.vin);
                    console.log(`${vehicle.attributes?.model} (${vehicle.vin}): Stopping Charge...`)
                }
                else {
                    console.log(`${vehicle.attributes?.model} (${vehicle.vin}): Not charging [Skipped]`)
                }
            }
            else {
                console.log(`${vehicle.attributes?.model} (${vehicle.vin}): Not connected [Skipped]`)
            }
        }
        await this._pollForStatusChange(vehicles.map(v => v.event));

        return electriVehicles;
    }

    async tripHistory(vin = null, start = new Date(), end = new Date()) {
        start = new Date(start);
        start.setUTCDate(1);
        start.setUTCHours(0, 0, 0, 0);
        end = new Date(end);

        const vehicles = await this.vehicles(vin);
        for (const vehicle of vehicles) {
            vehicle.trips = {};
            // vehicle.trips.summary = await this.bmwClientAPI.currentMonthTripSummary(vehicle.vin);

            // get all the trips for the month
            const daily = await this.bmwClientAPI.tripHistory(vehicle.vin, start, 0, 100, false);
            while (daily?.items[0].trips?.length < daily?.quantity) {
                const next = await this.bmwClientAPI.tripHistory(vehicle.vin, start, daily?.items[0].trips?.length, 100, false);
                daily.items[0].trips.push(...next.items[0].trips);
            }

            // group the trips by day and get details for each trip
            const days = new Map();
            await Promise.all(daily.items[0].trips.map(async tripSummary => {
                const detail = await this.bmwClientAPI.tripDetails(vehicle.vin, tripSummary.id);
                const trip = detail.trip;

                // convenience function
                // duration is in minutes
                trip.minutes = Math.round((Date.parse(detail.trip?.end?.time) - Date.parse(detail.trip?.start?.time))/1000)/60;
                trip.electricDistance = trip.distance.distance; //TODO: what about PHEV?
                trip.batteryUsed = trip.start.energyState.electric - trip.end.energyState.electric;
                trip.averageSpeed = trip.distance.distance / trip.minutes * 60;
                trip.kwh = trip.electricConsumption.consumption;
                trip.averageElectricConsumption = trip.kwh / trip.distance.distance * 100;
                trip.estimatedBatteryKWh = trip.kwh / trip.batteryUsed * 100;

                const startTime = new Date(trip.start?.time);
                // we only care about the date, en-ca uses the ISO8601 format of yyyy-mm-dd unlike en-us :(
                const day = startTime.toLocaleDateString('fr-ca');

                if (!days.has(day)) days.set(day, {date: day, trips: []});
                days.get(day).trips.push(trip);
            }));

            // we could use monthlyTripStatistics() but the values are inaccurate so we have to calculate them ourselves
            for (const day of days.values()) {
                day.batteryUsed = sum(...day.trips.map(t => t.batteryUsed));
                day.minutes = sum(...day.trips.map(t => t.minutes))
                day.electricDistance = sum(...day.trips.map(t => t.electricDistance));
                day.distance = sum(...day.trips.map(t => t.distance?.distance));
                day.distanceUnit = day.trips[0]?.distance?.distanceUnit;
                day.kwh = sum(...day.trips.map(t => t.kwh));
                day.averageSpeed = day.distance / day.minutes * 60;
                day.averageElectricConsumption = day.kwh / day.electricDistance * 100;
                day.estimatedBatteryKWh = day.kwh / day.batteryUsed * 100;

            }

            const data = {};
            data.days = [...days.values()];
            data.batteryUsed = sum(...data.days.map(d => d.batteryUsed));
            data.minutes = sum(...data.days.map(d => d.minutes));
            data.electricDistance = sum(...data.days.map(d => d.electricDistance));
            data.distance = sum(...data.days.map(d => d.distance));
            data.distanceUnit = data.days[0]?.distanceUnit;
            data.kwh = sum(...data.days.map(d => d.kwh));
            data.averageSpeed = data.distance / data.minutes  * 60;
            data.averageElectricConsumption = data.kwh / data.electricDistance * 100;
            data.estimatedBatteryKWh = data.kwh / data.batteryUsed * 100;

            vehicle.trips = data
        }

        return vehicles;
    }

    async chargingHistory(vin = null, start = new Date(), end = new Date(), excludeNoCharge = true) {
        start = new Date(start);
        start.setUTCDate(1);
        start.setUTCHours(0, 0, 0, 0);
        end = new Date(end);
        const vehicles = await this.vehicles(vin);
        for (const vehicle of vehicles) {
            vehicle.charging = {};
            // vehicle.trips.summary = await this.bmwClientAPI.currentMonthTripSummary(vehicle.vin);

            const summaries = [];
            const priorMonth = new Date(start);
            priorMonth.setUTCMonth(priorMonth.getUTCMonth() - 1);
            for (const date = priorMonth; date <= end; date.setUTCMonth(date.getUTCMonth() + 1)) {
                // get all the trips for the month
                const currSummaries = []
                const curr = await this.bmwClientAPI.chargingSessions(vehicle.vin, date, 50, null, false);
                currSummaries.push(...curr.chargingSessions.sessions);
                while (currSummaries.length < curr.chargingSessions?.numberOfSessions) {
                    const next = await this.bmwClientAPI.chargingSessions(vehicle.vin, date, 50, curr.paginationInfo?.nextToken, false);
                    currSummaries.push(...next.chargingSessions.sessions);
                    curr.paginationInfo = next.paginationInfo;
                }

                // only add the summaries for the query months plus the last charge of prior month
                // this is an akward way to do it...
                if (date >= start) {
                    if (currSummaries && currSummaries.length > 0) {
                        summaries.push(...currSummaries);
                    }
                }
                else {
                    const lastSession = currSummaries.sort((a, b) => b.id.localeCompare(a.id))[0];
                    if (lastSession) summaries.push(lastSession);
                }
            }

            // group the trips by day and get details for each trip
            let sessions = [];
            await Promise.all(summaries.map(async chargeSummary => {
                const session = await this.bmwClientAPI.chargingSessionDetails(vehicle.vin, chargeSummary.id);

                // not sure why the date format uses the US format instead of ISO8601 like everrything else
                session.date = parseRelativeDate(session.date);
                let timezone = 0;
                if (Date.parse(chargeSummary.id.split('_')[0]) > 0) {
                    // convenience function. we use the id to parse the date because the date is not always parseable
                    const trueDate = new Date(chargeSummary.id.split('_')[0]).toISOString();
                    timezone = (Date.parse(trueDate) - Date.parse(session.date))/60/60/1000;
                    session.date = trueDate;
                }
                session.startDate = parseRelativeDate(session.startDate, timezone);
                session.endDate = parseRelativeDate(session.endDate, timezone);

                session.day = new Date(session.date).toLocaleDateString('fr-ca');
                session.odometer = Number.parseInt(session.totalMileage.replace(/[^0-9]/g, ''));
                session.distanceUnit = session.totalMileage.replace(/[0-9, ]/g, '');
                session[session.distanceUnit] = session.odometer;
                session.kwh = Number.parseFloat(session.energyCharged.replace(/[^0-9.]/g, ''));
                // duration is in minutes
                session.minutes = Number.parseInt(session.duration.replace(/(\d+)h.*|.*/, '$1') || 0) * 60 + parseInt(session.duration.replace(/.*?(\d+)min.*/, '$1') || 0);
                session.batteryStart = Number.parseInt(session.startBatteryPc.replace(/[^0-9]/g, ''));
                session.batteryEnd = Number.parseInt(session.endBatteryPc.replace(/[^0-9]/g, ''));
                session.batteryCharged = session.batteryEnd - session.batteryStart;
                session.kwhAvg = session.kwh / (session.minutes / 60);
                const [,latitude, longitude] = session.vehicleLocationId.split(':');
                session.latitude = Number.parseFloat(latitude);
                session.longitude = Number.parseFloat(longitude);

                delete session.totalMileage;
                delete session.energyCharged;
                delete session.duration;
                delete session.startBatteryPc;
                delete session.endBatteryPc
                delete session.vehicleLocationId
                sessions.push(session);
            }));

            sessions = sessions
                .filter(s => !excludeNoCharge || s.batteryCharged > 0)
                .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));

            let lastSession;
            for (const session of sessions) {
                if (lastSession) {
                    session.distance = session.odometer - lastSession.odometer;
                    session.odometerLast = lastSession.odometer;
                    session.batteryLastEnd = lastSession.batteryEnd;
                    session.batteryUsedSinceLastCharge = session.batteryLastEnd - session.batteryStart;
                    session.averageElectricConsumption = (session.kwh * (session.batteryUsedSinceLastCharge / session.batteryCharged)) / session.distance * 100;

                    if (session.distance <= 1) {
                        session.averageElectricConsumption = null;
                    }
                    session.estimatedBatteryKwh = session.kwh / session.batteryCharged * 100;
                }
                if (session.batteryCharged > 0) {
                    lastSession = session;
                }
            }

            const firstOdometer = Math.min(...sessions.map(s => s.odometer));
            const lastOdometer = Math.max(...sessions.map(s => s.odometer));
            vehicle.charging.distanceUnit = sessions[0].distanceUnit;
            vehicle.charging.distance = lastOdometer - firstOdometer;

            vehicle.charging.sessions = sessions.filter(s => Date.parse(s.date) >= Date.parse(start));

            vehicle.charging.batteryUsedSinceLastCharge = sum(...vehicle.charging.sessions.map(s => s.batteryUsedSinceLastCharge));
            vehicle.charging.batteryCharged = sum(...vehicle.charging.sessions.map(s => s.batteryCharged));

            vehicle.charging.kwh = sum(...vehicle.charging.sessions.map(s => s.kwh));
            vehicle.charging.minutes = sum(...vehicle.charging.sessions.map(s => s.minutes));
            vehicle.charging.averageElectricConsumption = vehicle.charging.kwh / vehicle.charging.distance * 100;
            vehicle.charging.estimatedBatteryKwh = vehicle.charging.kwh / vehicle.charging.batteryCharged * 100;
            vehicle.charging.kwhAvg = vehicle.charging.kwh / (vehicle.charging.minutes / 60);
        }
        return vehicles;
    };
}

module.exports = BMWClient;
