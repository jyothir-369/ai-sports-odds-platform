const axios = require('axios');

const rawAiBaseUrl = (process.env.AI_SERVICE_URL || process.env.PYTHON_SERVICE_URL || '').trim();

const aiBaseUrl = (() => {
  if (!rawAiBaseUrl) {
    return '';
  }

  const withProtocol = /^https?:\/\//i.test(rawAiBaseUrl) ? rawAiBaseUrl : `https://${rawAiBaseUrl}`;
  return withProtocol.replace(/\/$/, '');
})();

if (!aiBaseUrl) {
  throw new Error('Set AI_SERVICE_URL (or PYTHON_SERVICE_URL) for backend to reach the Python service.');
}

async function generateOdds(payload) {
  const response = await axios.post(`${aiBaseUrl}/generate-odds`, payload);
  return response.data;
}

async function generateOddsBatch(matches) {
  const response = await axios.post(`${aiBaseUrl}/generate-odds-batch`, { matches });
  return response.data;
}

async function getOddsPrediction(featurePayload) {
  const response = await axios.post(`${aiBaseUrl}/odds`, featurePayload);

  return response.data;
}

async function getPredictionExplanation(explainPayload) {
  const response = await axios.post(`${aiBaseUrl}/explain`, {
    ...explainPayload
  });

  return response.data;
}

module.exports = {
  generateOdds,
  generateOddsBatch,
  getOddsPrediction,
  getPredictionExplanation
};
