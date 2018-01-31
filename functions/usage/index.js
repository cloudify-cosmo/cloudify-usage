
var Promise = require("bluebird");
var BigQuery = require('@google-cloud/bigquery');
var bigQuery = BigQuery({ projectId: 'omer-tenant' });

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


function _geoIP(ip_addr) {
    if (cloudifyIPs.indexOf(ip_addr) >= 0) {
        return JSON.stringify({organization: 'cloudify'});
    }
    return '';
}

function _getValue(data, key) {
    let value = key in data ? data[key] : '';
    // empty value
    if (value === '') {
        return "";
    }
    // boolean value
    let isBoolean = ["true", "false", true, false].indexOf(value) >= 0;
    if (isBoolean) {
        return Boolean(value).valueOf();
    }
    // numeric value
    let isNumeric = !isNaN(value)
    if (isNumeric) {
        return parseInt(value)
    }
    // text value
    return value;
}

exports.cloudifyUsage = function cloudifyUptime (req, res) {
    var body = req.body;
    var user_ip = req.headers['x-forwarded-for'];
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
            console.log("Adding Data: " + JSON.stringify(data));
            console.log(`Adding ${key}: ${row_data[key]}`)
        }
    }
    console.log("row_data: " + JSON.stringify(row_data));

    var row = {
        'metadata_manager_id': _getValue(row_data, 'metadata_manager_id'),
        'system_cpu_count': _getValue(row_data, 'system_cpu_count'),
        'system_redhat_os': _getValue(row_data, 'system_redhat_os'),
        'system_mem_size_gb': _getValue(row_data, 'system_mem_size_gb'),
        'system_centos_os': _getValue(row_data, 'system_centos_os'),
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
        'cloudify_usage_openstack_plugin': _getValue(row_data, 'cloudify_usage_openstack_plugin'),
        'cloudify_usage_blueprints_count': _getValue(row_data, 'cloudify_usage_blueprints_count'),
        'cloudify_config_ha_enabled': _getValue(row_data, 'cloudify_config_ha_enabled'),
        'metadata_version': _getValue(row_data, 'metadata_version'),
        'metadata_premium_edition': _getValue(row_data, 'metadata_premium_edition'),
        'cloudify_config_ldap_enabled': _getValue(row_data, 'cloudify_config_ldap_enabled'),
        'metadata_manager_public_ip': user_ip,
        'metadata_geoip_info': _geoIP(user_ip),
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
};
