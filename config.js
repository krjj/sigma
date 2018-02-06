module.exports = {
    "login": {
        "username": "admin123",
        "password": "admin123"
    },
    "brwExecPath": "puppeteer/linux-497674/chrome-linux/chrome",
    "selectors": {
        "LOGIN_USER_NAME": "input[type=\"text\"]",
        "LOGIN_PASSWORD": "input[type=\"password\"]",
        "LOGIN_BUTTON": "button",
        "DASHBOARD_SYSTEM_STATUS": "#div_link_system_status",
        "IODISPLAY": "#div_link_io_display",
        "LOGOUT_BUTTON": "#div_link_logout",
        "MESSAGES": "#div_link_system_data",
        "MESSAGES_COMPRESSOR": "#div_link_system_data_compressor",
        "MESSAGES_SYSTEM": "#div_link_system_data_system",
        "MESSAGES_DIAGNOSIS": "#div_link_system_data_diagnose"
    },
    "pollFrequencySYSTAT": 1000,
    "pollFrequencyIOM2": 60000,
    "pollFrequencyMESG": 30000,
    "failureDelay": 5000,
    "sendEndpoint": {
        "url": "http://kaeser.appsmith.co.in/api/Reports/SaveSystemData",
        "method": "POST"
    },
    "sendEndpointMESG": {
        "url": "http://kaeser.appsmith.co.in/api/CurrentMessages/SaveMessages",
        "method": "POST"
    },
    "sendEndpointIOM2": {
        "url": "http://kaeser.appsmith.co.in/api/Reports/SaveIODisplayData",
        "method": "POST"
    },
    "getEndpoint": {
        "host": "http://103.7.83.35",
        "path": "json.json"
    },
    "networkOutageMs": 60000
}