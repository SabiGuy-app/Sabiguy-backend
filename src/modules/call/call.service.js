const axios = require('axios');

async function getIceServers() {
  const appDomain = process.env.METERED_APP_DOMAIN;
  const apiKey = process.env.METERED_API_KEY;

  if (!appDomain || !apiKey) {
    console.warn('TURN credentials are not configured, falling back to STUN only.');
    return [{ urls: 'stun:stun.l.google.com:19302' }];
  }

  try {
    const response = await axios.get(
      `https://${appDomain}/api/v1/turn/credentials?apiKey=${apiKey}`
    );

    console.log('TURN raw response:', response.data);

    const iceServers = Array.isArray(response.data)
      ? response.data
      : response.data?.iceServers || response.data;

    console.log('TURN servers fetched:', iceServers);

    const hasTurnUrls = Array.isArray(iceServers)
      && iceServers.some((server) => {
        const urls = Array.isArray(server?.urls) ? server.urls : [server?.urls];
        return urls.some((url) => typeof url === 'string' && url.startsWith('turn:'));
      });

    if (!hasTurnUrls) {
      console.warn('TURN check failed: response does not contain any turn: URLs.');
    }

    return iceServers;
  } catch (error) {
    console.error('Error fetching ICE servers:', error.message);
    return [{ urls: 'stun:stun.l.google.com:19302' }];
  }
}

module.exports = { getIceServers };
