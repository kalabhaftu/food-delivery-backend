import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
    scenarios: {
        // 1. Heavy Ramping (Previous Test)
        ramping_load: {
            executor: 'ramping-arrival-rate',
            startRate: 10,
            timeUnit: '1s',
            preAllocatedVUs: 50,
            maxVUs: 1000,
            stages: [
                { target: 500, duration: '2m' },
                { target: 500, duration: '1m' },
            ],
        },
        // 2. Sudden Spike (Test rapid resource allocation)
        spike: {
            executor: 'ramping-arrival-rate',
            startTime: '3m',
            startRate: 0,
            timeUnit: '1s',
            preAllocatedVUs: 100,
            maxVUs: 1000,
            stages: [
                { target: 1000, duration: '30s' }, // Sudden jump to 1k/s
                { target: 0, duration: '30s' },    // Drop back
            ],
        },
        // 3. Payload Stress (Test memory buffering/Vercel limits)
        payload_stress: {
            executor: 'constant-arrival-rate',
            startTime: '4m30s',
            rate: 10, // Higher payload is more expensive, so lower rate
            timeUnit: '1s',
            duration: '1m',
            preAllocatedVUs: 20,
            maxVUs: 50,
        },
    },
};

// Generate a large payload (~4MB) for stress testing
const largePayload = JSON.stringify({
    data: 'x'.repeat(4 * 1024 * 1024), // 4MB of data
});

export default function () {
    const targetUrl = __ENV.TARGET_URL || 'http://localhost:3000';
    const scenario = __ITER % 20 === 0 ? 'payload' : 'health'; // Occasionally send large payload

    if (scenario === 'payload') {
        const params = {
            headers: {
                'Content-Type': 'application/json',
            },
        };
        const res = http.post(`${targetUrl}/api/health`, largePayload, params);
        check(res, {
            'payload status is 200 or 413': (r) => r.status === 200 || r.status === 413,
        });
    } else {
        const res = http.get(`${targetUrl}/api/health`);
        check(res, {
            'health status is 200': (r) => r.status === 200,
        });
    }

    sleep(0.5);
}
