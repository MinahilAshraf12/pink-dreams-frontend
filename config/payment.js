const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const paypal = require('@paypal/checkout-server-sdk');

// PayPal Environment Configuration
function paypalEnvironment() {
    const clientId = process.env.PAYPAL_CLIENT_ID;
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
    
    // Use sandbox or live environment based on NODE_ENV
    return process.env.NODE_ENV === 'production'
        ? new paypal.core.LiveEnvironment(clientId, clientSecret)
        : new paypal.core.SandboxEnvironment(clientId, clientSecret);
}

// PayPal Client
function paypalClient() {
    return new paypal.core.PayPalHttpClient(paypalEnvironment());
}

module.exports = { stripe, paypal, paypalClient };