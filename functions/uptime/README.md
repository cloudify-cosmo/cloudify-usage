# Purpose

This function should be triggered by Cloudify Managers to indicate that they are still up and running.

GeoLite2 download:
wget http://geolite.maxmind.com/download/geoip/database/GeoLite2-City.tar.gz -q -O ./GeoLite2-City.tar.gz
wget http://geolite.maxmind.com/download/geoip/database/GeoLite2-Country.tar.gz -q -O ./GeoLite2-Country.tar.gz
tar -zxf ./GeoLite2-City.tar.gz --strip-components 1

## Download from https://iptoasn.com/
wget https://iptoasn.com/data/ip2asn-v4.tsv.gz -q -O ./ip2asn-v4.tsv.gz
gunzip -k ./ip2asn-v4.tsv.gz