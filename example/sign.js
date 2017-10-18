const BankID = require('../BankID');
const config = {
    passphrase: 'qwerty123',
    pfx: 'FPTestcert2_20150818_102329.pfx',
    test: true,
};

const bankid = new BankID(config);
let timer = null;
bankid.on('connecting', function () {
    console.log('Try to connect to BankID...');
});

bankid.on('connected', function () {
    console.log('Connection success!');
    bankid.Sign({ personalNumber: 'yyyymmddxxxx', userVisibleData: 'The user sign message' });
    timer = setInterval(function(){},10000);
});

bankid.on('error', function (err) {
    console.log('error');
    console.error(err);
    clearInterval(timer);
});

bankid.on('complete', function (data) {
    console.log('Hello, ' + data.userInfo.name + '!');
    console.log('You have successfully signed the request');
    clearInterval(timer);
});

