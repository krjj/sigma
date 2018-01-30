var inquirer = require('inquirer');
var validator = require('validator');
var fs = require('fs');
var configfile = require('./config');
var JavaScriptObfuscator = require('javascript-obfuscator');
var path = require('path');
const {
    exec
} = require('pkg');
var shell = require('shelljs');

var questions = [{
        type: 'input',
        name: 'user_id',
        message: "Sigma Control 2 User ID",
        default: function () {
            return 'admin123';
        }
    },
    {
        type: 'input',
        name: 'password',
        message: "Sigma Control 2 User ID",
        default: function () {
            return 'admin123';
        }
    },
    {
        type: 'input',
        name: 'polling_freq_systat',
        message: "Polling frequency for System Status (in msecs)",
        default: function () {
            return 1000;
        },
        validate: function (value) {
            var pass = /^[0-9]+$/.test(value);
            if (pass) {
                return true;
            }

            return 'Enter a number';
        }
    },
    {
        type: 'input',
        name: 'polling_freq_mseg',
        message: "Polling frequency for Messages (in msecs)",
        default: function () {
            return 30000;
        },
        validate: function (value) {
            var pass = /^[0-9]+$/.test(value);
            if (pass) {
                return true;
            }

            return 'Enter a number';
        }
    },
    {
        type: 'input',
        name: 'polling_freq_iom2',
        message: "Polling frequency for IOM2 (2.00 2.01 2.02) (in msecs)",
        default: function () {
            return 60000;
        },
        validate: function (value) {
            var pass = /^[0-9]+$/.test(value);
            if (pass) {
                return true;
            }

            return 'Enter a number';
        }
    },
    {
        type: 'input',
        name: 'delay_on500',
        message: "Delay when server responds back with HTTP 500 STATUS CODE (in msecs)",
        default: function () {
            return 5000;
        },
        validate: function (value) {
            var pass = /^[0-9]+$/.test(value);
            if (pass) {
                return true;
            }
            return 'Enter a number';
        }
    },
    {
        type: 'input',
        name: 'delay_outage',
        message: "Network outage delay (monitor will restart itself when no activity is detect)",
        default: function () {
            return 60000;
        },
        validate: function (value) {
            var pass = /^[0-9]+$/.test(value);
            if (pass) {
                return true;
            }
            return 'Enter a number';
        }
    },
    {
        type: 'input',
        name: 'sigma_url',
        message: "Sigma Control 2 website url",
        default: function () {
            return "http://103.7.83.35";
        },
        validate: function (value) {
            var pass = validator.isURL(value, {
                protocols: ['http', 'https'],
                allow_protocol_relative_urls: false
            })

            if (pass) {
                if (!/\/$/.test(value)) {
                    return true;
                }
            }

            return 'Enter valid URL (should not end with /)';
        }
    },
    {
        type: 'input',
        name: 'sigma_systat_url',
        message: "Save system status data api endpoint",
        default: function () {
            return "http://kaeser.appsmith.co.in/api/Reports/SaveSystemData";
        },
        validate: function (value) {
            var pass = validator.isURL(value, {
                protocols: ['http', 'https'],
                allow_protocol_relative_urls: false
            })

            if (pass) {
                if (!/\/$/.test(value)) {
                    return true;
                }
            }

            return 'Enter valid URL (should not end with /)';
        }
    },
    {
        type: 'input',
        name: 'sigma_mesg_url',
        message: "Save messages data api endpoint",
        default: function () {
            return "http://kaeser.appsmith.co.in/api/CurrentMessages/SaveMessages";
        },
        validate: function (value) {
            var pass = validator.isURL(value, {
                protocols: ['http', 'https'],
                allow_protocol_relative_urls: false
            })

            if (pass) {
                if (!/\/$/.test(value)) {
                    return true;
                }
            }

            return 'Enter valid URL (should not end with /)';
        }
    },
];


questions2 = [{
    type: 'list',
    name: 'scp',
    message: "How do you want to protect source code",
    choices: ['Compile source code using Zeit Pkg (recommended)', 'Code Obfuscation']
}]


inquirer.prompt(questions2).then(async (answers2) => {
    inquirer.prompt(questions).then(async (answers) => {
        console.log('\nAnswers captured.\nUpdating config file.');

        //modify config based on answers
        configfile.login.username = answers.user_id;
        configfile.login.password = answers.password;
        configfile.pollFrequencySYSTAT = answers.polling_freq_systat;
        configfile.pollFrequencyMESG = answers.polling_freq_mseg;
        configfile.pollFrequencyIOM2 = answers.polling_freq_iom2;
        configfile.failureDelay = answers.delay_on500;
        configfile.networkOutageMs = answers.delay_outage;
        configfile.getEndpoint.host = answers.sigma_url;
        configfile.sendEndpoint.url = answers.sigma_systat_url;
        configfile.sendEndpointMESG.url = answers.sigma_mesg_url;

        if (process.arch == 'arm') {
            configfile.brwExecPath = "chromium-browser";
        } else {
            configfile.brwExecPath = path.join("puppeteer/linux-497674/chrome-linux", "chrome");
        }

        if (answers2.scp == 'Code Obfuscation') {


            // obfuscate index.js
            var index = fs.readFileSync('./index.js', 'utf8');
            index = index.replace("require('./config');", "require('./obf_config');");
            index = index.replace("'systatus.js'", "'obf_systatus.js'");
            index = index.replace("'iodisplayMsg.js'", "'obf_iodisplayMsg.js'");
            var obf_index = JavaScriptObfuscator.obfuscate(index, {
                compact: false,
                controlFlowFlattening: true,
                log: true,
                target: 'node'
            });
            fs.writeFileSync('obf_index.js', obf_index);

            // obfuscate systatus.js
            var systatus = fs.readFileSync('./systatus.js', 'utf8');
            systatus = systatus.replace("require('./config');", "require('./obf_config');");
            var obf_systatus = JavaScriptObfuscator.obfuscate(systatus, {
                compact: false,
                controlFlowFlattening: true,
                log: true,
                target: 'node'
            });
            fs.writeFileSync('obf_systatus.js', obf_systatus);

            // obfuscate iodisplayMsg.js
            var iodisplayMsg = fs.readFileSync('./iodisplayMsg.js', 'utf8');
            iodisplayMsg = iodisplayMsg.replace("require('./config');", "require('./obf_config');");
            var obf_iodisplayMsg = JavaScriptObfuscator.obfuscate(iodisplayMsg, {
                compact: false,
                controlFlowFlattening: true,
                log: true,
                target: 'node'
            });
            fs.writeFileSync('obf_iodisplayMsg.js', obf_iodisplayMsg);

            // Prepare config file and obfuscate
            fs.writeFileSync("obf_config.js", "module.exports = " + JSON.stringify(configfile));

            // obfuscate config.js
            var config = fs.readFileSync('./obf_config.js', 'utf8');
            var obf_config = JavaScriptObfuscator.obfuscate(config, {
                compact: true,
                controlFlowFlattening: true,
                identifierNamesGenerator: 'hexadecimal',
                log: true,
                target: 'node',
                rotateStringArray: true,
                selfDefending: true,
                stringArray: true,
            });
            fs.writeFileSync('obf_config.js', obf_config);


            console.log('\nCode obfuscated - copy everything except [index.js,systatus.js,iodisplayMsg.js,config.js] to target device.\n');

        } else {
            console.log('\nBuilding binary file');
            fs.writeFileSync("config.js", "module.exports = " + JSON.stringify(configfile));
            if (process.arch == 'arm') {
                await exec(['index.js', '--target', 'node8-linux-armv7', '--output', 'sigma']);
                console.log('\nCopy created executable file - [sigma] to target device.\nThis binary will run on linux ARMv7 platform.\n');
            } else {
                shell.exec('cp -R ./node_modules/puppeteer/.local-chromium ./puppeteer');
                await exec(['index.js', '--target', 'host', '--output', 'sigma']);
                console.log('\nCopy created executable file - [sigma] to target device along with puppeteer folder.');
                console.log('This binary will run on ' + require('os').platform + ' ' + process.arch + ' platform.\n');
            }
        }
    });
});