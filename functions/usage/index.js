const request = require('request');
const BigQuery = require('@google-cloud/bigquery');
const bigQuery = BigQuery({ projectId: 'omer-tenant' });
const geoip2 = require('@maxmind/geoip2-node');

const cloudifyIPs = ['31.168.96.38', '54.77.157.208'];

function insertData(row) {
    return new Promise(function (resolve, reject) {
        console.log(`Going to insert usage data row`);

        const datasetId = 'cloudify_usage';
        const tableId = 'managers_usage';
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

function _getValue(data, key, default_value = '') {
    if (!(key in data)) return default_value;
    value = data[key];

    // object (dict or list) value
    if (value !== undefined && value !== null && typeof value == 'object') {
        return JSON.stringify(value);
    }

    // boolean value
    let isBoolean = ['true', 'false', true, false].indexOf(value) >= 0;
    if (isBoolean) {
        return Boolean(value).valueOf();
    }
    // numeric integer value (not float, since version 4.4 should be a string
    let isNumeric = !isNaN(value) && String(value).indexOf('.') == -1;
    if (isNumeric) {
        return parseInt(value);
    }
    // text value
    return value;
}

/**
 * @param {string} org
 * @param {string} userIP
 */
function getGeoLocationInfo(org, userIP) {
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
                org,
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

exports.cloudifyUsage = function cloudifyUsage(req, res) {
    var body = req.body;
    var user_ip = req.headers['x-real-ip'];
    var data = JSON.parse(body['data']);
    var timestamp_sec = Math.round(new Date().getTime() / 1000);

    console.log('Headers: ' + JSON.stringify(req.headers));
    console.log('Body: ' + JSON.stringify(body));
    console.log('Data: ' + JSON.stringify(data));
    if (cloudifyIPs.indexOf(user_ip) >= 0) {
        console.log('>>> This request comes from Cloudify ip <<<');
    }

    row_data = {};
    for (var title in data) {
        bullets = data[title];
        for (bullet in bullets) {
            let key = `${title}_${bullet}`;
            let value = data[title][bullet];
            row_data[key] = value;
        }
    }
    console.log('row_data: ' + JSON.stringify(row_data));

    ipToOrg(user_ip)
        .then((organization) => getGeoLocationInfo(organization, user_ip))
        .then((geoIpInfo) => {
            console.log('got the geolocation info! ');
            var locationInfo = geoIpInfo;
            console.log('locationInfo: ' + JSON.stringify(locationInfo));

            var row = {
                metadata_manager_id: _getValue(row_data, 'metadata_manager_id'),
                system_cpu_count: _getValue(row_data, 'system_cpu_count'),
                system_cpu_model: _getValue(row_data, 'system_cpu_model'),
                system_redhat_os: _getValue(row_data, 'system_redhat_os'),
                system_mem_size_gb: _getValue(row_data, 'system_mem_size_gb'),
                system_centos_os: _getValue(row_data, 'system_centos_os'),
                cloudify_image_info: _getValue(row_data, 'metadata_image_info'),
                cloudify_usage_tenants_count: _getValue(
                    row_data,
                    'cloudify_usage_tenants_count'
                ),
                cloudify_usage_users_count: _getValue(
                    row_data,
                    'cloudify_usage_users_count'
                ),
                cloudify_usage_users_by_role: _getValue(
                    row_data,
                    'cloudify_usage_users_by_role',
                    (default_value = null)
                ),
                cloudify_usage_azure_plugin: _getValue(
                    row_data,
                    'cloudify_usage_azure_plugin'
                ),
                cloudify_usage_aws_plugin: _getValue(
                    row_data,
                    'cloudify_usage_aws_plugin'
                ),
                cloudify_usage_gcp_plugin: _getValue(
                    row_data,
                    'cloudify_usage_gcp_plugin'
                ),
                cloudify_usage_executions_count: _getValue(
                    row_data,
                    'cloudify_usage_executions_count'
                ),
                cloudify_usage_executions_succeeded: _getValue(
                    row_data,
                    'cloudify_usage_executions_succeeded',
                    (default_value = null)
                ),
                cloudify_usage_executions_failed: _getValue(
                    row_data,
                    'cloudify_usage_executions_failed',
                    (default_value = null)
                ),
                cloudify_usage_executions_by_type: _getValue(
                    row_data,
                    'cloudify_usage_executions_by_type',
                    (default_value = null)
                ),
                cloudify_usage_nodes_count: _getValue(
                    row_data,
                    'cloudify_usage_nodes_count'
                ),
                cloudify_usage_nodes_by_type: _getValue(
                    row_data,
                    'cloudify_usage_nodes_by_type',
                    (default_value = null)
                ),
                cloudify_usage_node_instances_count: _getValue(
                    row_data,
                    'cloudify_usage_node_instances_count'
                ),
                cloudify_usage_deployments_count: _getValue(
                    row_data,
                    'cloudify_usage_deployments_count'
                ),
                cloudify_usage_environments_count: _getValue(
                    row_data,
                    'cloudify_usage_environments_count',
                    (default_value = null)
                ),
                cloudify_usage_secrets_count: _getValue(
                    row_data,
                    'cloudify_usage_secrets_count'
                ),
                cloudify_usage_sites_count: _getValue(
                    row_data,
                    'cloudify_usage_sites_count',
                    (default_value = null)
                ),
                cloudify_usage_plugins_count: _getValue(
                    row_data,
                    'cloudify_usage_plugins_count'
                ),
                cloudify_usage_agents_count: _getValue(
                    row_data,
                    'cloudify_usage_agents_count',
                    (default_value = null)
                ),
                cloudify_usage_compute_count: _getValue(
                    row_data,
                    'cloudify_usage_compute_count',
                    (default_value = null)
                ),
                cloudify_usage_openstack_plugin: _getValue(
                    row_data,
                    'cloudify_usage_openstack_plugin'
                ),
                cloudify_usage_blueprints_count: _getValue(
                    row_data,
                    'cloudify_usage_blueprints_count'
                ),
                cloudify_usage_first_login: _getValue(
                    row_data,
                    'cloudify_usage_first_login',
                    (default_value = null)
                ),
                cloudify_usage_last_login: _getValue(
                    row_data,
                    'cloudify_usage_last_login',
                    (default_value = null)
                ),
                cloudify_config_ha_enabled: _getValue(
                    row_data,
                    'cloudify_config_ha_enabled',
                    (default_value = null)
                ),
                metadata_version: _getValue(row_data, 'metadata_version'),
                metadata_premium_edition: _getValue(
                    row_data,
                    'metadata_premium_edition'
                ),
                cloudify_config_ldap_enabled: _getValue(
                    row_data,
                    'cloudify_config_ldap_enabled'
                ),
                metadata_customer_id: _getValue(
                    row_data,
                    'metadata_customer_id'
                ),
                metadata_manager_public_ip: user_ip,
                metadata_geoip_info: locationInfo.location,
                metadata_geoip_country: locationInfo.country,
                metadata_geoip_city: locationInfo.city,
                metadata_geoip_org: locationInfo.org,
                metadata_timestamp: timestamp_sec,
            };

            console.log('Creating new record');
            insertData(row)
                .then((results) => {
                    console.log('New record created');
                    res.status(200).send(results);
                })
                .catch((err) => {
                    console.error('ERROR:', err);
                    var result = JSON.stringify({ error: err });
                    res.status(400).send(result);
                });
        });
};
