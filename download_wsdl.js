const http = require('http');
const fs = require('fs');

const url = 'http://smeapps.mobitel.lk:8585/EnterpriseSMS/EnterpriseSMSWS.wsdl';
const file = fs.createWriteStream("wsdl_dump.xml");

http.get(url, function (response) {
    response.pipe(file);
    file.on('finish', function () {
        file.close(() => console.log('Download complete.'));
    });
});
