const request = require('request');
const BigQuery = require('@google-cloud/bigquery');
const bigQuery = BigQuery({ projectId: 'omer-tenant' });
const geoip2 = require('@maxmind/geoip2-node');

const cloudifyIPs = ['31.168.96.38', '54.77.157.208'];

function readData(condition) {
    return new Promise(function (resolve, reject) {
        // create read data query
        const sqlQuery = `SELECT *
            FROM cloudify_usage.managers_uptime
            WHERE ${condition}
            LIMIT 100;`;

        console.log(`Running: ${sqlQuery}`);
        // Query options list: https://cloud.google.com/bigquery/docs/reference/v2/jobs/query
        const options = {
            query: sqlQuery,
            useLegacySql: false, // Use standard SQL syntax for queries.
        };

        // Runs the query
        bigQuery
            .query(options)
            .then((results) => {
                const rows = results[0];
                console.log('Got Query Results');
                resolve(rows);
            })
            .catch((err) => {
                console.error('ERROR:', err);
                reject(Error('It broke'));
            });
    });
}

function insertData(row) {
    return new Promise(function (resolve, reject) {
        console.log(`Going to insert usage data row`);

        const datasetId = 'cloudify_usage';
        const tableId = 'managers_uptime';
        var rows = [row];
        bigQuery
            .dataset(datasetId)
            .table(tableId)
            .insert(rows)
            .then(() => {
                console.log(`Inserted ${rows.length} rows`);
                resolve('Success!');
            })
            .catch((err) => {
                if (err && err.name === 'PartialFailureError') {
                    if (err.errors && err.errors.length > 0) {
                        console.log('Inserting errors');
                        err.errors.forEach((err) => console.error(err));
                    }
                } else {
                    console.error('ERROR:', err);
                }
                reject(Error('Failed to insert row data'));
            });
    });
}

function updateData(condition, locationInfo) {
    return new Promise(function (resolve, reject) {
        var timestamp_sec = Math.round(new Date().getTime() / 1000);

        // create read data query
        const sqlQuery = `UPDATE cloudify_usage.managers_uptime
            SET latest_ack_ts_sec = ${timestamp_sec}, metadata_geoip_city = "${locationInfo.city}", metadata_geoip_country = "${locationInfo.country}", metadata_geoip_info = "${locationInfo.location}", metadata_geoip_org = "${locationInfo.org}"
            WHERE ${condition};`;

        console.log(`Running: ${sqlQuery}`);
        // Query options list: https://cloud.google.com/bigquery/docs/reference/v2/jobs/query
        const options = {
            query: sqlQuery,
            useLegacySql: false, // Use standard SQL syntax for queries.
        };

        // Runs the query
        bigQuery
            .query(options)
            .then((results) => {
                const rows = results[0];
                console.log('Updated record uptime data.');
                resolve(rows);
            })
            .catch((err) => {
                console.error(
                    `ERROR. Failed to update with ${condition}:`,
                    err
                );
                reject(Error('It broke'));
            });
    });
}

function deleteData() {
    return new Promise(function (resolve, reject) {
        // Create SQL DELETE query
        const sqlQuery = `DELETE
          FROM cloudify_usage.managers_uptime
          WHERE manager_id = '1234567';`;

        // Query options list: https://cloud.google.com/bigquery/docs/reference/v2/jobs/query
        const options = {
            query: sqlQuery,
            useLegacySql: false, // Use standard SQL syntax for queries.
        };

        // Runs the query
        bigQuery
            .query(options)
            .then((results) => {
                resolve('Success!');
            })
            .catch((err) => {
                console.error('ERROR:', err);
                reject(Error('It broke'));
            });
    });
}

/**
 * @param {string} userIP
 */
function getGeoLocationInfo(userIP) {
    return geoip2.Reader.open('geo/GeoLite2-City.mmdb')
        .then((reader) => {
            const geoipResult = reader.city(userIP);
            const subdivision = geoipResult.subdivisions?.[0].names.en ?? '';
            const country = geoipResult.country?.names.en ?? '';
            const city = geoipResult.city?.names.en ?? '';

            return {
                city,
                continent: geoipResult.continent?.names.en ?? '',
                country,
                location: [city, subdivision, country]
                    .filter((s) => s.length > 0)
                    .join(', '),
                subdivision,
                timezone: geoipResult.location?.timeZone,
            };
        })
        .catch((error) => {
            console.log('GEOIP Error: %s', error);

            if (error?.name === 'AddressNotFoundError') {
                return Promise.reject(error);
            }

            return {};
        });
}
exports.getGeoLocationInfo = getGeoLocationInfo;

function ipToOrg(ip_addr) {
    return new Promise(function (resolve, reject) {
        try {
            console.log(`request org for ip: ${ip_addr}`);
            var headers = { Accept: 'application/json' };
            var options = {
                url: `https://us-central1-omer-tenant.cloudfunctions.net/orginfo?ip_addr=${ip_addr}`,
                method: 'GET',
                json: true,
            };
            request(options, (err, response, body) => {
                try {
                    console.log('result: ' + JSON.stringify(body));
                    console.log('response: ' + JSON.stringify(response));
                    console.log('err: ' + err);
                    resolve(body['organization']);
                } catch (e) {
                    console.log('exception: ' + e);
                    resolve('');
                }
            });
        } catch (err) {
            console.log(`failed to retrieve organization info: ${err.message}`);
            resolve('');
        }
    });
}

exports.cloudifyUptime = function cloudifyUptime(req, res) {
    var body = req.body;
    var user_ip = req.headers['x-real-ip'];
    var geoIpInfo = '';

    if (cloudifyIPs.indexOf(user_ip) >= 0) {
        console.log('>>> This request comes from Cloudify ip <<<');
    }
    if (!body.hasOwnProperty('data')) {
        res.status(400).send('Bad Input');
        return;
    }
    var data = JSON.parse(body['data']);

    console.log('Headers: ' + JSON.stringify(req.headers));
    console.log('Body: ' + JSON.stringify(body));
    console.log('Data: ' + JSON.stringify(data));

    var manager_id = data['metadata']['manager_id'];
    var condition = `manager_id = '${manager_id}'`;
    console.log('Going to read Data, condition: ' + condition);

    Promise.all([
        getGeoLocationInfo(user_ip),
        ipToOrg(user_ip),
        readData(condition),
    ]).then(function (values) {
        var locationInfo = values[0];
        var org = values[1];
        var results_rows = values[2];
        locationInfo['org'] = org;

        console.log('GEOIP info: ' + JSON.stringify(locationInfo));

        if (results_rows.length > 0) {
            console.log('Updating existing record: ' + condition);
            printResults(results_rows);

            updateData(condition, locationInfo)
                .then((results) => {
                    var result = JSON.stringify({ result: '' });
                    res.status(200).send(result);
                })
                .catch((err) => {
                    console.error('ERROR:', err);
                    var result = JSON.stringify({ result: '' });
                    res.status(400).send(result);
                });
        } else {
            console.log('Creating new record');

            var timestamp_sec = Math.round(new Date().getTime() / 1000);
            var row = {
                manager_id: data['metadata']['manager_id'],
                customer_id:
                    'customer_id' in data['metadata']
                        ? data['metadata']['customer_id']
                        : null,
                version: data['metadata']['version'],
                image_info:
                    'image_info' in data['metadata']
                        ? data['metadata']['image_info']
                        : null,
                premium_edition: data['metadata']['premium_edition'],
                manager_public_ip: user_ip,
                geoip_info: locationInfo.location,
                creation_ts_sec: timestamp_sec,
                latest_ack_ts_sec: timestamp_sec,
                metadata_geoip_info: locationInfo.location,
                metadata_geoip_country: locationInfo.country,
                metadata_geoip_city: locationInfo.city,
                metadata_geoip_org: locationInfo.org,
            };

            insertData(row)
                .then((results) => {
                    var result = JSON.stringify({ result: results });
                    res.status(200).send(result);
                })
                .catch((err) => {
                    console.error('ERROR:', err);
                    var result = JSON.stringify({ result: err });
                    res.status(400).send(result);
                });
        }
    });
};

function printResults(rows) {
    rows.forEach(function (row) {
        let str = '';
        for (let key in row) {
            if (str) {
                str = `${str}\n`;
            }
            value = JSON.stringify(row[key]);
            str = `${str}${key}: ${value}`;
        }
        console.log('>> ' + str);
    });
}
