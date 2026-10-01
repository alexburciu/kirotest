import { http, HttpResponse } from 'msw'

// Default API handlers — each feature's tests can override these
export const handlers = [
  http.get('/api/triggers', () => {
    return HttpResponse.json([])
  }),

  http.get('/api/campaigns', () => {
    return HttpResponse.json({ data: [], total: 0, page: 1, pageSize: 25 })
  }),

  http.get('/api/stats', () => {
    return HttpResponse.json({
      activeCampaigns: 0,
      sentToday: 0,
      resolvedToday: 0,
      failedToday: 0,
      deliveryRateHistory: [],
    })
  }),

  http.get('/api/providers', () => {
    return HttpResponse.json({
      activeProvider: 'twilio',
      twilio: {
        accountSid: '••••••••••••••••••••••••••••••••••',
        authToken: '••••••••••••••••••••••••••••••••',
        fromNumber: '+15550000000',
      },
      awsSns: {
        accessKeyId: '••••••••••••••••••••',
        secretAccessKey: '••••••••••••••••••••••••••••••••••••••••',
        region: 'us-east-1',
        topicArn: '',
      },
    })
  }),
]
