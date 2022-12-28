# BMW Connected Drive SDK & CLI

BMW vehicles offer limited control and telemetry through the MyBMW app. This library uses the private APIs to enable scipting and integrations with third party tools.

## Quick Start

* `npm install -g https://github.com/colinbendell/bmw`
* Configuration [#authentication](#authentication)
* Use the `bmw` [CLI](#command-line-interface)

## Authentication

Authentication uses the MyBMW account credentials. It can be passed through to the library using one of three ways:

* environment variables `BMW_EMAIL`, `BMW_PASSWORD` and `BMW_GEO`
* config file located `~/.bmw` in the form of:

    ``` ini
    [default]
    email=user@example.com
    password=p@$$w0rd
    geo=na
    ```

* pass the values directly into the constructor `new BMWClientAPI(username, password, geo)`

> The valid `geo` values are: `na` (North America), `cn` (China) and `row` (Rest of World).

> NB: `na` is the only one that has been really tested so far

## Command Line Interface

The `./bmw` provides a number of commands to invoke the APIs through a shell script. Use `bmw --help` for expanded help details.

The available commands include:

* `bmw login` to test the auth credentials
* `bmw charge [vin]` to start charging the car
* `bmw climate [vin]` to start charging the car
* `bmw lock [vin]` to lock the vehicle
* `bmw unlock [vin]` to unlock a specific vehicle
* `bmw flash [vin]` to flash the lights
* `bmw honk [vin]` to unlock the vehicle
* `bmw list` list the vehicles associated with the account
* `bmw info [vin]` current status info of the vehicle
* `bmw status [vin]` build and configuration info of the vehicle
* `bmw trips [vin] [date]` list trip information for a given month
* `bmw charge-log [vin]` log of the charges for the vehicle

> The `[vin]` is optional in all cases. If absent, all vehicles are used.

> Protip: You can use parts of the model name instead of the `[vin]`. Eg: `bmw status iX`

## Library Overview

There are three main components to the library:

* `src/bmw-api.js` - API wrapper library that manages authentication (see #auth)
* `src/bmw.js` - the main business logic that wraps over the api calls
* `src/bmw-cli.js` - a convenience CLI for scripting and automation

## Debugging the MyBMW App

Extracting the current set of APIs is a bit of a challenge because the MyBMW app is built with [Flutter](https://flutter.dev/). While Flutter is a convenient dev environment, it doesn't use the OS provided network libraries like nsURLSession or HttpClient. This would make it easier to trace the Network access and the API calls using a standard MitM tooling approaches (proxy + root CA). Instead, Flutter apps roll their own network stack which requires a lot more work to intercept the applications network calls.

The simplest approach is:

1. Install [Android Studio](https://developer.android.com/studio)
2. Create a Virtual Device in the VDM (Virtual Device Manager). Currently My BMW needs Android 31+
3. Download the latest My BMW APK (either copy the installed APK from the play store install, or download from apkpure or other sources)
    * Use `adb root` then `adb pull /data/app/<hash>/de.bmw.connected.mobile20.na-<hash>/base.apk de.bmw.connected.mobile20.na.apk`
    * Downlaod from [apkmirror.com](www.apkmirror.com) or [apkpure.com](www.apkpure.com)
4. Install [Frida](https://frida.re/): `pip3 install frida-tools`
5. Use `Gadget` to wrap the APK:
    * Installing [objection](https://github.com/sensepost/objection): `pip3 install objection`
    * You might need to add `/build-tools` to your `PATH` and install apktool (`brew install apktool`)
    * Run  `objection patchapk -s de.bmw.connected.mobile20.na.apk`
    * Install the patched apk to the device
6. Install [Wireguard](https://www.wireguard.com/) on the android device
    * Available on the [Play Store](https://play.google.com/store/apps/details?id=com.wireguard.android) or [F-droid](https://f-droid.org/en/packages/com.wireguard.android/)
7. Install [mitmproxy](https://mitmproxy.org/): `brew install mitmproxy`
    * Start mitm in wireguard mode: `mitmdump --mode wireguard --showhost --flow-detail 3 cocoapi.bmwgroup.us`
    * Install the wireguard profile as directed in the output
    * NB: mitm with wireguard in docker on mac doesn't work because of the virtualized network stack. Best to run it in a terminal or use an rpi
    * NB: current version of mitm assumes the 10.0.0/24 network is availble. Make sure your current network is on a different subnet
8. Download the Frida script as per the [Flutter instructions](https://blog.nviso.eu/2022/08/18/intercept-flutter-traffic-on-ios-and-android-http-https-dio-pinning/)
    * Download [disable-flutter-tls.js](https://github.com/NVISOsecurity/disable-flutter-tls-verification/blob/main/disable-flutter-tls.js) or for the more adventurous you can use the more [comprehensive version](https://gist.github.com/incogbyte/1e0e2f38b5602e72b1380f21ba04b15e)
9. Intercept traffic
    * Connect to the wireguard server
        > Not required, but to test that browser interception is working, visit http://mitm.it and install the rootCA using the instructions)
    * Launch the bmw app on the VMD. It will pause until you run frida
    * on the local terminal run frida with gadget: `frida -U gadget -l disable-flutter-tls.js`

## Notes about BMW's API

The BMW app suffers from [Conway's Law](https://en.wikipedia.org/wiki/Conway's_law):
> Any organization that designs a system (defined broadly) will produce a design whose structure is a copy of the organization’s communication structure.

This is apparent in the way that the authentication system is bifurcated across 3 geos (`na`, `cn` and `row`) as well as the way it uses many different application paths for similar but discrete functions of the same component (eg: `/eadrax-crccs/v1/vehicles/` vs `/eadrax-chs/v2/charging-sessions` vs `/eadrax-cps/v2/vehicles`).

Worse yet is the inconsistent use of `?`query parameters vs `/`url path parameters, json body parameters and http headers. Take the VIN parameter as an example: for `/charging-statistics?vin=` it is a query parameter, for `/vehicles/${vin}/start-charging` and more bizarely for `/vehicles/state` it needs to be an http header `bmw-vin:`.

Other oddities to be aware of:
* The `?date=` parameter is only `yyyy-dd` formatted and not a real date for `/v1/vehicles/sustainability/trips/history`
* The `?timezone=` is also necessary because the ?date= field isn't a proper ISO8701 formatted date which would have provided the timezone relative offset
* The `?date=` parameter must be GMT relative with millisecond precision for `/v2/charging-sessions`
* But only the month is actually used in the `?date=` parameter as all sessions in that month will be provided
* Unless of course if you add `?include_date_picker=true` which will discregard the `?date=` field and use the current month instead. There is no real value for the extra json values so just use `?include_date_picker=false`.
* Some APIs require a Global Catalog ID HTTP Header. Use `x-gcid: ...` for `/v1/vehicles/sustainability/trips/history` and `bmw-gcis: ...` for `/v2/recalls`. Why the inconsistency? What does this do?
* The GCID values appear to matter. See the sourcecode for specific values for each API.
* Some API teams clearly never read the [JSON spec](https://www.rfc-editor.org/rfc/rfc7493) and redundantly annotate `date/time` fields with `timeUnit` values. eg: `"start": { "time": "2022-12-23T03:44:42Z", "timeUnit": "ISO8601" },` instead of simply `"start": "2022-12-23T03:44:42Z"`.
* Sending commands uses a two step pattern of creating a POST action and then querying the end point. For example `POST /v3/presentation/remote-commands/...` then `GET /v3/presentation/remote-commands/eventStatus?eventId=...`
* There are different Remote Command endpoints `/eadrax-vrccs/v3/presentation/remote-commands`, `/eadrax-vrccs/v1/vehicles`, `/eadrax-r360/v1/event/execute`, `/eadrax-r360/v1/vehicle/addresses`, etc
* The mix of application paths `eadrax-vrccs` and `eadrax-vrccs` for the same set of remote commands is another example of different engineering teams with split ownership
* auth is done with Microsoft's API Management Open Product (hence the `ocp-apim-subscription-key` in the oauth dance)
* There are multiple session tokens used `bmw-session-id` for most api contexts, and `GCDMSSO` Cookie for auth status.
* This is in addition to valid `Authorization: Bearer` oauth api tokens.
* It's unclear why bmw requires a session context when they provide oauth keys. I suspect that there are 3 different infrastructur teams at play managing server affinity, authorization and other contexts.
* Many of the APIs also do content-negotiation through the use of HTTP headers. For example `bmw-units-preferences: d=KM;v=L`, `country: uk`, `24-hour-format: true`.
* Despite doing conneg with these HTTP headres, the response is missing `Vary:` to communicate the variances of the content
* `bmw-correlation-id` and `x-correlation-id` appear to be OTP Spans for tracing. It's kind of silly really to have the same header twice.