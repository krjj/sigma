const puppeteer = require("puppeteer/lib/Puppeteer");
const rp = require('request-promise');
const moment = require('moment');
const config = require('./config');
const os = require('os');
const path = require('path');
const SimpleNodeLogger = require('simple-node-logger');


log = SimpleNodeLogger.createSimpleLogger({
    logFilePath: path.join(os.homedir(), '.sigma', 'sigmalog.log'),
    timestampFormat: 'YYYY-MM-DD HH:mm:ss.SSS'
});

log.setLevel('error');

var isloggedin = false;
var system_status_data_lsr = null; //last sent record to api
var system_status_data = null;
var system_status_recent_ts = Date.now();
var deviceInfo = {
    machineId: '',
    machineName: ''
};
var addDelay = false;


function updateLSR(data) {

    if (system_status_data_lsr == null) {
        system_status_data_lsr = {
            mode: data.Mode,
            psi: data.PSI,
            temperature: data.Temperature,
            hasChanged: true
        }
    } else {
        if (system_status_data_lsr.hasChanged == false && (system_status_data_lsr.mode != data.Mode || system_status_data_lsr.temperature != data.Temperature || system_status_data_lsr.psi != data.PSI)) {
            console.log("Changed.", moment().format("YYYY-MM-DD hh:mm:ss.SSS"));
            console.log("From : ", system_status_data_lsr);
            system_status_data_lsr = {
                mode: data.Mode,
                psi: data.PSI,
                temperature: data.Temperature,
                hasChanged: true
            }
            console.log("To : ", system_status_data_lsr);
            console.log("----------------------------------------\n")
        }
    }




}

async function run() {
    const browser = await puppeteer.launch({
        executablePath: config.brwExecPath,
        args: ["--no-sandbox"],
        headless: true
    }).catch((e) => {
        console.log("Cannot launch browser");
        log.error("[systatus] Cannot launch browser");
        process.exit();
    });
    // path.join(process.cwd(), config.brwExecPath)
    const page = await browser.newPage();
    page.setRequestInterceptionEnabled(true); // intercept all requests made by browser

    //event listeners for request and response
    page.on('request', (request) => {
        request.continue();
    });

    page.on('response', async (response) => {
        try {
            //if system status response then store the data if buffer
            if (response.status == 200 && response.url == config.getEndpoint.host + '/' + config.getEndpoint.path) {
                let responseJSON = await response.json();
                if (responseJSON['0'] == 1 && responseJSON['1'] == 2 && responseJSON['3'] != undefined) {
                    system_status_data = {
                        'PSI': responseJSON['3']['0'].Value,
                        'Time': responseJSON['3']['1'].Value,
                        'Temperature': responseJSON['3']['2'].Value,
                        'Mode': responseJSON['3']['3'].Value,
                        'Key': responseJSON['3']['5'].Value,
                        'pA': responseJSON['3']['7'].Value,
                        'Run': responseJSON['3']['8'].Value,
                        'Load': responseJSON['3']['9'].Value,
                        'Mode': responseJSON['3']['3'].Value,
                        'Maintenance': responseJSON['3']['10'].Value
                    };

                    updateLSR(system_status_data);

                    system_status_recent_ts = Date.now();
                } else if (responseJSON['0'] == 1 && responseJSON['1'] == 7 && responseJSON['2'] == 0 && responseJSON['3'] != undefined) {
                    deviceInfo.machineName = responseJSON['3']['CompSeqNum'] + '-' + responseJSON['3']['CompType'];
                    deviceInfo.machineId = responseJSON['3']['SN'];
                    console.log('Machine Info Acquired.');
                }
            } else if (response.status == 200 && response.url == config.getEndpoint.host + '/' + 'logout.html') {
                console.log('Logged out.');
                process.exit();
            } else if (response.status == 200 && response.url == config.getEndpoint.host + '/' + 'login.html') {
                if (isloggedin == true) {
                    console.log('Logged out (FORCED).');
                    process.exit();
                }
            }
        } catch (e) {
            //console.log('');
        }
    });

    await page.goto(config.getEndpoint.host + '/' + config.getEndpoint.path, {
        timeout: 30000,
        waitUntil: ['load', 'networkidle0', 'domcontentloaded']
    }).then(async () => {
        isloggedin = true;
        console.log('Login page opened.');
        await page.tap(config.selectors.LOGIN_USER_NAME);
        await page.type(config.login.username, {
            delay: 100
        });
        await page.tap(config.selectors.LOGIN_PASSWORD);
        await page.type(config.login.password, {
            delay: 100
        });
        await page.click(config.selectors.LOGIN_BUTTON);
    }).catch((e) => {
        console.log('Cannot open login page.');
        process.exit();
    });

    await page.waitForSelector(config.selectors.DASHBOARD_SYSTEM_STATUS, {
        timeout: 35000
    }).then(async () => {
        isloggedin = true;
        console.log('Logged In.\nChanging account settings (Time and Pressure unit).');
        await page.tap('#div_link_settings');
        await page.waitFor(5000);

        //change temp and pressure unit to f and psi
        try {
            await page.evaluate("JSON_SetUnitSettings({0:0,1:3})");
            await page.evaluate("JSON_SetUnitSettings({0:1,1:2})");
        } catch (e) {
            throw e;
        }

        await page.waitFor(3000);
        await page.click(config.selectors.DASHBOARD_SYSTEM_STATUS);
        console.log('System status page opened. Recording will start in few seconds.');
        startRecording();
    }).catch((e) => {
        console.log('Cannot login/or change settings.');
        process.exit();
    });

}


function startRecording() {
    system_status_recent_ts = Date.now();
    setInterval(async function () {
        if (Date.now() - addDelay > config.failureDelay) {
            addDelay = null;
        }
        if (system_status_data != null && addDelay == null && system_status_data_lsr.hasChanged == true) {
            system_status_data_lsr.hasChanged = false;
            let payload = system_status_data;
            system_status_data = null;
            await sendData(payload);
        } else {
            if (Date.now() - system_status_recent_ts > config.networkOutageMs) {
                console.log('Network outage detected.');
                process.exit();
            }
        }
    }, config.pollFrequencySYSTAT);
}

async function sendData(data) {
    let options = {
        method: config.sendEndpoint.method,
        url: config.sendEndpoint.url,
        headers: {
            'cache-control': 'no-cache',
            'content-type': 'application/json'
        },
        body: {
            PSI: data.PSI,
            Time: data.Time,
            Temperature: data.Temperature,
            Mode: data.Mode,
            Key: data.Key,
            PA: data.pA,
            Run: data.Run,
            Load: data.Load,
            Maintenance: data.Maintenance,
            StartTime: moment().format("YYYY-MM-DD hh:mm:ss.SSS"),
            EndTime: moment().format("YYYY-MM-DD hh:mm:ss.SSS"),
            MachineID: deviceInfo.machineId,
            MachineName: deviceInfo.machineName,
            AIR200: '',
            AIR201: '',
            AIR202: '',
        },
        json: true,
        timeout: 10000
    };
    //console.log('Request made on', options.body.EndTime, ongoingRequests);
    rp(options).then(function (r) {
            console.log('Send [system_status] request success', 'ID', r.Model.ID);
        })
        .catch(function (err) {
            if (err.statusCode == 500) {
                log.error("Network Request Failed (system_stat) | Server Response : ", err.response.body.Message);
            }
            addDelay = Date.now();
        });
}


process.on('unhandledRejection', error => {
    if (/network.continueinterceptedrequest/i.test(error.message)) {
        //ignore error
    }
});


process.on('SIGINT', () => {
    console.log('Received SIGINT.  Press Control-D to exit.');
    process.exit();
});




run();