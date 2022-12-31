const BMWClientAPI = require('./bmw-api');
const { sleep } = require('./utils');

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

    async vehicleDetails(vin = null) {
        const vehicles = await this.vehicles(vin);
        for (const vehicle of vehicles) {
            const state = await this.bmwClientAPI.vehicleState(vehicle.vin);
            const chargingSettings = await this.bmwClientAPI.vehicleChargeSettings(vehicle.vin);
            const chargeState = await this.bmwClientAPI.vehicleChargeState(vehicle.vin);
            vehicle.recalls = await this.bmwClientAPI.vehicleRecalls(vehicle.vin);
            Object.assign(vehicle, state, chargingSettings, chargeState);
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

    async tripHistory(vin = null, date = new Date()) {
        const vehicles = await this.vehicles(vin);
        for (const vehicle of vehicles) {
            vehicle.trips = {};
            // vehicle.trips.summary = await this.bmwClientAPI.currentMonthTripSummary(vehicle.vin);

            // get all the trips for the month
            const daily = await this.bmwClientAPI.tripHistory(vehicle.vin, date, 0, 100, false);
            while (daily?.items[0].trips?.length < daily?.quantity) {
                const next = await this.bmwClientAPI.tripHistory(vehicle.vin, date, daily?.items[0].trips?.length, 100, false);
                daily.items[0].trips.push(...next.items[0].trips);
            }

            // group the trips by day and get details for each trip
            const days = new Map();
            await Promise.all(daily.items[0].trips.map(async tripSummary => {
                const detail = await this.bmwClientAPI.tripDetails(vehicle.vin, tripSummary.id);
                const trip = detail.trip;

                // convenience function
                // duration is in hours
                trip.hours = (Date.parse(detail.trip?.end?.time) - Date.parse(detail.trip?.start?.time))/1000/60/60;
                trip.electricDistance = trip.distance.distance; //TODO: what about PHEV?
                trip.averageSpeed = trip.distance.distance / trip.hours;
                trip.averageElectricConsumption = trip.electricConsumption.consumption / trip.distance.distance * 100;

                const startTime = new Date(trip.start?.time);
                // we only care about the date, en-ca uses the ISO8601 format of yyyy-mm-dd unlike en-us :(
                const day = startTime.toLocaleDateString('en-ca');

                if (!days.has(day)) days.set(day, {date: day, trips: []});
                days.get(day).trips.push(trip);
            }));

            // we could use monthlyTripStatistics() but the values are inaccurate so we have to calculate them ourselves
            for (const day of days.values()) {
                day.totalHours = day.trips.reduce((a, b) => a + (b.hours || 0), 0);
                day.totalElectricDistance = day.trips.reduce((a, b) => a + (b.electricDistance || 0), 0);
                day.totalDistance = day.trips.reduce((a, b) => a + (b.distance?.distance || 0), 0);
                day.totalDistanceUnit = day.trips[0]?.distance?.distanceUnit;
                day.totalElectricConsumption = day.trips.reduce((a, b) => a + (b.electricConsumption?.consumption || 0), 0);
                day.totalElectricConsumptionUnit = day.trips[0]?.electricConsumption?.consumptionUnit;
                day.averageSpeed = day.totalDistance / day.totalHours;
                day.averageElectricConsumption = day.totalElectricConsumption / day.totalElectricDistance * 100;
            }

            const data = {};
            data.days = [...days.values()];

            data.totalHours = data.days.reduce((a, b) => a + (b.totalHours || 0), 0);
            data.totalElectricDistance = data.days.reduce((a, b) => a + (b.totalElectricDistance || 0), 0);
            data.totalDistance = data.days.reduce((a, b) => a + (b.totalDistance || 0), 0);
            data.totalDistanceUnit = data.days[0]?.totalDistanceUnit;
            data.totalElectricConsumption = data.days.reduce((a, b) => a + (b.totalElectricConsumption || 0), 0);
            data.averageSpeed = data.totalDistance / data.totalHours;
            data.averageElectricConsumption = data.totalElectricConsumption / data.totalElectricDistance * 100;
            data.totalElectricConsumptionUnit = data.days[0]?.totalElectricConsumptionUnit;

            vehicle.trips = data
        }

        return vehicles;
    }

    async chargingHistory(vin = null, start = new Date(), end = new Date()) {
        start = new Date(start);
        end = new Date(end);
        const vehicles = await this.vehicles(vin);
        for (const vehicle of vehicles) {
            vehicle.charging = {};
            // vehicle.trips.summary = await this.bmwClientAPI.currentMonthTripSummary(vehicle.vin);

            const summaries = [];
            for (const date = new Date(start); date <= end; date.setMonth(date.getMonth() + 1)) {
                // get all the trips for the month
                const curr = await this.bmwClientAPI.chargingSessions(vehicle.vin, date, 50, null, false);
                summaries.push(...curr.chargingSessions.sessions);
                while (summaries.length < curr.chargingSessions?.numberOfSessions) {
                    const next = await this.bmwClientAPI.chargingSessions(vehicle.vin, date, 50, curr.paginationInfo?.nextToken, false);
                    summaries.push(...next.chargingSessions.sessions);
                    curr.paginationInfo = next.paginationInfo;
                }
            }

            // group the trips by day and get details for each trip
            const sessions = [];
            await Promise.all(summaries.map(async chargeSummary => {
                const session = await this.bmwClientAPI.chargingSessionDetails(vehicle.vin, chargeSummary.id);

                // convenience function. we use the id to parse the date because the date is not always parseable
                if (Date.parse(chargeSummary.id.split('_')[0]) > 0) {
                    session.date = new Date(chargeSummary.id.split('_')[0]);
                }
                else {
                  // not sure why the date format uses the US format instead of ISO8601 like everrything else
                    session.date = new Date(session.date.replace(/(\d+)\/(\d+)\/(\d+) (\d+:\d+)/, "$3-0$1-0$2T0$4").replaceAll(/(\b|T)0(\d\d)/g, "$1$2"));
                    session.startDate = new Date(session.startDate.replace(/(\d+)\/(\d+)\/(\d+) (\d+:\d+)/, "$3-0$1-0$2T0$4").replaceAll(/(\b|T)0(\d\d)/g, "$1$2"));
                    session.endDate = new Date(session.endDate.replace(/(\d+)\/(\d+)\/(\d+) (\d+:\d+)/, "$3-0$1-0$2T0$4").replaceAll(/(\b|T)0(\d\d)/g, "$1$2"));
                }
                session.day = session.date.toLocaleDateString('en-ca');
                // session.duration = (Date.parse(endDate) - Date.parse(startDate))/1000/60;
                session.odometer = Number.parseInt(session.totalMileage.replace(/[^0-9]/g, ''));
                session.odometerUnit = session.totalMileage.replace(/[0-9, ]/g, '');
                session.kwh = Number.parseFloat(session.energyCharged.replace(/[^0-9.]/g, ''));
                // duration is in minutes
                session.minutes = Number.parseInt(session.duration.replace(/(\d+)h.*|.*/, '$1') || 0) * 60 + parseInt(session.duration.replace(/.*?(\d+)min.*/, '$1') || 0);
                session.batteryStart = Number.parseInt(session.startBatteryPc.replace(/[^0-9]/g, ''));
                session.batteryEnd = Number.parseInt(session.endBatteryPc.replace(/[^0-9]/g, ''));
                session.batteryDiff = session.batteryEnd - session.batteryStart;
                session.kwhAvg = session.kwh / (session.minutes / 60);
                sessions.push(session);
            }));

            let lastSession;
            for (const session of sessions.sort((a, b) => Date.parse(a.date) - Date.parse(b.date))) {
                if (session.batteryDiff > 1) {
                    if (lastSession) {
                        session.distance = session.odometer - lastSession.odometer;
                        session.odometerLast = lastSession.odometer;
                        if (session.distance <= 1) {
                            session.distance = session.odometer - lastSession.odometerLast;
                            session.odometerLast = lastSession.odometerLast;
                        }
                        session.batteryLastEnd = lastSession.batteryEnd;
                        session.batteryLastUsed = lastSession.batteryEnd - session.batteryStart;
                        session.averageElectricConsumption = (session.kwh * (session.batteryLastUsed / session.batteryDiff)) / session.distance * 100;
                        session.estimatedBatteryKwh = session.kwh / session.batteryDiff * 100;
                    }
                    lastSession = session;
                }
            }

            vehicle.charging.sessions = sessions;

            vehicle.charging.distance = sessions.filter(s => s.estimatedBatteryKwh > 0 ).reduce((a, b) => a + (b.distance || 0), 0);
            vehicle.charging.batteryLastUsed = sessions.filter(s => s.estimatedBatteryKwh > 0 ).reduce((a, b) => a + (b.batteryLastUsed || 0), 0);
            vehicle.charging.batteryDiff = sessions.filter(s => s.estimatedBatteryKwh > 0 ).reduce((a, b) => a + (b.batteryDiff || 0), 0);
            vehicle.charging.kwh = sessions.filter(s => s.estimatedBatteryKwh > 0 ).reduce((a, b) => a + (b.kwh || 0), 0);
            vehicle.charging.minutes = sessions.filter(s => s.estimatedBatteryKwh > 0 ).reduce((a, b) => a + (b.minutes || 0), 0);
            vehicle.charging.averageElectricConsumption = (vehicle.charging.kwh * (vehicle.charging.batteryLastUsed / vehicle.charging.batteryDiff)) / vehicle.charging.distance * 100;
            vehicle.charging.estimatedBatteryKwh = vehicle.charging.kwh / vehicle.charging.batteryDiff * 100;
            vehicle.charging.kwhAvg = vehicle.charging.kwh / (vehicle.charging.minutes / 60);
        }
        return vehicles;
    };
}
module.exports = BMWClient;
