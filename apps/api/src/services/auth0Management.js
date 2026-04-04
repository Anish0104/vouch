let managementClient = null;
let managementClientFactory = null;

function createManagementClient() {
  if (managementClientFactory) {
    return managementClientFactory();
  }

  const { ManagementClient } = require('auth0');
  return new ManagementClient({
    domain: process.env.AUTH0_DOMAIN,
    clientId: process.env.AUTH0_MGMT_CLIENT_ID,
    clientSecret: process.env.AUTH0_MGMT_CLIENT_SECRET,
  });
}

function getManagementClient() {
  if (!managementClient) {
    managementClient = createManagementClient();
  }

  return managementClient;
}

function setManagementClientFactoryForTests(factory) {
  managementClientFactory = factory;
  managementClient = null;
}

function resetManagementClientForTests() {
  managementClientFactory = null;
  managementClient = null;
}

module.exports = {
  getManagementClient,
  resetManagementClientForTests,
  setManagementClientFactoryForTests,
};
