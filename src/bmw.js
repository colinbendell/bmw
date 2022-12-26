const BMWClientAPI = require('./bmw-api');
const { sleep } = require('./utils');

class BMWClient {
    constructor(username, password, region) {
        this.bmwClientAPI = new BMWClientAPI(username, password, region);
    }

    async login() {
        return this.bmwClientAPI.login();
    }

    async vehicles(filter = null) {
        await this.login();
        const vehicles = this.bmwClientAPI.vehicles();

        if (filter) {
            return vehicles.filter(v => v.vin === filter || new RegExp(filter, "i").test(v?.attributes?.model));
        }
        return vehicles;
    }

    async vehicleDetails(vin = null) {
        await this.login();
        console.log("login");

        const vehicles = await this.vehicles(vin);
        for (const vehicle of vehicles) {
            const state = await this.bmwClientAPI.vehicleState(vehicle.vin);
            const chargingSettings = await this.bmwClientAPI.vehicleChargeSettings(vehicle.vin);
            const chargeState = await this.bmwClientAPI.vehicleChargeState(vehicle.vin);
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
        await this.login();

        const vehicles = await this.vehicles(vin);
        for (const vehicle of vehicles) {
            vehicle.event = await this.bmwClientAPI.lock(vehicle.vin)
            console.log(`${vehicle.attributes?.model} (${vehicle.vin}): Locking...`)
        }
        await this._pollForStatusChange(vehicles.map(v => v.event));

        return vehicles;
    }

    async unlock(vin = null) {
        await this.login();

        const vehicles = await this.vehicles(vin);
        for (const vehicle of vehicles) {
            vehicle.event = await this.bmwClientAPI.unlock(vehicle.vin)
            console.log(`${vehicle.attributes?.model} (${vehicle.vin}): Unlocking...`)
        }
        await this._pollForStatusChange(vehicles.map(v => v.event));

        return vehicles;
    }

    async flashLights(vin = null) {
        await this.login();

        const vehicles = await this.vehicles(vin);
        for (const vehicle of vehicles) {
            vehicle.event = await this.bmwClientAPI.flashLights(vehicle.vin)
            console.log(`${vehicle.attributes?.model} (${vehicle.vin}): Flashing Lights...`)
        }
        await this._pollForStatusChange(vehicles.map(v => v.event));

        return vehicles;
    }

    async honkHorn(vin = null) {
        await this.login();

        const vehicles = await this.vehicles(vin);
        for (const vehicle of vehicles) {
            vehicle.event = await this.bmwClientAPI.honkHorn(vehicle.vin);
            console.log(`${vehicle.attributes?.model} (${vehicle.vin}): Honking...`);
        }
        await this._pollForStatusChange(vehicles.map(v => v.event));

        return vehicles;
    }

    async startClimate(vin = null) {
        await this.login();

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
        await this.login();

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
        await this.login();

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
        await this.login();
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
}

module.exports = BMWClient;