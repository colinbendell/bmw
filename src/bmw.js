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
            const daily = await this.bmwClientAPI.dailyTripHistory(vehicle.vin, date, 0, 100, false);
            while (daily?.items[0].trips?.length < daily?.quantity) {
                const next = await this.bmwClientAPI.dailyTripHistory(vehicle.vin, date, daily?.items[0].trips?.length, 100, false);
                daily.items[0].trips.push(...next.items[0].trips);
            }

            // group the trips by day
            const trips = new Map();
            for (const trip of daily.items[0].trips) {
                const startTime = new Date(trip.startTime);
                // we only care about the date, en-ca uses the ISO8601 format of yyyy-mm-dd unlike en-us :(
                const day = startTime.toLocaleDateString('en-ca');
                if (!trips.has(day)) trips.set(day, []);

                // convenience function
                trip.duration = Math.round((Date.parse(trip.endTime) - Date.parse(trip.startTime))/1000/60/60*10000)/10000;
                trips.get(day).push(trip);
            }

            // get the monthly stats (by day)
            const monthly = await this.bmwClientAPI.monthlyTripStatistics(vehicle.vin, date);

            // merge the stats by days
            const days = new Map();
            for (const day of monthly.monthlyConsumption.perDayStatistics) {
                if (!days.has(day.date)) days.set(day.date, {});
                Object.assign(days.get(day.date), day);
            }
            for (const day of monthly.monthlyDistance.perDayStatistics) {
                if (!days.has(day.date)) days.set(day.date, {});
                Object.assign(days.get(day.date), day);
            }

            const data = {};
            // merge in trips
            for (const [day, value] of days.entries()) {
                value.trips = trips.get(day);
                value.duration = value.trips?.reduce((a, b) => a + b.duration, 0);
                for (const key of [...Object.keys(value)].filter(k => /^accumulated/i.test(k))) {
                    delete value[key];
                }
            }

            Object.assign(data, daily);
            delete data.items;

            Object.assign(data, monthly);
            Object.assign(data, monthly.monthlyConsumption);
            delete data.monthlyConsumption;
            delete data.perDayStatistics;

            Object.assign(data, monthly.monthlyDistance);
            delete data.monthlyDistance;
            delete data.perDayStatistics;
            delete data.quantity;

            data.days = [...days.values()];
            data.duration = data.days.reduce((a, b) => a + (b.duration || 0), 0);
            data.electricDistance = data.days.reduce((a, b) => a + (b.electricDistance || 0), 0);
            data.totalDistance = data.days.reduce((a, b) => a + (b.totalDistance || 0), 0);
            data.totalElectricConsumption = data.days.reduce((a, b) => a + (b.totalElectricConsumption || 0), 0);

            vehicle.trips = data
        }

        return vehicles;
    }
}

module.exports = BMWClient;