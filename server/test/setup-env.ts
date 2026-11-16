process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://gehmeinsam:gehmeinsam@localhost:5432/gehmeinsam_test';
process.env.APP_URL = 'http://localhost:5173';
process.env.SMS_PROVIDER = 'console';
process.env.UPLOAD_DIR = '/tmp/gehmeinsam-test-uploads';
process.env.BILLING_PROVIDER = 'dev';
