/* eslint-disable require-jsdoc */
const { Buffer } = require('node:buffer');
const fs = require('fs');
const {fetch} = require('@adobe/fetch').keepAlive();

const {sleep, uuid4, generate, sha256Base64} = require('./utils');
const IniFile = require('./inifile');
const {stringify} = require('./stringify');
const { start } = require('node:repl');
// const stringify = JSON.stringify;
const DEFAULT_SESSION_ID = uuid4();
const CACHE = new Map();

const Regions = {
    NORTH_AMERICA: "na",
    REST_OF_WORLD: "row",
    CHINA: "cn",
}

const Servicea = {
    LIGHT_FLASH: "light-flash",
    VEHICLE_FINDER: "vehicle-finder",
    DOOR_LOCK: "door-lock",
    DOOR_UNLOCK: "door-unlock",
    HORN: "horn-blow",
    AIR_CONDITIONING: "climate-now",
    CHARGE_NOW: "CHARGE_NOW",
}

const UA = {
    [Regions.NORTH_AMERICA]: {
        host: "cocoapi.bmwgroup.us",
        ocpApimSubscriptionKey: "MzFlMTAyZjUtNmY3ZS03ZWYzLTkwNDQtZGRjZTYzODkxMzYy",
        version: "2.12.0(19883)",
    },

    [Regions.REST_OF_WORLD]: {
        host: "cocoapi.bmwgroup.com",
        ocpApimSubscriptionKey: "NGYxYzg1YTMtNzU4Zi1hMzdkLWJiYjYtZjg3MDQ0OTRhY2Zh",
        version: "2.12.0(19883)",
    },

    // [Regions.CHINA]: {
    //     host: "myprofile.bmw.com.cn",
    //     aes: {
    //         key: "UzJUdzEwdlExWGYySmxLYQ==",
    //         iv: "dTFGUDd4ZWRrQWhMR3ozVQ==",
    //     },
    //     version: "2.3.0(13603)",
    // }
}


const log = console;

class BMWClientAPI {
    constructor(username, password, geo, auth = {path: '~/.bmw', section: 'default'}) {
        const ini = IniFile.read(
            process.env.BMW_PATH || auth.path,
            process.env.BMW_SECTION || auth.section);
        this.auth = Object.assign({
            email: username || process.env.BMW_EMAIL || ini.email,
            password: password || process.env.BMW_PASSWORD || ini.password,
            geo: geo || process.env.BMW_GEO || ini.geo || Regions.NORTH_AMERICA,
            session: process.env.BMW_SESSION || ini.session || DEFAULT_SESSION_ID,
        }, auth);

        if (fs.existsSync(`${process.env.HOME}/.bmwsession.json`)) {
            try {
                this._token = JSON.parse(fs.readFileSync(`${process.env.HOME}/.bmwsession.json`, 'utf8'));
            }
            catch {

            }
        }
    }

    get brand() {return "bmw"};
    get region() {return this.auth?.geo};
    get host() {
        return UA[this.auth.geo]?.host;
    }

    get version() {
        return UA[this.auth.geo]?.version;
    }

    get ocpApimSubscriptionKey() {
        try {
            const b64Token = Buffer.from(UA[this.auth.geo]?.ocpApimSubscriptionKey, 'base64');
            return b64Token.toString();
        }
        catch {
        }

        return UA[this.auth.geo]?.ocpApimSubscriptionKey;
    }

    set token(val) {
        this._token = val;
        if (val) {
            this._token.expires = Date.now() + (this._token.expires_in || 0);
            fs.writeSync(fs.openSync(`${process.env.HOME}/.bmwsession.json`, 'w'), JSON.stringify(this._token));
        }
    }

    get token() {
        return this._token;
    }

    set session(val) {
        if (val) this.auth.session = val;
    }

    get session() {
        return this.auth?.session;
    }

    async get(path = '/', headers = {}, autologin = true, httpErrorAsError = true) {
        return await this._request('GET', path, null, headers, 0, autologin, httpErrorAsError);
    }

    async post(path = '/', body = null, headers = {}, autologin = true, httpErrorAsError = true) {
        return this._request('POST', path, body, headers, null, autologin, httpErrorAsError);
    }

    async _request(method = 'GET', path = '/', body = null, headers = {}, maxTTL = null, autologin = true, httpErrorAsError = true) {
        // first invocation we refresh the API tokens
        if (autologin) await this.login();
        const targetPath = path
            .replace('{accountID}', this.accountID)
            .replace('{clientID}', this.clientID);

        if (CACHE.has(method + targetPath) && maxTTL > 0) {
            const cache = CACHE.get(method + targetPath);
            const lastModified = Date.parse(cache.headers.get('last-modified') || cache.headers.get('date') || 0);
            if (lastModified + (maxTTL * 1000) > Date.now()) {
                return cache._body;
            }
            else {
                // to avoid pile-ons, let's use stale cache for 10s
                // TODO: make this work for cache misses too?
                cache.headers.set('last-modified', (new Date(Date.now() + 3 * 1000)).toISOString());
            }
        }

        const correlationID = uuid4();
        const reqHeaders = Object.assign({
            // 'Locale': 'en_US',
            'Accept-Language': 'en-US',
            'x-raw-locale': 'en-US',
            // 'Accept': '*/*',
            'User-Agent': 'Dart/2.14 (dart:io)',
            'X-User-Agent': `android(SP1A.210812.016.C1);${this.brand};${this.version};${this.region}`,
            'bmw-session-id': this.auth.session,
            'bmw-units-preferences': 'd=KM;v=L',
            "bmw-current-date": new Date().toISOString(),
            '24-hour-format': 'true',
            "x-identity-provider": "gcdm",
            "x-correlation-id": correlationID,
            "bmw-correlation-id": correlationID,
            "bmw-is-demo-mode-active": false,
            "x-cluster-use-mock": "never",
            "country": "CA", //TODO: replace country
        }, headers);
        if (this.token?.access_token && !reqHeaders.Authorization) reqHeaders.Authorization = `Bearer ${this.token.access_token}`;

        const options = {method, headers: reqHeaders, body, redirect: 'manual'};
        if (body) {
            options.body = body;
            // options.headers['Content-Type'] = 'application/x-www-form-urlencoded';
            // options.body = JSON.stringify(body);
            // options.headers['Content-Type'] = 'application/json';
        }

        log.info(`${method} ${targetPath} @${maxTTL}`);
        log.debug(options);
        const urlPrefix = targetPath.startsWith('http') ? '' : `https://${this.host}`;
        const res = await fetch(`${urlPrefix}${targetPath}`, options).catch(async e => {
            if (!/ECONNRESET|ETIMEDOUT|ESOCKETTIMEDOUT|disconnected/.test(e.message)) log.error(e);
            // TODO: handle network errors more gracefully
            if (autologin) return null;
            return Promise.reject(e);
        });
        if (!res || res === {}) {
            await this.login(true); // force a login on network connection loss
            return await this._request(method, path, body, maxTTL, false);
        }
        log.debug(res.status + ' ' + res.statusText);
        log.debug(Object.fromEntries(res.headers.entries()));
        // TODO: deal with network failures

        if (/application\/json/.test(res.headers.get('content-type'))) {
            const json = await res.json();
            res._body = json; // stash it for the cache because .json() isn't re-callable
        }
        else if (/text/.test(res.headers.get('content-type'))) {
            const txt = await res.text();
            res._body = txt; // stash it for the cache because .json() isn't re-callable
        }
        else {
            // TODO: what happens if the buffer isn't fully consumed?
            res._body = Buffer.from(await res.arrayBuffer());
        }
        log.debug(stringify(res._body))
        if (res.status === 302) {
            res._body = res.headers.get('location');
        }
        else if (res.status === 401) {
            // if the API call resulted in 401 Unauthorized (token expired?), try logging in again.
            if (autologin) {
                await this.login(true);
                return this._request(method, path, body, maxTTL, false, httpErrorAsError);
            }
            // fallback
            // TODO: handle error states more gracefully
            log.error(`${method} ${targetPath} (${res.headers.get('status') || res.status + ' ' + res.statusText})`);
            log.error(res?._body ?? Object.fromEntries(res.headers));
            if (httpErrorAsError) {
                throw new Error(res.headers.get('status'));
            }
        }
        else if (res.status >= 500) {
            // TODO: how do we get out of infinite retry?
            log.error(`RETRY: ${method} ${targetPath} (${res.headers.get('status') || res.status + ' ' + res.statusText})`);
            this.token = null; // force a re-login if 5xx errors
            await sleep(1000);
            return this._request(method, path, body, maxTTL, false, httpErrorAsError);
        }
        else if (res.status === 429) {
            // TODO: how do we get out of infinite retry?
            log.error(`RETRY: ${method} ${targetPath} (${res.headers.get('status') || res.status + ' ' + res.statusText})`);
            await sleep(500);
            return this._request(method, path, body, maxTTL, false, httpErrorAsError);
        }
        else if (res.status === 409) {
            if (httpErrorAsError) {
                if (!/busy/.test(res?._body?.message)) {
                    const status = res.headers.get('status') || res.status + ' ' + res.statusText;
                    throw new Error(`${method} ${targetPath} (${status})`);
                }
            }
        }
        else if (res.status >= 400) {
            const status = res.headers.get('status') || res.status + ' ' + res.statusText;
            log.error(`${method} ${targetPath} (${status})`);
            log.error(Buffer.from(res?._body).toString() ?? Object.fromEntries(res.headers));
            if (httpErrorAsError) {
                throw new Error(`${method} ${targetPath} (${status})`);
            }
        }
        // TODO: what about other 3xx?
        else if (res.status === 200) {
            if (method === 'GET') {
                CACHE.set(method + targetPath, res);
            }
        }

        if (method !== 'GET') {
            CACHE.delete('GET' + path);
        }
        return res._body;
    }

    async getUrl(url) {
        return await this.get(`${url}`);
    }


    async oauthConfig() {
        const correlationID = uuid4();

        const configHeaders = {
            "ocp-apim-subscription-key": this.ocpApimSubscriptionKey,
            "bmw-session-id": this.session,
            "x-identity-provider": "gcdm",
            "x-correlation-id": correlationID,
            "bmw-correlation-id": correlationID,
        };

        return await this.get('/eadrax-ucs/v1/presentation/oauth/config', configHeaders, false);
    }
    async login(force = false, httpErrorAsError = true) {
        await this.refresh(force);

        if (!force && this.token) return;
        if (!this.auth?.email || !this.auth?.password) throw new Error('Email or Password is blank');

        const oauthConfig = await this.oauthConfig();
        // Generate OAuth2 Code Challenge + State
        const codeVerifier = generate(86)
        // Set up authenticate endpoint
        const authData = new URLSearchParams(Object.entries({
            "client_id": oauthConfig.clientId,
            "response_type": "code",
            "redirect_uri": oauthConfig.returnUrl,
            "state": generate(22),
            "nonce": "login_nonce",
            "scope": (oauthConfig.scopes ?? []).join(" "),
            "code_challenge": sha256Base64(codeVerifier),
            "code_challenge_method": "S256",

            "grant_type": "authorization_code",
            "username": this.auth.email,
            "password": this.auth.password
        }));

        // Call authenticate endpoint first time (with user/pw) and get authentication
        const authUrl = oauthConfig.tokenEndpoint?.replace("/token", "/authenticate");
        const authResponse = await this.post(authUrl, authData, {}, false, httpErrorAsError)

        authData.set("authorization", authResponse?.redirect_to?.split("authorization=")[1]?.split("&")[0]);
        authData.delete("grant_type");
        authData.delete("username");
        authData.delete("password");

        const headers = {
            Cookie: `GCDMSSO=${authData.get('authorization')}`,
        }

        // With authorization, call authenticate endpoint second time to get code
        const authComplete = await this.post(authUrl, authData, headers, false, httpErrorAsError)

        const code = authComplete.split('code=')[1]?.split("&")[0];
        // With code, get token
        const grantData = new URLSearchParams(Object.entries({
            "code": code,
            "code_verifier": codeVerifier,
            "redirect_uri": oauthConfig.returnUrl,
            "grant_type": "authorization_code",
        }));

        headers.Authorization = "Basic " + Buffer.from(`${oauthConfig.clientId}:${oauthConfig.clientSecret}`).toString('base64');
        // return;
        this.token = await this.post(oauthConfig.tokenEndpoint, grantData, headers, false, httpErrorAsError);
    }

    async refresh(force = false) {
        if (!this.token?.refresh_token) return;
        if (!force && !this.token.expires < Date.now()) return;

        const oauthConfig = await this.oauthConfig();

        const data = new URLSearchParams(Object.entries({
            "redirect_uri": oauthConfig.returnUrl,
            "scope": (oauthConfig.scopes ?? []).join(" "),
            "grant_type": "refresh_token",
            "refresh_token": this.token.refresh_token
        }));

        const headers = {
            Authorization: "Basic " + Buffer.from(`${oauthConfig.clientId}:${oauthConfig.clientSecret}`).toString('base64')
        }

        try {
            this.token = await this.post(oauthConfig.tokenEndpoint, data, headers, false);
        }
        catch {
            this.token = null;
        }
    }

    async vehicles() {
        return await this.get(`/eadrax-vcs/v4/vehicles`);
    }

    async vehicleState(vin) {
        return await this.get(`/eadrax-vcs/v4/vehicles/state`, {"bmw-vin": vin} );
    }
    async vehicleRecall(vin) {
        return await this.get(`/eadrax-recallcs/v2/recalls?vin=${vin}`, {"bmw-gcid": "b4802a8d-d2eb-4518-b0bc-23b5cb32e0de"});
    }

    async userFlags() {
        return await this.get(`/eadrax-fts/v1/flags`);
    }

    async vehicleImages(vin, view) {
        // SideViewLeft, RearView, FrontView, SideViewRight
        return await this.get(`/eadrax-ics/v3/presentation/vehicles/${vin}/images?carView=${view}`)
    }

    VEHICLE_POI_URL = "/eadrax-dcs/v1/send-to-car/send-to-car"

    async vehicleChargeSettings(vin) {
        return await this.get(`/eadrax-crccs/v2/vehicles?fields=charging-profile&has_charging_settings_capabilities=true`, {"bmw-vin": vin});
    }
    async vehicleChargeState(vin) {
        const currentDate = new Date().toISOString();
        return await this.get(`/eadrax-cps/v2/vehicles?fields=charging-plan&current_date=${currentDate}&has_charging_settings_capabilities=true`, {"bmw-vin": vin});
    }

    async chargingStatistics(vin, date) {
        const currentDate = date?.toISOString() || new Date().toISOString();
        return await this.get(`/eadrax-chs/v1/charging-statistics?vin=${vin}&currentDate=${currentDate}`);
    }
    async chargingSessions(vin, year=new Date().getUTCFullYear(), month=(new Date().getMonth() + 1)) {
        // const iso8601_date = "2022-09-01T00:00:00Z"
        const startDate = `${year}-${String(month).padStart(2, '0')}-01T00%3A00%3A00.000Z`;
        return await this.get(`/eadrax-chs/v2/charging-sessions?next_token&date=${startDate}&location_id&max_results=40&include_date_picker=false`, {"bmw-vin": vin});
    }
    async chargingSessionDetails(vin, sessionId) {
        // const iso8601_date = "2022-09-01T00:00:00Z"
        const startDate = `${year}-${String(month).padStart(2, '0')}-01T00%3A00%3A00.000Z`;
        return await this.get(`/eadrax-chs/v2/charging-sessions/${sessionId}`, {"bmw-vin": vin});
    }
    async chargingSessionExport(vin, year=new Date().getUTCFullYear(), month=(new Date().getMonth() + 1)) {
        // const iso8601_date = "2022-09-01T00:00:00Z"
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        return await this.get(`/eadrax-chs/v1/charging-sessions/generate-report?currentDate=${startDate}&format=xlsx&vin=${vin}`, {"bmw-vin": vin});
    }
    async tripSessions(vin, year=new Date().getUTCFullYear(), month=(new Date().getMonth() + 1)) {
        // const iso8601_date = "2022-09-01T00:00:00Z"
        const startDate = `${year}-${String(month).padStart(2, '0')}`;
        // eadrax-suscs/v1/vehicles/sustainability?timezone=-05%3A00
        // eadrax-suscs/v1/vehicles/sustainability/trips/history?date=2022-11&offset=0&limit=7&groupByWeek=true&timezone=-05%3A00
        return await this.get(`/eadrax-suscs/v1/vehicles/sustainability?timezone=-05%3A00`, {"bmw-vin": vin, "x-gcid": "b4802a8d-d2eb-4518-b0bc-23b5cb32e0de"});
    }
    async tripSessionsHistory(vin, year=new Date().getUTCFullYear(), month=(new Date().getMonth() + 1)) {
        // const iso8601_date = "2022-09-01T00:00:00Z"
        const startDate = `${year}-${String(month).padStart(2, '0')}`;
        // eadrax-suscs/v1/vehicles/sustainability?timezone=-05%3A00
        // eadrax-suscs/v1/vehicles/sustainability/trips/history?date=2022-11&offset=0&limit=7&groupByWeek=true&timezone=-05%3A00
        return await this.get(`/eadrax-suscs/v1/vehicles/sustainability/trips/history?date=${startDate}&offset=0&limit=7&groupByWeek=true&timezone=-05%3A00`, {"bmw-vin": vin, "x-gcid": "b4802a8d-d2eb-4518-b0bc-23b5cb32e0de"});
    }
    async tripSessionsStatistics(vin, year=new Date().getUTCFullYear(), month=(new Date().getMonth() + 1)) {
        // const iso8601_date = "2022-09-01T00:00:00Z"
        const startDate = `${year}-${String(month).padStart(2, '0')}`;
        // eadrax-suscs/v1/vehicles/sustainability?timezone=-05%3A00
        // eadrax-suscs/v1/vehicles/sustainability/trips/history?date=2022-11&offset=0&limit=7&groupByWeek=true&timezone=-05%3A00
        return await this.get(`/eadrax-suscs/v1/vehicles/sustainability/trips/statistics?date=${startDate}&timezone=-05%3A00`, {"bmw-vin": vin, "x-gcid": "b4802a8d-d2eb-4518-b0bc-23b5cb32e0de"});
    }

    async stopCharging(vin) {
        return await this.post(`/eadrax-crccs/v1/vehicles/${vin}/stop-charging`, {});
    }

    async startCharging(vin) {
        return await this.post(`/eadrax-crccs/v1/vehicles/${vin}/start-charging`, {});
    }

    async startClimate(vin) {
        return await this.post(`/eadrax-vrccs/v3/presentation/remote-commands/${vin}/climate-now?action=START`, {});
    }

    async stopClimate(vin) {
        return await this.post(`/eadrax-vrccs/v3/presentation/remote-commands/${vin}/climate-now?action=STOP`, {});
    }

    async lock(vin) {
        return await this.post(`/eadrax-vrccs/v3/presentation/remote-commands/${vin}/door-lock`, {});
    }

    async unlock(vin) {
        return await this.post(`/eadrax-vrccs/v3/presentation/remote-commands/${vin}/door-unlock`, {});
    }

    async flashLights(vin) {
        return await this.post(`/eadrax-vrccs/v3/presentation/remote-commands/${vin}/light-flash`, {});
    }

    async honkHorn(vin) {
        return await this.post(`/eadrax-vrccs/v3/presentation/remote-commands/${vin}/horn-blow`, {});
    }

    async remoteCommands(vin, serviceType, params = {}) {
        // /eadrax-vrccs/v3/presentation/remote-commands/{vin}/climate-now?action=STOP

        //climate-now
        //door-lock
        //light-flash
        //horn-blow
        const data = new URLSearchParams(Object.entries(params));
        return await this.post(`/eadrax-vrccs/v3/presentation/remote-commands/${vin}/${serviceType}?${data}`, {});
    }

    async remoteCommandsEventStatus(eventID) {
        return await this.post(`/eadrax-vrccs/v3/presentation/remote-commands/eventStatus?eventId=${eventID}`);
    }
}

// USER_AGENT = "Dart/2.14 (dart:io)"
// X_USER_AGENT = "android(SP1A.210812.016.C1);{brand};{app_version};{region}"


// AUTH_CHINA_PUBLIC_KEY_URL = "/eadrax-coas/v1/cop/publickey"
// AUTH_CHINA_LOGIN_URL = "/eadrax-coas/v2/login/pwd"
// AUTH_CHINA_TOKEN_URL = "/eadrax-coas/v1/oauth/token"

// REMOTE_SERVICE_POSITION_URL = REMOTE_SERVICE_BASE_URL + "/eventPosition?eventId={event_id}"

// VEHICLE_POI_URL = "/eadrax-dcs/v1/send-to-car/send-to-car"


// contact info for dealer
// https://cocoapi.bmwgroup.us/eadrax-ucs/v2/contacts

// app themes
// https://cocoapi.bmwgroup.us/eadrax-ucs/v1/customizations?localDate=2022-12-22T15%3A23%3A58.441973

// app usage
// https://cocoapi.bmwgroup.us/eadrax-ucs/v1/nps/config

// { "isActive": true, "userMarket": "CA" }
// https://cocoapi.bmwgroup.us/eadrax-excs/v1/explore/isFeatureEnabled

// { "globalState": "Active "warrantyList": [
// { "contractType": "SI "dateCondition": { "daysToExpire": 911, "endDate": "2025-06-19T00:00:00 "state": "Active" }, "description": "Service Inclusive - 3 years
// "distanceCondition": { "distanceToExpire": null, "endDistance": null, "state": "Unlimited "unit": null, "vehicleCurrentMileage": null }, "state": "Active" } ] }
// https://cocoapi.bmwgroup.us/eadrax-bsics/v2/warrantyplans/{vin}

// app features
// https://cocoapi.bmwgroup.us/eadrax-emob-hub/v1/features

// app links
// https://cocoapi.bmwgroup.us/eadrax-ucs/v1/presentation/weblinks?view=VehicleTab&isDarkMode=false&vin={vin}

// { "assistanceTracking": true, "geoInfoPassing": true, "level": 3, "phoneNumber": "18778470846" }
// https://cocoapi.bmwgroup.us/eadrax-rsacs/v2/capabilities/BMW

// service features
// https://cocoapi.bmwgroup.us/eadrax-servcs/v1/services?vin={vin}

// profile tab in app
// https://cocoapi.bmwgroup.us/eadrax-ucs/v1/presentation/profile-tab

// map destinations enabled
// https://cocoapi.bmwgroup.us/eadrax-dcs/v1/destinations/destination-tab

// ??
// https://cocoapi.bmwgroup.us/eadrax-dservcs/v1/recommendation
// ??
// https://cocoapi.bmwgroup.us/eadrax-ecs/v1/feature-toggle

//  { "id": "ae124a8b-bcef-446d-ae68-476c3945fc4c "isChargingHistoryOptIn": true }
// https://cocoapi.bmwgroup.us/eadrax-cdpc/v2/vehicle-settings
// https://cocoapi.bmwgroup.us/eadrax-suscs/v1/vehicles/sustainability?timezone=-05%3A00

// user jpeg
// https://cocoapi.bmwgroup.us/eadrax-ics/v1/presentation/avatar

// verify if we can sent to service
//  { "sendToCarEnabled": true }
// https://cocoapi.bmwgroup.us/eadrax-dcs/v1/send-to-car/{vin}/subservice-status

// {
//     "chargingSocketStatusShowInProgressEnabled": false,
//     "chargingSocketsStatusInProgressRefreshTime": 2,
//     "chargingSocketsStatusRefreshTime": 10,
//     "integratedPartners": {
//         "externalQrCodeLink": [],
//         "full": [],
//         "simpleLink": []
//     },
//     "isBmwChargingSupported": false,
//     "isChargeAndGoEnabled": false,
//     "isChargeNowForBusinessSupported": false,
//     "isChargingPricesEnabled": false,
//     "isChargingSocketsEnabled": false,
//     "isChargingSocketsStatusRefreshEnabled": false,
//     "isDcsChargingContractSupported": false,
//     "isDemoModeActive": false,
//     "isFindChargingEnabled": true,
//     "isMiniChargingSupported": false,
//     "pendingStateTimeout": 150
// }
// https://cocoapi.bmwgroup.us/eadrax-ccmcs/v1/settings

// navigation fav
// https://cocoapi.bmwgroup.us/eadrax-dcs/v3/favorites

// upcoming appointments
// https://cocoapi.bmwgroup.us/eadrax-oascs/v1/dealers/09263_1/booking-engine?vin={vin}&brand=BMW

// reports errors?
// https://cocoapi.bmwgroup.us/eadrax-rsu/v2/vehicles/status/

// { "updateStatus": "NO_UPDATE_NEEDED" }
// https://cocoapi.bmwgroup.us/eadrax-aucs/v1/update/update-info

// command history
// https://cocoapi.bmwgroup.us/eadrax-vrccs/v3/presentation/remote-history/{vin}

// theft recording logs
// https://cocoapi.bmwgroup.us/eadrax-r360/v1/recordings/vehicle/{vin}
// lat/long lookup to address
// POST https://cocoapi.bmwgroup.us/eadrax-r360/v1/vehicle/addresses
// get public key for encryption of image/video content from the car
// https://cocoapi.bmwgroup.us/eadrax-r360/v1/vehicle/{vin}/key
// request image / video for an event
// POST https://cocoapi.bmwgroup.us/eadrax-r360/v1/event/execute
// https://cocoapi.bmwgroup.us/eadrax-r360/v1/events/545275db-ed57-48e8-849e-7ff1e224705d


// {
//     "buttonState": "NO_BUTTON",
//     "cableLockState": "NO_ACTION",
//     "chargingSettings": {
//         "acCurrentLimit": "48A",
//         "acLimit": {
//             "acCurrentLimit": {
//                 "unit": "A",
//                 "value": 48
//             },
//             "acLimitValues": [
//                 6,
//                 7,
//                 8,
//                 9,
//                 10,
//                 11,
//                 12,
//                 13,
//                 14,
//                 15,
//                 16,
//                 20,
//                 32,
//                 48
//             ],
//             "isActive": false,
//             "isEditable": true,
//             "maxAcLimit": "48A",
//             "minAcLimit": "6A"
//         },
//         "chargingMode": "Charging in time slot (12:01AM – 7:59AM)"
//     },
//     "chargingState": {
//         "currentElectricPercentage": {
//             "unit": "%",
//             "value": 19.0
//         },
//         "minChargingTargetToWarning": 0,
//         "rangeElectric": {
//             "unit": "mi",
//             "value": 50.0
//         },
//         "targetSocPercentage": 80.0
//     },
//     "isButtonStateDisable": true,
//     "isCableLockStateDisable": true,
//     "isERouteEnabled": false,
//     "isERouteSocReached": false,
//     "sessionInformation": {
//         "leftTarget": {
//             "name": "Charging target",
//             "semantics": "Charging target 80%",
//             "unit": "%",
//             "value": "80"
//         },
//         "rightTarget": {
//             "name": "Ends at",
//             "semantics": "End time not available",
//             "value": "--:--"
//         }
//     },
//     "status": "STOPPED",
//     "timelineItems": [
//         {
//             "body": {
//                 "actionType": "CHARGING_TYPE_UNSPECIFIED",
//                 "isEnabled": true,
//                 "subtitle": "Today 9:23 PM",
//                 "title": "Plugged in"

// {
//     "buttonState": "RESTART_CHARGING",
//     "cableLockState": "NO_ACTION",
//     "chargingSettings": {
//         "acCurrentLimit": "48A",
//         "acLimit": {
//             "acCurrentLimit": {
//                 "unit": "A",
//                 "value": 48
//             },
//             "acLimitValues": [
//                 6,
//                 7,
//                 8,
//                 9,
//                 10,
//                 11,
//                 12,
//                 13,
//                 14,
//                 15,
//                 16,
//                 20,
//                 32,
//                 48
//             ],
//             "isActive": false,
//             "isEditable": true,
//             "maxAcLimit": "48A",
//             "minAcLimit": "6A"
//         },
//         "chargingMode": "Charge immediately"
//     },
//     "chargingState": {
//         "currentElectricPercentage": {
//             "unit": "%",
//             "value": 20.0
//         },
//         "minChargingTargetToWarning": 0,
//         "rangeElectric": {
//             "unit": "mi",
//             "value": 51.0
//         },
//         "targetSocPercentage": 80.0
//     },
//     "isButtonStateDisable": false,
//     "isCableLockStateDisable": true,
//     "isERouteEnabled": false,
//     "isERouteSocReached": false,
//     "sessionInformation": {
//         "leftTarget": {
//             "name": "Charging target",
//             "semantics": "Charging target 80%",
//             "unit": "%",
//             "value": "80"
//         },
//         "rightTarget": {
//             "name": "Ends at",
//             "semantics": "End time not available",
//             "value": "--:--"
//         }
//     },
//     "status": "STOPPED",
//     "timelineItems": [
//         {
//             "body": {
//                 "actionType": "CHARGING_TYPE_UNSPECIFIED",
//                 "isEnabled": true,
//                 "subtitle": "Today 10:04 PM",
//                 "title": "Plugged in"

module.exports = BMWClientAPI;
