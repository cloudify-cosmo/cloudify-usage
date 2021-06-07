const { getGeoLocationInfo } = require('./index');

describe('getGeoLocationInfo', () => {
    // NOTE: some random IP addresses
    const ipsToResolveCorrectly = [
        '212.180.218.141',
        '3.45.34.252',
        '90.251.171.80',
        '212.82.41.93',
        '157.69.217.108',
    ];

    ipsToResolveCorrectly.forEach((ip) => {
        it(`should resolve IP information for ${ip}`, async () => {
            expect(await getGeoLocationInfo(ip)).toMatchSnapshot();
        });
    });

    it('should report an unknown problem for some problematic IP', () => {
        return expect(
            getGeoLocationInfo('248.47.119.137')
        ).rejects.toThrowError();
    });

    it('should report an empty result when the IP cannot be matched', async () => {
        expect(await getGeoLocationInfo('248.')).toStrictEqual({});
    });
});
