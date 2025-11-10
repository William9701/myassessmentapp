const { createHandler } = require('@app-core/server');
const { appLogger } = require('@app-core/logger');
const paymentInstructionsService = require('@app/services/onboarding/payment-instructions');

module.exports = createHandler({
  path: '/payment-instructions',
  method: 'post',
  middlewares: [],
  async onResponseEnd(rc, rs) {
    appLogger.info({ requestContext: rc, response: rs }, 'payment-instructions-request-completed');
  },
  async handler(rc, helpers) {
    const payload = rc.body;

    const response = await paymentInstructionsService(payload);

    return {
      status: response.httpStatus || helpers.http_statuses.HTTP_200_OK,
      data: response.data,
    };
  },
});
