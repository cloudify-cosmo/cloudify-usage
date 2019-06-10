
//var Promise = require("bluebird");
const request = require('request');
var BigQuery = require('@google-cloud/bigquery');
var bigQuery = BigQuery({ projectId: 'omer-tenant' });
var geoip2 = require('geoip2');

const cloudifyIPs = ["31.168.96.38", "54.77.157.208"];


function insertData(row) {
    return new Promise(function (resolve, reject) {
        console.log(`Going to insert usage data row`)

        const datasetId = "cloudify_usage";
        const tableId = "managers_usage";
        var rows = [row];
        bigQuery
          .dataset(datasetId)
          .table(tableId)
          .insert(rows)
          .then(() => {
                console.log(`Inserted ${rows.length} rows`);
                resolve('Success!');
          })
          .catch(err => {
                if (err && err.name === 'PartialFailureError') {
                  if (err.errors && err.errors.length > 0) {
                    console.log('Inserting errors');
                    err.errors.forEach(err => console.error(err));
                  }
                } else {
                  console.error('ERROR:', err);
                }
                reject(Error("Failed to insert row data"));
          });
    });
}

function _getValue(data, key, default_value="") {
    if (!(key in data)) return default_value;
    value = data[key];
    
    // boolean value
    let isBoolean = ["true", "false", true, false].indexOf(value) >= 0;
    if (isBoolean) {
        return Boolean(value).valueOf();
    }
    // numeric integer value (not float, since version 4.4 should be a string
    let isNumeric = !isNaN(value) && String(value).indexOf(".") == -1
    if (isNumeric) {
        return parseInt(value)
    }
    // text value
    return value;
}

function getGeoLocationInfo(org, userIP) {
    return new Promise(function (resolve, reject) {
        try {
            geoip2.init('geo/GeoLite2-City.mmdb');
            geoip2.lookup(userIP, function(error, result) {
              if (error) {
                console.log("GEOIP Error: %s", error);
                resolve({});
              } else if (result) {
                console.log("GEOIP result: " + JSON.stringify(result));
                result = getGeoIpInfo(result)
                result['org'] = org;
                console.log("GEOIP slim result: " + JSON.stringify(result));
                resolve(result);
              } else {
                reject(Error("say what??"));
              }
            });
        }
        catch(err) {
            console.log(`failed to retrieve geo ip info: ${err.message}`);
            resolve({});
        }
    });
}

function getGeoIpInfo(geoIpInfo) {
    console.log("GEOIP: " + JSON.stringify(geoIpInfo));
    var country = 'country' in geoIpInfo ? geoIpInfo['country']['names']['en'] : '';
    var city = 'city' in geoIpInfo ? geoIpInfo['city']['names']['en'] : '';
    var continent = 'city' in geoIpInfo ? geoIpInfo['continent']['names']['en'] : '';
    var subdivision = 'subdivisions' in geoIpInfo ? geoIpInfo['subdivisions'][0]['names']['en'] : '';
    var timezone = 'location' in geoIpInfo ? geoIpInfo['location']['time_zone'] : '';
    if (subdivision != city) {
        var location = `${city}, ${subdivision}, ${country}`
    } else {
        var location = `${city}, ${country}`
    }
    return {country: country, city: city, location: location, subdivision: subdivision,
            continent: continent, timezone: timezone}
}

function ipToOrg(ip_addr) {
    return new Promise(function (resolve, reject) {
        try {
            console.log(`request org for ip: ${ip_addr}`)
            var headers = {'Accept': 'application/json'};
            var options = {
                url: `https://us-central1-omer-tenant.cloudfunctions.net/orginfo?ip_addr=${ip_addr}`,
                method: 'GET',
                json: true,
            };
            request(options, (err, response, body) => {
                try {
                    console.log('result: ' + JSON.stringify(body))
                    console.log('response: ' + JSON.stringify(response))
                    console.log('err: ' + err)
                    resolve(body['organization']);
                } catch (e) {
                    console.log('exception: ' + e)
                    resolve('');
                }
            })
        }
        catch(err) {
            console.log(`failed to retrieve organization info: ${err.message}`);
            resolve('');
        }
    });
}

exports.cloudifyUsage = function cloudifyUsage (req, res) {
    var body = req.body;
    var user_ip = req.headers['x-real-ip'];
    var data = JSON.parse(body['data']);
    var timestamp_sec = Math.round(new Date().getTime() / 1000);

    console.log("Headers: " + JSON.stringify(req.headers));
    console.log("Body: " + JSON.stringify(body));
    console.log("Data: " + JSON.stringify(data));
    if (cloudifyIPs.indexOf(user_ip) >= 0) {
        console.log('>>> This request comes from Cloudify ip <<<');
    }

    row_data = {}
    for (var title in data) {
        bullets = data[title];
        for (bullet in bullets) {
            let key = `${title}_${bullet}`;
            let value = data[title][bullet];
            row_data[key] = value;
        }
    }
    console.log("row_data: " + JSON.stringify(row_data));

    ipToOrg(user_ip)
    .then(organization => getGeoLocationInfo(organization, user_ip))
    .then(geoIpInfo => {
        console.log('got the geolocation info! ')
        var locationInfo = geoIpInfo;
        console.log('locationInfo: ' + JSON.stringify(locationInfo))

        var row = {
            'metadata_manager_id': _getValue(row_data, 'metadata_manager_id'),
            'system_cpu_count': _getValue(row_data, 'system_cpu_count'),
            'system_cpu_model': _getValue(row_data, 'system_cpu_model'),
            'system_redhat_os': _getValue(row_data, 'system_redhat_os'),
            'system_mem_size_gb': _getValue(row_data, 'system_mem_size_gb'),
            'system_centos_os': _getValue(row_data, 'system_centos_os'),
            'cloudify_image_info': _getValue(row_data, 'metadata_image_info'),
            'cloudify_usage_tenants_count': _getValue(row_data, 'cloudify_usage_tenants_count'),
            'cloudify_usage_users_count': _getValue(row_data, 'cloudify_usage_users_count'),
            'cloudify_usage_azure_plugin': _getValue(row_data, 'cloudify_usage_azure_plugin'),
            'cloudify_usage_aws_plugin': _getValue(row_data, 'cloudify_usage_aws_plugin'),
            'cloudify_usage_gcp_plugin': _getValue(row_data, 'cloudify_usage_gcp_plugin'),
            'cloudify_usage_executions_count': _getValue(row_data, 'cloudify_usage_executions_count'),
            'cloudify_usage_nodes_count': _getValue(row_data, 'cloudify_usage_nodes_count'),
            'cloudify_usage_node_instances_count': _getValue(row_data, 'cloudify_usage_node_instances_count'),
            'cloudify_usage_deployments_count': _getValue(row_data, 'cloudify_usage_deployments_count'),
            'cloudify_usage_secrets_count': _getValue(row_data, 'cloudify_usage_secrets_count'),
            'cloudify_usage_plugins_count': _getValue(row_data, 'cloudify_usage_plugins_count'),
            'cloudify_usage_agents_count': _getValue(row_data, 'cloudify_usage_agents_count', default_value=null),
            'cloudify_usage_compute_count': _getValue(row_data, 'cloudify_usage_compute_count', default_value=null),
            'cloudify_usage_openstack_plugin': _getValue(row_data, 'cloudify_usage_openstack_plugin'),
            'cloudify_usage_blueprints_count': _getValue(row_data, 'cloudify_usage_blueprints_count'),
            'cloudify_config_ha_enabled': _getValue(row_data, 'cloudify_config_ha_enabled', default_value=null),
            'metadata_version': _getValue(row_data, 'metadata_version'),
            'metadata_premium_edition': _getValue(row_data, 'metadata_premium_edition'),
            'cloudify_config_ldap_enabled': _getValue(row_data, 'cloudify_config_ldap_enabled'),
            'metadata_customer_id': _getValue(row_data, 'metadata_customer_id'),
            'metadata_manager_public_ip': user_ip,
            'metadata_geoip_info': locationInfo.location,
            'metadata_geoip_country': locationInfo.country,
            'metadata_geoip_city': locationInfo.city,
            'metadata_geoip_org': locationInfo.org,
            'metadata_timestamp': timestamp_sec
        };

        console.log('Creating new record');
        insertData(row)
        .then(results => {
            console.log('New record created');
            res.status(200).send(results);
        })
        .catch(err => {
            console.error('ERROR:', err);
            var result = JSON.stringify({'error': err});
            res.status(400).send(result);
          });
    });
};
