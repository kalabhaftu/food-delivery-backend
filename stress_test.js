import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
    scenarios: {
        ramping_arrival_rate: {
            executor: 'ramping-arrival-rate',
            startRate: 10,
            timeUnit: '1s',
            preAllocatedVUs: 10,
            maxVUs: 1000,
            stages: [
                { target: 500, duration: '5m' }, // Ramp up to 500 iterations/s over 5 minutes
                { target: 500, duration: '2m' }, // Hold at 500 iterations/s for 2 minutes
            ],
        },
    },
};

export default function () {
    const targetUrl = __ENV.TARGET_URL || 'http://localhost:3000';
    const res = http.get(`${targetUrl}/api/health`); // Check health endpoint
    check(res, {
        'status is 200': (r) => r.status === 200,
    });
    sleep(1);
}
