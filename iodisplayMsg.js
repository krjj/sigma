const puppeteer = require("puppeteer/lib/Puppeteer");
const rp = require('request-promise');
const moment = require('moment');
const config = require('./config');
const os = require('os');
const path = require('path');
const store = require('data-store')('sigma-config', {
    cwd: path.join(os.homedir(), '.sigma')
});

var iom2_data = null;
var iom2_recent_ts = Date.now();
var messages_data = [];
var messages_recent_ts = Date.now();
var messages_mrf_ts = {
    current: null,
    compressor: null,
    system: null,
    diagnosis: null,
    lastChecked: null
};
var deviceInfo = {
    machineId: '',
    machineName: ''
};
var isloggedin = false;

if (store.get('messagesTS') != undefined) {
    messages_mrf_ts = store.get('messagesTS');
}

async function run() {
    const browser = await puppeteer.launch({
        executablePath: config.brwExecPath,
        headless: true
    });
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
                if (responseJSON['0'] == 'datarecorder' && responseJSON['1'] == 10 && responseJSON['2'] != {}) { //IO Display 2ND IOM
                    iom2_data = {
                        AIR200: toTemp(responseJSON['3']['iom2']['airs'][0]),
                        AIR201: toTemp(responseJSON['3']['iom2']['airs'][1]),
                        AIR202: toTemp(responseJSON['3']['iom2']['airs'][2])
                    };
                    //console.log("IOM2 Data Acquired.");
                    iom2_recent_ts = Date.now();
                } else if (responseJSON['0'] == 1 && responseJSON['1'] == 7 && responseJSON['2'] == 0 && responseJSON['3'] != undefined) { //Device info
                    deviceInfo.machineName = responseJSON['3']['CompSeqNum'] + '-' + responseJSON['3']['CompType'];
                    deviceInfo.machineId = responseJSON['3']['SN'];
                    console.log('Machine Info Acquired.');
                } else if (responseJSON['0'] == 3 && responseJSON['1'] == 1 && responseJSON['2'] == 0 && responseJSON[3] != undefined) { // Messages
                    let reqpost = JSON.parse(response.request().postData);
                    if (reqpost['0'] == 3 && reqpost['1'] == 1 && reqpost['2'][0] == 0 && reqpost['2'][1] == 0 && reqpost['2'][2] == 101) {
                        toPayloadArr('current', responseJSON[3]);
                        messages_mrf_ts.lastChecked = Date.now();
                        await page.click(config.selectors.MESSAGES_COMPRESSOR);
                    }
                    if (reqpost['0'] == 3 && reqpost['1'] == 1 && reqpost['2'][0] == 1 && reqpost['2'][1] == 0 && reqpost['2'][2] == 101) {
                        toPayloadArr('compressor', responseJSON[3]);
                        messages_mrf_ts.lastChecked = Date.now();
                        await page.click(config.selectors.MESSAGES_SYSTEM);
                    }
                    if (reqpost['0'] == 3 && reqpost['1'] == 1 && reqpost['2'][0] == 2 && reqpost['2'][1] == 0 && reqpost['2'][2] == 101) {
                        toPayloadArr('system', responseJSON[3]);
                        messages_mrf_ts.lastChecked = Date.now();
                        await page.click(config.selectors.MESSAGES_DIAGNOSIS);
                    }
                    if (reqpost['0'] == 3 && reqpost['1'] == 1 && reqpost['2'][0] == 3 && reqpost['2'][1] == 0 && reqpost['2'][2] == 101) {
                        toPayloadArr('diagnosis', responseJSON[3]);
                        messages_mrf_ts.lastChecked = Date.now();
                        await page.click(config.selectors.IODISPLAY);
                    }
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
            if (!/Error: Protocol error/i.test(e)) {
                console.log(e);
            }

        }
    });

    await page.goto(config.getEndpoint.host + '/' + config.getEndpoint.path, {
        timeout: 30000,
        waitUntil: ['load', 'networkidle0', 'domcontentloaded']
    }).then(async () => {
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
        console.log('Cannot open login page...');
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
            await page.evaluate("JSON_SetUnitSettings({0:6,1:0})");
        } catch (e) {
            throw e;
        }
        await page.waitFor(3000);

        await page.click(config.selectors.IODISPLAY);
        console.log('I/O Display page opened. Recording will start in few seconds.');

        /*page.click(config.selectors.MESSAGES);
        console.log('Messages page opened. Recording will start in few seconds.');*/

        startRecording(page);
        startRecordingMESG();

    }).catch((e) => {
        console.log('Cannot login/or change settings...');
        process.exit();
    });

}



async function startRecording(page) {
    iom2_recent_ts = Date.now();
    await page.tap(config.selectors.MESSAGES);
    setInterval(async function () {
        await page.tap(config.selectors.MESSAGES);
        if (iom2_data != null) {
            let payload = iom2_data;
            iom2_data = null;
            await sendDataIOM2(payload);
        } else {
            if (Date.now() - iom2_recent_ts > config.networkOutageMs * 1.5) { //wait for outage limit x factor = 90secs(default)
                console.log('Network outage detected [IOM2] ...');
                process.exit();
            }
        }
    }, config.pollFrequencyIOM2);
}

function startRecordingMESG() {
    messages_mrf_ts.lastChecked = Date.now();
    setInterval(async function () {
        //console.log('Message Payload Container Length : ', messages_data.length);
        if (messages_data.length > 0) {
            let payload = messages_data;
            await sendDataMSEG(payload);
        } else {
            if (Date.now() - messages_mrf_ts.lastChecked > config.networkOutageMs * 3) { //wait for outage limit x factor
                console.log('Network outage detected [MESG] ...');
                process.exit();
            }
        }
    }, config.pollFrequencyMESG);
}

async function sendDataMSEG(data) {
    let options = {
        method: config.sendEndpointMESG.method,
        url: config.sendEndpointMESG.url,
        headers: {
            'cache-control': 'no-cache',
            'content-type': 'application/json'
        },
        body: data,
        json: true
    }
    rp(options).then(function (r) {
        //persist messages.mrf_ts to disk HERE ..
        store.set('messagesTS', messages_mrf_ts);
        messages_data = []; //clear the payload holder
        console.log('Send [MESSAGE_TAB ALL] request success');
    }).catch(function (err) {
        console.log('Send [MESSAGE_TAB ALL] request failed');
    });
}

async function sendDataIOM2(data) {
    let options = {
        method: config.sendEndpoint.method,
        url: config.sendEndpoint.url,
        headers: {
            'cache-control': 'no-cache',
            'content-type': 'application/json'
        },
        body: {
            PSI: '',
            Time: '',
            Temperature: '',
            Mode: '',
            Key: '',
            PA: '',
            Run: '',
            Load: '',
            Maintenance: '',
            StartTime: moment().format("YYYY-MM-DD hh:mm:ss.SSS"),
            EndTime: moment().format("YYYY-MM-DD hh:mm:ss.SSS"),
            MachineID: deviceInfo.machineId,
            MachineName: deviceInfo.machineName,
            AIR200: data.AIR200,
            AIR201: data.AIR201,
            AIR202: data.AIR202
        },
        json: true
    }
    rp(options).then(function (r) {
        console.log('Send [IOM2] request success', 'ID', r.Model.ID);
    }).catch(function (err) {
        console.log('Send [IOM2] request failed');
    });
}


function toTemp(val) {
    if (val >= 9216) {
        let T = 3846.329 - Math.sqrt(16762673.1 - 19684.28377 * val / 100);
        return (1.8 * T + 32.0).toFixed(2);
    } else {
        return 0;
    }
}

function toPayloadArr(tab, data) {
    let payloadArr = [];
    for (let key in data) {
        if (data.hasOwnProperty(key)) {
            let ment = {
                "MessageTab": tab,
                "MessageDateTime": data[key].ReportDateTime,
                "MessageState": data[key].ReportStateEventTxt,
                "MessageText": data[key].Text,
                "MessageType": data[key].ReportTypeTxt,
                "MessageID": data[key].ReportId,
                "MachineID": deviceInfo.machineId,
                "MachineName": deviceInfo.machineName
            }
            let tts = Date.parse(ment.MessageDateTime);
            if ((messages_mrf_ts[tab] > tts) || messages_mrf_ts[tab] == null) {
                payloadArr.push(ment);
            } else {
                break;
            }
        }
    }
    if (payloadArr.length) {
        messages_mrf_ts[tab] = Date.parse(payloadArr[0]['MessageDateTime']);
        payloadArr.forEach((e) => {
            messages_data.push(e);
        });
        console.log("Message   [" + tab + "]      Payload prepared        | [Mesg(s) added " + payloadArr.length + "].");
    } else {
        console.log("Message   [" + tab + "]     No new message(s) found | [Last saved mesg timestamp - " + messages_mrf_ts.current + "].");
    }
    return payloadArr;
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