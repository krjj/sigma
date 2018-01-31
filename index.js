const cons = require('constants');

const childproc = require('child_process');
const shell = require('shelljs');
const process = require('process');
const config = require('./config');
const path = require('path');
const os = require('os');
const fs = require('fs');

//init 
var ssi = null,
    idm = null;

var verbosity = 'ignore';

let sdirpath = path.join(os.homedir(), '.sigma');

if (fs.existsSync(sdirpath) == false) {
    fs.mkdirSync(path.join(os.homedir(), '.sigma'));
}


if (process.argv[2] == '-verbose') {
    verbosity = 'inherit';
} else if (process.argv[2] == undefined) {

} else {
    console.error('Invalid arg');
    process.exit();
}

//console.log(fs.readdirSync(__dirname));

//


const version = shell.exec(config.brwExecPath + ' -version', {
    silent: true
}).stdout;


if (/Chromium 62.0/i.test(version)) {
    console.log('Browser version check test. [PASSED]\nVerbosity ' + verbosity + '.\nSigma Control 2 monitoring started.');

    startMonitor(2);



} else {
    console.log('Browser version check test failed. Install correct version (Chromium v62) . [FAILED]');
}



function addDelay(ms) {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            resolve()
        }, ms);
    })
}

async function startMonitor(arg) {

    if (arg == 0 || arg == 2) {
        //start system status monitor
        let ssi = childproc.spawn(process.argv[0], [path.join(__dirname, 'systatus.js')], {
            stdio: verbosity
        });

        ssi.on('close', async () => {
            console.log('\n+ System Status monitor stopped.');
            ssi.removeAllListeners();
            ssi = null;
            console.log('* Restarting system monitor after 30 secs\n');
            await addDelay(30000);
            startMonitor(0);
        });
    }

    if (arg == 1 || arg == 2) {
        //start IO Display and Msg monitor
        idm = childproc.spawn(process.argv[0], [path.join(__dirname, 'iodisplayMsg.js')], {
            stdio: verbosity
        });
        idm.on('close', async () => {
            console.log('\n+ IO Display and Messages monitor stopped.');
            idm.removeAllListeners();
            idm = null;
            console.log('* Restarting IO Display and Messages monitor after 30 secs\n');
            await addDelay(30000);
            startMonitor(1);
        })
    }


}


process.on('beforeExit', () => {
    if (ssi != null) {
        ssi.kill(cons.SIGINT);
    }
    if (idm != null) {
        idm.kill(cons.SIGINT);
    }
});