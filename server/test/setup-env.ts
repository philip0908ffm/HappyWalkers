process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://happywalkers:happywalkers@localhost:5432/happywalkers_test';
process.env.APP_URL = 'http://localhost:5173';
process.env.SMS_PROVIDER = 'console';
process.env.UPLOAD_DIR = '/tmp/happywalkers-test-uploads';
process.env.BILLING_PROVIDER = 'dev';
