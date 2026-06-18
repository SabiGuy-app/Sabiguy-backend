const axios = require('axios');

async function getIceServers () {
    try {
        const response = await axios.get (
         `https://${process.env.METERED_APP_DOMAIN}/api/v1/turn/credentials?apiKey=${process.env.METERED_API_KEY}` 
        );
        return response.data;
    } catch (error) {
        console.error('Error fetching ICE servers:', error.message);
    return [{ urls: "stun:stun.l.google.com:19302" }];
    }
}

module.exports = { getIceServers };